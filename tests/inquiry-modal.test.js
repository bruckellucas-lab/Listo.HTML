/* Recorrido real del modal + transporte/RPC simulados; no ejecuta SQL. */
"use strict";
var test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),crypto=require("node:crypto"),h=require("./helpers"),inquiries=require("../api/_lib/inquiries");
var REQUEST="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",SELECTION="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",PLACE="ChIJabcdefghij0001";
function modal(){
  var fields={},bodies=[],rows=new Map(),receipts=new Map(),storage={},emails=0;
  function $(id){return fields[id]||(fields[id]={value:"",hidden:false,classList:{remove(){}},addEventListener(name,fn){this[name]=fn;},focus(){},setAttribute(){},removeAttribute(){},showModal(){},close(){}});}
  $("#advance-form").reset=function(){for(var id of ["#a-name","#a-phone","#a-email","#a-date","#a-time","#a-notes","#a-website"])$(id).value="";};
  var window={crypto:crypto.webcrypto,sessionStorage:{getItem:k=>storage[k],setItem:(k,v)=>storage[k]=v},ListoVerify:{create:()=>({setup(){},reset(){},clearNotice(){},obtain:async()=>crypto.randomUUID()})}};
  var ctx={window:window,$:$,$all:()=>[],state:{requestId:REQUEST,selectionId:SELECTION,selected:PLACE,inquiries:{}},TextEncoder:TextEncoder,Uint8Array:Uint8Array,setTimeout:()=>0,clearTimeout(){},Date:Date,requestSave:Promise.resolve(REQUEST),getActiveNeeds:()=>[],escapeHTML:x=>x,formatMoney:x=>x,toast(){},savePlan(){},markSelected(){},friendlyError:(e,f)=>e.message||f,fetch:async(url,opts)=>{
    assert.equal(url,"/api/plan-inquiry");var body=JSON.parse(opts.body);bodies.push(body);
    var checked=inquiries.validate(body,new Date().toISOString().slice(0,10));assert.equal(checked.error,undefined);
    var row=receipts.get(body.operation_id),already=!!row,updated=false;
    if(!row){row=rows.get(body.selection_id);updated=!!row;already=!!row&&JSON.stringify(row.data)===JSON.stringify(checked.data);
      if(!row){row={id:crypto.randomUUID(),status:"inquiry_requested"};rows.set(body.selection_id,row);}
      if(!already){row.data=checked.data;emails++;}receipts.set(body.operation_id,row);
    }
    return {ok:true,json:async()=>({ok:true,already_applied:already,updated:updated,status:row.status})};
  }};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(h.ROOT+"/recovery.js","utf8"),ctx);ctx.ListoRecovery=window.ListoRecovery;
  var src=fs.readFileSync(h.ROOT+"/app.js","utf8"),start=src.indexOf("  var advanceDialog ="),end=src.indexOf("  /* ---------- Aviso flotante",start);vm.runInContext(src.slice(start,end),ctx);
  async function send(notes){ctx.openAdvance({google_place_id:PLACE,name:"Lugar en memoria"});
    var date=new Date(Date.now()+864e5).toISOString().slice(0,10);
    for(var [id,value] of Object.entries({"#a-name":"Ana","#a-phone":"11111111","#a-date":date,"#a-time":"20:00","#a-notes":notes||""}))$(id).value=value;
    $("#advance-form").submit({preventDefault(){}});
    for(var n=0;n<100&&ctx.sendingInquiry;n++)await new Promise(resolve=>setImmediate(resolve));
    assert.equal(ctx.sendingInquiry,false);assert.equal($("#advance-error").hidden,true);assert.equal($("#advance-done").hidden,false);ctx.closeAdvance();
  }
  return {ctx:ctx,send:send,bodies:bodies,rows:rows,emails:()=>emails};
}
test("modal Quiero avanzar: éxito, volver a opciones y reenviar no cambia plan/selección/operación ni duplica aviso",async()=>{
  var m=modal();await m.send();await m.send();assert.equal(m.rows.size,1);assert.equal(m.emails(),1);
  assert.equal(m.bodies[0].operation_id,m.bodies[1].operation_id);assert.equal(m.bodies[0].selection_id,m.bodies[1].selection_id);assert.equal(m.bodies[0].event_request_id,m.bodies[1].event_request_id);
});
test("modal Quiero avanzar: editar comentario después de reabrir actualiza la misma solicitud abierta",async()=>{
  var m=modal();await m.send();var id=m.rows.get(SELECTION).id;await m.send("Dato actualizado");await m.send("Dato actualizado");
  assert.equal(m.rows.size,1);assert.equal(m.rows.get(SELECTION).id,id);assert.equal(m.rows.get(SELECTION).data.notes,"Dato actualizado");assert.equal(m.emails(),2);
  assert.notEqual(m.bodies[0].operation_id,m.bodies[1].operation_id);assert.equal(m.bodies[1].operation_id,m.bodies[2].operation_id);
});
