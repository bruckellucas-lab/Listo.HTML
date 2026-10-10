"use strict";
var test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), crypto = require("node:crypto");
var h = require("./helpers"), auth = require("../api/_lib/admin-auth"), commercial = require("../api/_lib/commercial-state"), inquiries = require("../api/_lib/inquiries"), notify = require("../api/_lib/notify"), proposals = require("../api/_lib/proposals"), rate = require("../api/_lib/rate-limit"), turnstile = require("../api/_lib/turnstile");
var ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
process.env.SUPABASE_URL = "https://test.invalid"; process.env.SUPABASE_SECRET_KEY = "fake"; process.env.ADMIN_PASSWORD = "local-recovery-password-123456";
async function call(file, method, body, admin) {
  var res = h.fakeRes();
  await require("../api/" + file)(h.fakeReq(method, Object.assign({"content-type":"application/json"}, admin ? {cookie:auth.sessionCookie().split(";")[0],"x-listo-admin":"1"} : {}), body), res);
  return res;
}
function client(storage) {
  var root = {crypto:crypto.webcrypto, sessionStorage:{getItem:k=>storage[k], setItem:(k,v)=>storage[k]=v}};
  vm.runInNewContext(fs.readFileSync(h.ROOT + "/recovery.js","utf8"), {window:root, TextEncoder:TextEncoder, Uint8Array:Uint8Array});
  return root.ListoRecovery;
}
test("S2B-3 cliente: ID estable sobre refresh; no guarda PII, tokens ni formularios", async function () {
  var storage = {}, a = client(storage);
  var payload = {contact:"persona privada", notes:"comentario privado", expected_status:"quoted"};
  var first = await a.operation("confirm:"+ID,payload);
  assert.equal(await client(storage).operation("confirm:"+ID,payload),first);
  assert.notEqual(await a.operation("confirm:"+ID,{expected_status:"confirmed"}),first);
  assert.doesNotMatch(JSON.stringify(storage),/persona privada|comentario privado|expected_status/);
});
test("S2B-3 cliente: storage bloqueado conserva el ID en memoria", async function () {
  var root={crypto:crypto.webcrypto,sessionStorage:{getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("blocked");}}};
  vm.runInNewContext(fs.readFileSync(h.ROOT+"/recovery.js","utf8"),{window:root,TextEncoder:TextEncoder,Uint8Array:Uint8Array});
  assert.equal(await root.ListoRecovery.operation("x",{a:1}),await root.ListoRecovery.operation("x",{a:1}));
});
test("S2B-3 comercial: replay devuelve resultado actual; pestaña vieja no escribe", async function (t) {
  var count=0;
  t.mock.method(global,"fetch",async (url,opts)=>{count++; assert.match(url,/rpc\/listo_recover_commercial$/); assert.equal(JSON.parse(opts.body).p_operation_id,OP); return h.response(200,{ok:true,already_applied:true,item:{id:ID,status:"completed"}});});
  var cfg={url:process.env.SUPABASE_URL,key:"fake"};
  assert.equal((await commercial.run(cfg,"transition",ID,"confirmed",{status:"completed"},OP))[1].already_applied,true);
  assert.equal((await commercial.run(cfg,"transition",ID,"confirmed",{status:"completed"}))[0],400);
  assert.equal(count,1);
});
test("S2B-3 cancelar ya aplicada llega a RPC de recuperación, sin rechazar antes",async function(t){
  var calls=[];t.mock.method(global,"fetch",async(url)=>{calls.push(url);return /rpc\//.test(url)?h.response(200,{ok:true,already_applied:true,item:{status:"cancelled"},booking:{id:ID,booking_status:"cancelled"}}):h.response(200,[{id:ID,plan_inquiry_id:ID,booking_status:"cancelled"}]);});
  var res=await call("admin-bookings.js","PATCH",{booking_id:ID,action:"cancel",expected_status:"confirmed",operation_id:OP},true);
  assert.equal(res.statusCode,200);assert.equal(res.json().already_applied,true);assert.equal(calls.length,2);
});
test("S2B-3 inquiry guardada + email fallido: éxito con warning; replay no envía email",async function(t){
  t.mock.method(rate,"guard",async()=>true);t.mock.method(turnstile,"verify",async()=>({ok:true}));
  var replay=false,emails=0;
  t.mock.method(inquiries,"saveInquiry",async()=>({selectionId:ID,inquiryId:ID,status:"provider_contacted",updated:false,notify:!replay,already_applied:replay}));
  t.mock.method(notify,"notifyInquiry",async()=>{emails++;return false;});
  var day=new Date(Date.now()+864e5).toISOString().slice(0,10),body={event_request_id:ID,google_place_id:"ChIJabcdefghij0001",name:"Ana",phone:"11111111",event_date:day,approximate_time:"20:00",operation_id:OP,selection_id:ID};
  var first=await call("plan-inquiry.js","POST",body);
  assert.equal(first.statusCode,200);assert.match(first.json().warning,/guardada/);assert.equal(first.json().status,"provider_contacted");
  replay=true;var second=await call("plan-inquiry.js","POST",body);assert.equal(second.statusCode,200);assert.equal(second.json().already_applied,true);assert.equal(emails,1);
});
test("S2B-3 respuesta pública guardada: no relee; email fallido/throw es warning, replay no repite",async function(t){
  t.mock.method(rate,"guard",async()=>true);t.mock.method(console,"error",()=>{});
  for(var action of ["accept","decline"]){
    var row={id:ID,plan_inquiry_id:ID,status:"proposal_sent",provider_quotes:{availability:"yes",currency:"ARS",total_price:1000},plan_inquiries:{plan_selections:{provider_google_place_id:"ChIJabcdefghij0001"}}},reads=0,emails=0,writes=0;
    t.mock.method(proposals,"loadByCode",async()=>{reads++;if(reads>1&&row.status==="proposal_sent")throw Error("relectura secundaria falló");return row;});
    t.mock.method(global,"fetch",async(url,opts)=>{assert.match(url,/status=eq.proposal_sent/);writes++;return h.response(200,[{id:ID,status:JSON.parse(opts.body).status}]);});
    t.mock.method(notify,"notifyProposalResponse",async()=>{emails++;throw Error("email falló");});
    var body={code:"AbCdEf123456",action:action,comment:"Test"},res=await call("proposal.js","POST",body);
    assert.equal(res.statusCode,200);assert.equal(reads,1);assert.match(res.json().warning,/guardada/);assert.equal(emails,1);
    row.status=action==="accept"?"proposal_accepted":"proposal_declined";
    var again=await call("proposal.js","POST",body);assert.equal(again.statusCode,200);assert.equal(writes,1);assert.equal(emails,1);
    var opposite=await call("proposal.js","POST",Object.assign({},body,{action:action==="accept"?"decline":"accept"}));assert.equal(opposite.statusCode,409);assert.equal(writes,1);
  }
});
test("S2B-3 panel: refresh conserva ID de propuesta y operación comercial; JSON roto no confirma éxito",async function(){
  var src=fs.readFileSync(h.ROOT+"/admin/index.html","utf8"),start=src.indexOf("    async function api("),end=src.indexOf("    /* ---------- Ingreso",start),storage={},bodies=[];
  function context(bad){var ctx={ListoRecovery:client(storage),toast:()=>{},showLogin:()=>{},fetch:async(url,opts)=>{bodies.push(JSON.parse(opts.body));return {ok:true,status:200,json:async()=>bad?{}:{ok:true}};}};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);return ctx;}
  var body={plan_inquiry_id:ID,provider_quote_id:OP,expected_proposal_id:null,proposal_id:crypto.randomUUID()};
  await context(false).api("POST","/api/admin-proposals",body);await context(false).api("POST","/api/admin-proposals",Object.assign({},body,{proposal_id:crypto.randomUUID()}));
  assert.equal(bodies[0].proposal_id,bodies[1].proposal_id);
  var contact={id:ID,action:"mark_contacted",channel:"phone",expected_status:"quoted"};
  await context(false).api("PATCH","/api/admin-inquiries",contact);await context(false).api("PATCH","/api/admin-inquiries",contact);assert.equal(bodies[2].operation_id,bodies[3].operation_id);
  await assert.rejects(context(true).api("PATCH","/api/admin-inquiries",contact),/Puede haberse guardado/);
});
test("S2B-3 inquiry sin migration falla cerrado; sin ID viejo no escribe",async function(t){
  var calls=[];var f=async(url)=>{calls.push(url);return /event_requests\?/.test(url)?h.response(200,[{id:ID,dietary_requirements:null}]):h.response(404,{code:"PGRST202"});};
  var cfg={url:process.env.SUPABASE_URL,key:"fake"};
  await assert.rejects(inquiries.saveInquiry(cfg,ID,"ChIJabcdefghij0001",{},f),e=>e.code==="BAD_RECOVERY");assert.equal(calls.length,0);
  await assert.rejects(inquiries.saveInquiry(cfg,ID,"ChIJabcdefghij0001",{},f,{operationId:OP,selectionId:ID}),e=>inquiries.explain(e).status===503);
  assert.equal(calls.length,2);assert.match(calls[1],/rpc\/listo_save_inquiry$/);
});
test("S2B-3 selección: perder respuesta y recargar conserva operación original",async function(){
  var src=fs.readFileSync(h.ROOT+"/app.js","utf8"),start=src.indexOf("  async function postSelection("),end=src.indexOf("  function chooseOption",start),storage={},bodies=[];
  function context(lost){var ctx={state:{selectionId:ID,selected:"ChIJoriginal0001"},pendingSelection:null,ListoRecovery:client(storage),savePlan:()=>{},fetch:async(url,opts)=>{bodies.push(JSON.parse(opts.body));if(lost)throw Error("respuesta perdida después del commit");return {ok:true,status:200,json:async()=>({ok:true,duplicate:true,selection:{id:bodies[0].selection_id}})};}};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);return ctx;}
  var option={google_place_id:"ChIJabcdefghij0001",option_token:"en memoria"};
  await assert.rejects(context(true).postSelection(ID,option));var next=context(false);await next.postSelection(ID,option);
  assert.equal(bodies[0].selection_id,bodies[1].selection_id);assert.equal(next.state.selectionId,bodies[0].selection_id);assert.doesNotMatch(JSON.stringify(storage),/en memoria|ChIJ/);
});
test("S2B-3 panel: nueva propuesta tras rechazo usa otro ID; retry no duplica",async function(){
  var src=fs.readFileSync(h.ROOT+"/admin/index.html","utf8"),start=src.indexOf("    async function api("),end=src.indexOf("    /* ---------- Ingreso",start),storage={},rows=new Map(),bodies=[];
  var ctx={ListoRecovery:client(storage),toast:()=>{},showLogin:()=>{},fetch:async(url,opts)=>{
    var body=JSON.parse(opts.body);bodies.push(body);
    assert.equal(Object.hasOwn(body,"last_proposal_id"),false,"el contexto de recuperación no va al backend");
    var existing=rows.get(body.proposal_id);
    if(existing&&existing.status!=="proposal_sent")return {ok:false,status:409,json:async()=>({ok:false,error:"La propuesta de esta operación ya cambió"})};
    var row=existing||{id:body.proposal_id,status:"proposal_sent"};rows.set(row.id,row);
    return {ok:true,status:200,json:async()=>({ok:true,proposal:row,created:!existing})};
  }};
  vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
  var body={plan_inquiry_id:ID,provider_quote_id:OP,expected_proposal_id:null};
  var first=await ctx.api("POST","/api/admin-proposals",body,null);
  rows.get(first.proposal.id).status="proposal_declined";
  var second=await ctx.api("POST","/api/admin-proposals",body,first.proposal.id);
  assert.equal(second.created,true);assert.notEqual(second.proposal.id,first.proposal.id);
  var retry=await ctx.api("POST","/api/admin-proposals",body,first.proposal.id);
  assert.equal(retry.created,false);assert.equal(retry.proposal.id,second.proposal.id);
  assert.equal(rows.size,2);assert.equal([...rows.values()].filter(r=>r.status==="proposal_sent").length,1);
  assert.equal(bodies[1].proposal_id,bodies[2].proposal_id);
});
