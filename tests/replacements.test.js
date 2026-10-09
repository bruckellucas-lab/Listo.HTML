"use strict";
var test=require("node:test"),assert=require("node:assert/strict"),h=require("./helpers"),auth=require("../api/_lib/admin-auth");
var api=require("../api/admin-proposals"),select=require("../api/_lib/selections"),tokens=require("../api/_lib/option-token");
process.env.ADMIN_PASSWORD="local-admin-password-123456";process.env.SUPABASE_URL="https://test.invalid";process.env.SUPABASE_SECRET_KEY="fake";process.env.PHOTO_SIGNING_SECRET="x".repeat(32);
var I="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",Q="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",N="cccccccc-cccc-4ccc-8ccc-cccccccccccc",P="ChIJabcdefghij0001";
async function propose(body){var res=h.fakeRes();await api(h.fakeReq("POST",{cookie:auth.sessionCookie().split(";")[0],"x-listo-admin":"1","content-type":"application/json"},Object.assign({plan_inquiry_id:I,provider_quote_id:Q,expected_proposal_id:null,proposal_id:N},body)),res);return res;}
test("S2B-2: proposal sólo usa RPC, conflicto no intenta INSERT/PATCH",async function(t){var calls=[];t.mock.method(global,"fetch",async(url,o)=>{calls.push(url);assert.equal(JSON.parse(o.body).p_new_id,N);return h.response(200,{ok:false,http_status:409,error:"El usuario respondió"});});assert.equal((await propose()).statusCode,409);assert.equal(calls.length,1);assert.match(calls[0],/rpc\/listo_replace_proposal$/);});
test("S2B-2: falta migration no activa fallback",async function(t){t.mock.method(console,"error",()=>{});t.mock.method(global,"fetch",async()=>h.response(404,{code:"PGRST202"}));assert.equal((await propose()).statusCode,503);});
test("S2B-2: colisión de código reintenta RPC con mismo ID",async function(t){var ids=[];t.mock.method(global,"fetch",async(url,o)=>{ids.push(JSON.parse(o.body).p_new_id);return ids.length===1?h.response(409,{code:"23505",message:'duplicate public_code'}):h.response(200,{ok:true,proposal:{id:N},created:true});});assert.equal((await propose()).statusCode,200);assert.deepEqual(ids,[N,N]);});
test("S2B-2: selección informa activo inesperado y no escribe directo",async function(t){var calls=[];var f=async(url,o)=>{calls.push(url);if(url.includes("event_requests?"))return h.response(200,[{id:I,dietary_requirements:null}]);if(url.includes("providers?"))return h.response(201,"");return h.response(200,{ok:false,http_status:409,error:"Cambió",current_selection:{id:Q,google_place_id:P}});};await assert.rejects(select.saveSelection({url:process.env.SUPABASE_URL,key:"fake"},I,P,f,{token:tokens.sign(process.env.PHOTO_SIGNING_SECRET,P),expectedId:null,newId:N}),err=>err.result.current_selection.id===Q);assert.equal(calls.filter(url=>/plan_selections/.test(url)).length,0);assert.match(calls.at(-1),/rpc\/listo_replace_selection$/);});
test("S2B-2 navegador: conserva ID al reintentar y sincroniza la expectativa tras conflicto",async function(){
  var fs=require("node:fs"),vm=require("node:vm"),path=require("node:path");
  var src=fs.readFileSync(path.join(h.ROOT,"app.js"),"utf8"),start=src.indexOf("  function postSelection("),end=src.indexOf("  function chooseOption",start);
  var bodies=[],attempt=0,seq=0,saved=0;
  var context={state:{selectionId:Q,selected:"lugar-anterior"},pendingSelection:null,newUUID:()=>"operation-"+(++seq),savePlan:()=>saved++,fetch:async function(url,opts){
    bodies.push(JSON.parse(opts.body));attempt++;
    if(attempt===1)throw Error("respuesta perdida");
    if(attempt===2)return {ok:false,status:409,json:async()=>({ok:false,error:"Cambió",current_selection:{id:I,google_place_id:P}})};
    return {ok:true,status:200,json:async()=>({ok:true,selection:{id:N}})};
  }};
  vm.createContext(context);vm.runInContext(src.slice(start,end),context);
  await assert.rejects(context.postSelection(I,{google_place_id:P,option_token:"signed"}));
  await assert.rejects(context.postSelection(I,{google_place_id:P,option_token:"signed"}));
  assert.equal(bodies[0].selection_id,bodies[1].selection_id);assert.equal(bodies[0].expected_selection_id,Q);
  assert.equal(context.state.selectionId,I);assert.equal(context.state.selected,P);assert.equal(saved,1);
  await context.postSelection(I,{google_place_id:"ChIJabcdefghij0002",option_token:"signed"});
  assert.equal(bodies[2].expected_selection_id,I);assert.notEqual(bodies[2].selection_id,bodies[0].selection_id);assert.equal(context.state.selectionId,N);
});
