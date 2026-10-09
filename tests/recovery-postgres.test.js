/* Sólo Postgres LOCAL DESECHABLE con LISTO_S2B_POSTGRES_CONTAINER explícito. */
"use strict";
var test=require("node:test"), assert=require("node:assert/strict"), cp=require("node:child_process"), fs=require("node:fs"), path=require("node:path");
var container=process.env.LISTO_S2B_POSTGRES_CONTAINER;
var args=["exec","-i",container,"psql","-U","postgres","-d","listo_s2b3_test","-v","ON_ERROR_STOP=1","-At"];
function sql(text){return cp.execFileSync("docker",args,{input:text,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();}
function asyncSql(text){return new Promise((resolve,reject)=>{var c=cp.spawn("docker",args),out="",err="";c.stdout.on("data",d=>out+=d);c.stderr.on("data",d=>err+=d);c.on("exit",code=>code===0?resolve(out.trim()):reject(Error(err)));c.stdin.end(text);});}
function lit(v){return v===null?"null":"'"+String(v).replace(/'/g,"''")+"'";}
var I="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Q="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", OP="cccccccc-cccc-4ccc-8ccc-cccccccccccc", NEXT="dddddddd-dddd-4ddd-8ddd-dddddddddddd", THIRD="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",PLACE="ChIJabcdefghij0001";
var data={provider_quote_id:Q,acceptance_source:"manual",acceptance_channel:"phone",acceptance_note:"Aceptó por teléfono",confirmed_at:"2026-10-01T15:00:00Z",final_total_amount:1000,currency:"ARS",commission_type:"fixed",commission_amount:100};
var contact={contact_name:"Test",contact_phone:"11111111",contact_email:null,event_date:"2026-11-20",approximate_time:"20:00",notes:null};
function fixture(status){sql("truncate listo_recovery_operations,plan_bookings,plan_proposals,provider_quotes,plan_inquiries,plan_selections,event_requests,providers cascade; insert into event_requests values ('"+I+"'); insert into providers values ('"+PLACE+"'); insert into plan_selections(id,event_request_id,provider_google_place_id,provider_name) values ('"+I+"','"+I+"','"+PLACE+"',''); insert into plan_inquiries(id,plan_selection_id,contact_name,contact_phone,event_date,approximate_time,status) values ('"+I+"','"+I+"','Test','11111111','2026-11-20','20:00','"+status+"'); insert into provider_quotes(id,plan_inquiry_id,total_price,availability) values ('"+Q+"','"+I+"',1000,'yes');");}
function commercialText(op,action,expected,d){return "select listo_recover_commercial("+[op,action,I,expected,JSON.stringify(d||{})].map(lit).join(",")+");";}
function commercial(op,action,expected,d){return JSON.parse(sql(commercialText(op,action,expected,d)));}
function inquiryText(op,body,selection){return "select listo_save_inquiry("+[op,I,selection||I,PLACE,JSON.stringify(body||contact)].map(lit).join(",")+");";}
function inquiry(op,body,selection){return JSON.parse(sql(inquiryText(op,body,selection)));}
test("S2B-3 Postgres: recibos transaccionales, recuperación y carreras",{skip:!container},async function(t){
  cp.execFileSync("docker",["exec","-i",container,"psql","-U","postgres","-v","ON_ERROR_STOP=1"],{input:"drop database if exists listo_s2b3_test with (force); create database listo_s2b3_test;",stdio:["pipe","pipe","pipe"]});
  sql(fs.readFileSync(path.join(__dirname,"fixtures/s2b/schema.sql"),"utf8"));
  for(var file of ["20261008120000_s2b1_commercial_state.sql","20261009120000_s2b2_atomic_replacements.sql","20261009180000_s2b3_recovery.sql"])sql(fs.readFileSync(path.join(__dirname,"../supabase/migrations",file),"utf8"));
  await t.test("RPC y recibos no accesibles por anon/auth; service_role tiene permisos",()=>{
    for(var fn of ["listo_recover_commercial(uuid,text,uuid,text,jsonb)","listo_save_inquiry(uuid,uuid,uuid,text,jsonb)"])assert.equal(sql("select has_function_privilege('anon','"+fn+"','execute'),has_function_privilege('authenticated','"+fn+"','execute'),has_function_privilege('service_role','"+fn+"','execute');"),"f|f|t");
    assert.equal(sql("select has_table_privilege('anon','listo_recovery_operations','select'),has_table_privilege('authenticated','listo_recovery_operations','insert'),has_table_privilege('service_role','listo_recovery_operations','select,insert');"),"f|f|t");
    assert.equal(sql("select relrowsecurity from pg_class where oid='listo_recovery_operations'::regclass;"),"t");
  });
  await t.test("contact replay conserva timestamp; otros datos o estado avanzado producen conflicto",()=>{
    fixture("inquiry_requested");var first=commercial(OP,"contact","inquiry_requested",{channel:"phone"});assert.equal(first.ok,true);
    var retry=commercial(OP,"contact","inquiry_requested",{channel:"phone"});assert.equal(retry.already_applied,true);assert.deepEqual(retry.item,first.item);
    assert.equal(commercial(OP,"contact","inquiry_requested",{channel:"email"}).http_status,409);
    sql("update plan_inquiries set status='quoted',updated_at=clock_timestamp();");var advanced=commercial(OP,"contact","inquiry_requested",{channel:"phone"});assert.equal(advanced.http_status,409);assert.equal(advanced.item.status,"quoted");assert.equal(advanced.already_applied,true);
  });
  await t.test("confirm replay con hora reconstruida no duplica; cancel/completar replay seguros",()=>{
    fixture("quoted");var first=commercial(OP,"confirm","quoted",data);assert.equal(first.ok,true);
    var retry=commercial(OP,"confirm","quoted",Object.assign({},data,{confirmed_at:"2026-10-01T18:00:00Z"}));assert.equal(retry.already_applied,true);assert.equal(retry.booking.id,first.booking.id);assert.equal(sql("select count(*) from plan_bookings;"),"1");
    assert.equal(commercial(OP,"confirm","quoted",Object.assign({},data,{final_total_amount:2000})).http_status,409);
    var complete=commercial(NEXT,"transition","confirmed",{status:"completed"});assert.equal(complete.ok,true);assert.equal(commercial(NEXT,"transition","confirmed",{status:"completed"}).already_applied,true);
    assert.equal(commercial(OP,"confirm","quoted",data).http_status,409);
    fixture("quoted");first=commercial(OP,"confirm","quoted",data);var cancel={booking_id:first.booking.id};assert.equal(commercial(NEXT,"cancel","confirmed",cancel).ok,true);assert.equal(commercial(NEXT,"cancel","confirmed",cancel).already_applied,true);assert.equal(sql("select status from plan_inquiries;"),"cancelled");assert.equal(sql("select booking_status from plan_bookings;"),"cancelled");
  });
  await t.test("confirm/cancel/completar con cambios posteriores: conflicto y estado real",()=>{
    fixture("quoted");var first=commercial(OP,"confirm","quoted",data);var cancel={booking_id:first.booking.id};
    sql("update plan_inquiries set status='completed',updated_at=clock_timestamp();");assert.equal(commercial(NEXT,"cancel","confirmed",cancel).http_status||409,409);assert.equal(sql("select booking_status from plan_bookings;"),"confirmed");
    var complete=commercial(THIRD,"transition","confirmed",{status:"completed"});assert.equal(complete.ok,false);assert.equal(complete.item.status,"completed");
  });
  await t.test("fallo escribiendo recibo revierte confirmación y permite retry limpio",()=>{
    fixture("quoted");sql("create function fail_receipt() returns trigger language plpgsql as $$ begin raise exception 'fallo recibo'; end $$; create trigger fail_receipt before insert on listo_recovery_operations for each row execute function fail_receipt();");
    assert.throws(()=>commercial(OP,"confirm","quoted",data));assert.equal(sql("select count(*) from plan_bookings;"),"0");assert.equal(sql("select status from plan_inquiries;"),"quoted");
    sql("drop trigger fail_receipt on listo_recovery_operations;");assert.equal(commercial(OP,"confirm","quoted",data).ok,true);
  });
  await t.test("dos confirmaciones simultáneas del mismo ID: una escritura y un replay",async()=>{
    fixture("quoted");var results=(await Promise.all([asyncSql(commercialText(OP,"confirm","quoted",data)),asyncSql(commercialText(OP,"confirm","quoted",data))])).map(JSON.parse);
    assert.equal(results.every(r=>r.ok),true);assert.equal(results.filter(r=>r.already_applied).length,1);assert.equal(sql("select count(*) from plan_bookings;"),"1");assert.equal(sql("select count(*) from listo_recovery_operations;"),"1");
  });
  await t.test("inquiry retry y doble envío con IDs diferentes: una fila y un aviso",async()=>{
    fixture("quoted");sql("truncate provider_quotes,plan_inquiries cascade;");
    var results=(await Promise.all([asyncSql(inquiryText(OP)),asyncSql(inquiryText(NEXT))])).map(JSON.parse);
    assert.equal(results.every(r=>r.ok),true);assert.equal(results.filter(r=>r.notify).length,1);assert.equal(sql("select count(*) from plan_inquiries;"),"1");
    var retry=inquiry(OP);assert.equal(retry.notify,false);assert.equal(retry.already_applied,true);
    assert.equal(inquiry(OP,Object.assign({},contact,{contact_phone:"22222222"})).http_status,409);
    sql("update plan_inquiries set status='completed';");retry=inquiry(OP);assert.equal(retry.ok,true);assert.equal(retry.status,"completed");assert.equal(retry.notify,false);assert.equal(sql("select count(*) from plan_inquiries;"),"1");
  });
  await t.test("inquiry fallo de recibo revierte INSERT; elección vieja rechazada sin escribir",()=>{
    fixture("quoted");sql("truncate provider_quotes,plan_inquiries cascade; create trigger fail_receipt before insert on listo_recovery_operations for each row execute function fail_receipt();");
    assert.throws(()=>inquiry(OP));assert.equal(sql("select count(*) from plan_inquiries;"),"0");sql("drop trigger fail_receipt on listo_recovery_operations;");
    assert.equal(inquiry(OP,contact,NEXT).http_status,409);assert.equal(sql("select count(*) from plan_inquiries;"),"0");assert.equal(inquiry(OP).ok,true);
    assert.doesNotMatch(sql("select result::text from listo_recovery_operations;"),/11111111|contact_name|contact_phone|notes/);
  });
});
