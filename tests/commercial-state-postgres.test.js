/* Integración real, sólo con un contenedor Postgres LOCAL DESECHABLE explícito.
   LISTO_S2B_POSTGRES_CONTAINER=listo-s2b-test node --test tests/commercial-state-postgres.test.js */
"use strict";
var test=require("node:test"),assert=require("node:assert/strict"),cp=require("node:child_process"),fs=require("node:fs"),path=require("node:path");
var container=process.env.LISTO_S2B_POSTGRES_CONTAINER;
function sql(text){return cp.execFileSync("docker",["exec","-i",container,"psql","-U","postgres","-d","listo_s2b_test","-v","ON_ERROR_STOP=1","-At"],{input:text,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();}
var I="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",Q="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function fixture(status){sql("truncate plan_bookings, plan_proposals, provider_quotes, plan_inquiries, plan_selections, event_requests, providers cascade; insert into event_requests values ('"+I+"'); insert into providers values ('ChIJabcdefghij0001'); insert into plan_selections(id,event_request_id,provider_google_place_id,provider_name) values ('"+I+"','"+I+"','ChIJabcdefghij0001',''); insert into plan_inquiries(id,plan_selection_id,contact_name,contact_phone,event_date,approximate_time,status) values ('"+I+"','"+I+"','Test','11111111',current_date,'20:00','"+status+"'); insert into provider_quotes(id,plan_inquiry_id,total_price,availability) values ('"+Q+"','"+I+"',1000,'yes');");}
var data={provider_quote_id:Q,acceptance_source:"manual",acceptance_channel:"phone",acceptance_note:"Aceptó por teléfono",confirmed_at:"2026-10-01T15:00:00Z",final_total_amount:1000,currency:"ARS",commission_type:"fixed",commission_amount:100};
function rpc(action,expected,d){return JSON.parse(sql("select listo_commercial_state('"+action+"','"+I+"','"+expected+"','"+JSON.stringify(d||{}).replace(/'/g,"''")+"'::jsonb);"));}
test("S2B Postgres: permisos, transiciones, rollback y carreras",{skip:!container},async function(t){
  // Nunca usar una base compartida: se recrea sólo esta base dentro del contenedor local.
  cp.execFileSync("docker",["exec","-i",container,"psql","-U","postgres","-v","ON_ERROR_STOP=1"],{input:"drop database if exists listo_s2b_test with (force); create database listo_s2b_test;",stdio:["pipe","pipe","pipe"]});
  sql(fs.readFileSync(path.join(__dirname,"fixtures/s2b/schema.sql"),"utf8"));
  sql(fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261008120000_s2b1_commercial_state.sql"),"utf8"));
  await t.test("RPC no pública",()=>{assert.equal(sql("select has_function_privilege('anon','listo_commercial_state(text,uuid,text,jsonb)','execute'),has_function_privilege('authenticated','listo_commercial_state(text,uuid,text,jsonb)','execute');"),"f|f");});
  await t.test("sync y confirm no reabren cerradas",()=>{for(var state of ["completed","cancelled"]){fixture("quoted");assert.equal(rpc("confirm","quoted",data).ok,true);sql("update plan_inquiries set status='"+state+"';");assert.equal(rpc("sync",state).ok,false);assert.equal(rpc("confirm",state,data).ok,false);assert.equal(sql("select status from plan_inquiries;"),state);}});
  await t.test("contact y transición con estado viejo no pisan",()=>{fixture("quoted");assert.equal(rpc("contact","inquiry_requested",{channel:"phone"}).ok,false);assert.equal(rpc("transition","inquiry_requested",{status:"cancelled"}).ok,false);assert.equal(sql("select status from plan_inquiries;"),"quoted");});
  await t.test("paid y waived no cancelan; cancel normal cambia ambas filas",()=>{for(var commission of ["paid","waived","pending"]){fixture("quoted");rpc("confirm","quoted",data);sql("update plan_bookings set commission_status='"+commission+"',commission_paid_at="+(commission==="paid"?"now()":"null")+";");var r=rpc("transition","confirmed",{status:"cancelled"});assert.equal(r.ok,commission==="pending");assert.equal(sql("select status from plan_inquiries;"),commission==="pending"?"cancelled":"confirmed");assert.equal(sql("select booking_status from plan_bookings;"),commission==="pending"?"cancelled":"confirmed");}});
  await t.test("no retrocesos, cerrado mismo estado no-op, confirmed exige reserva",()=>{fixture("completed");assert.equal(rpc("transition","completed",{status:"completed"}).ok,true);assert.equal(rpc("transition","completed",{status:"quoted"}).ok,false);fixture("quoted");assert.equal(rpc("transition","quoted",{status:"confirmed"}).ok,false);});
  await t.test("confirm valida disponibilidad, vencimiento, proveedor y aceptación",()=>{
    fixture("quoted");sql("update provider_quotes set availability='no';");assert.equal(rpc("confirm","quoted",data).ok,false);
    sql("update provider_quotes set availability='yes',valid_until=current_date-2;");assert.equal(rpc("confirm","quoted",data).ok,false);
    sql("update provider_quotes set valid_until=null;");assert.equal(rpc("confirm","quoted",Object.assign({},data,{provider_google_place_id:"ChIJotro00000001"})).ok,false);
    var prop="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    sql("insert into plan_proposals(id,public_code,plan_inquiry_id,provider_quote_id) values ('"+prop+"','AbCdEf123456','"+I+"','"+Q+"');");
    var link=Object.assign({},data,{acceptance_source:"proposal_link",plan_proposal_id:prop,acceptance_channel:null,acceptance_note:null});
    assert.equal(rpc("confirm","quoted",link).ok,false);sql("update plan_proposals set status='proposal_accepted';");assert.equal(rpc("confirm","quoted",link).ok,true);
  });
  await t.test("cancel por ID usa misma transacción; sync válido no crea booking",()=>{
    fixture("quoted");var booking=rpc("confirm","quoted",data).booking;
    sql("update plan_inquiries set status='quoted';");assert.equal(rpc("sync","quoted").ok,true);assert.equal(sql("select count(*) from plan_bookings;"),"1");
    assert.equal(rpc("cancel","confirmed",{booking_id:booking.id}).ok,true);assert.equal(sql("select status from plan_inquiries;"),"cancelled");
  });
  await t.test("confirmaciones simultáneas: una sola reserva",async()=>{
    fixture("quoted");
    function confirmAsync(){return new Promise((resolve,reject)=>{var c=cp.spawn("docker",["exec","-i",container,"psql","-U","postgres","-d","listo_s2b_test","-v","ON_ERROR_STOP=1","-At"]),out="";c.stdout.on("data",d=>out+=d);c.on("exit",code=>code===0?resolve(JSON.parse(out.trim())):reject(Error("confirm")));c.stdin.end("select listo_commercial_state('confirm','"+I+"','quoted','"+JSON.stringify(data)+"');");});}
    var results=await Promise.all([confirmAsync(),confirmAsync()]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(sql("select count(*) from plan_bookings;"),"1");assert.equal(sql("select status from plan_inquiries;"),"confirmed");
  });
  await t.test("fallo en inquiry revierte INSERT booking y cancelación",()=>{
    sql("create function s2b_fail() returns trigger language plpgsql as $$ begin raise exception 'fallo inyectado'; end $$; create trigger s2b_fail before update on plan_inquiries for each row execute function s2b_fail();");
    fixture("quoted");assert.throws(()=>rpc("confirm","quoted",data));assert.equal(sql("select count(*) from plan_bookings;"),"0");
    sql("drop trigger s2b_fail on plan_inquiries;");rpc("confirm","quoted",data);sql("create trigger s2b_fail before update on plan_inquiries for each row execute function s2b_fail();");assert.throws(()=>rpc("transition","confirmed",{status:"cancelled"}));assert.equal(sql("select booking_status from plan_bookings;"),"confirmed");sql("drop trigger s2b_fail on plan_inquiries;");
  });
  await t.test("otra conexión avanza mientras contact espera: conflicto real",async()=>{
    fixture("inquiry_requested");
    var args=["exec","-i",container,"psql","-U","postgres","-d","listo_s2b_test","-v","ON_ERROR_STOP=1","-At"];
    var blocker=cp.spawn("docker",args);var ready=new Promise(resolve=>blocker.stdout.on("data",c=>{if(c.toString().includes("LOCKED"))resolve();}));
    var done=new Promise((resolve,reject)=>blocker.on("exit",code=>code===0?resolve():reject(Error("blocker"))));
    blocker.stdin.end("begin; update plan_inquiries set status='quoted' where id='"+I+"'; select 'LOCKED'; select pg_sleep(1); commit;");await ready;
    var result=await new Promise((resolve,reject)=>{var client=cp.spawn("docker",args),out="";client.stdout.on("data",c=>out+=c);client.on("exit",code=>code===0?resolve(JSON.parse(out.trim())):reject(Error("client")));client.stdin.end("select listo_commercial_state('contact','"+I+"','inquiry_requested','{\"channel\":\"phone\"}');");});
    await done;assert.equal(result.ok,false);assert.equal(sql("select status from plan_inquiries;"),"quoted");
  });
});
