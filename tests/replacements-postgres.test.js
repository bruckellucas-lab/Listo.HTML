/* Integración real en Postgres LOCAL DESECHABLE. No usa Supabase remoto.
   LISTO_S2B_POSTGRES_CONTAINER=listo-s2b2-test node --test tests/replacements-postgres.test.js */
"use strict";
var test=require("node:test"),assert=require("node:assert/strict"),cp=require("node:child_process"),fs=require("node:fs"),path=require("node:path");
var container=process.env.LISTO_S2B_POSTGRES_CONTAINER;
var args=["exec","-i",container,"psql","-U","postgres","-d","listo_s2b2_test","-v","ON_ERROR_STOP=1","-At"];
function sql(text){return cp.execFileSync("docker",args,{input:text,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();}
function asyncSql(text){return new Promise((resolve,reject)=>{var c=cp.spawn("docker",args),out="",err="";c.stdout.on("data",d=>out+=d);c.stderr.on("data",d=>err+=d);c.on("exit",code=>code===0?resolve(out.trim()):reject(Error(err)));c.stdin.end(text);});}
function quote(v){return v===null?"null":"'"+String(v).replace(/'/g,"''")+"'";}
var R="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",S="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",I="cccccccc-cccc-4ccc-8ccc-cccccccccccc",Q="dddddddd-dddd-4ddd-8ddd-dddddddddddd",P="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",N="ffffffff-ffff-4fff-8fff-ffffffffffff",M="11111111-1111-4111-8111-111111111111";
var A="ChIJabcdefghij0001",B="ChIJabcdefghij0002",C="ChIJabcdefghij0003";
function selection(expected,id,place){return "select listo_replace_selection("+[R,place,expected,id].map(quote).join(",")+");";}
function proposal(expected,id,code,inq,qu){return "select listo_replace_proposal("+[inq||I,qu||Q,expected,id,code||"NewCode12345"].map(quote).join(",")+");";}
function seed(){sql("truncate plan_bookings,plan_proposals,provider_quotes,plan_inquiries,plan_selections,event_requests,providers cascade; insert into event_requests values ('"+R+"'); insert into providers values ('"+A+"'),('"+B+"'),('"+C+"'); insert into plan_selections(id,event_request_id,provider_google_place_id,provider_name) values ('"+S+"','"+R+"','"+A+"',''); insert into plan_inquiries(id,plan_selection_id,contact_name,contact_phone,event_date,approximate_time) values ('"+I+"','"+S+"','Test','11111111',current_date,'20:00'); insert into provider_quotes(id,plan_inquiry_id,total_price) values ('"+Q+"','"+I+"',1000); insert into plan_proposals(id,public_code,plan_inquiry_id,provider_quote_id) values ('"+P+"','OldCode12345','"+I+"','"+Q+"');");}
function newQuote(){var id="22222222-2222-4222-8222-222222222222";sql("insert into provider_quotes(id,plan_inquiry_id,total_price) values ('"+id+"','"+I+"',2000);");return id;}
function active(table,status){return sql("select id from "+table+" where status='"+status+"';");}
async function held(text,fn){
  var c=cp.spawn("docker",args),ready=new Promise(resolve=>c.stdout.on("data",d=>{if(d.toString().includes("LOCKED"))resolve();}));
  var done=new Promise((resolve,reject)=>c.on("exit",code=>code===0?resolve():reject(Error("blocker falló"))));
  c.stdin.end("begin; "+text+" select 'LOCKED'; select pg_sleep(0.7); commit;");await ready;var result=await fn();await done;return result;
}
test("S2B-2 Postgres: reemplazos, rollback, carreras e idempotencia",{skip:!container},async function(t){
  cp.execFileSync("docker",["exec","-i",container,"psql","-U","postgres","-v","ON_ERROR_STOP=1"],{input:"drop database if exists listo_s2b2_test with (force); create database listo_s2b2_test;",stdio:["pipe","pipe","pipe"]});
  sql(fs.readFileSync(path.join(__dirname,"fixtures/s2b/schema.sql"),"utf8"));
  sql(fs.readFileSync(path.join(__dirname,"../supabase/migrations/20261009120000_s2b2_atomic_replacements.sql"),"utf8"));
  await t.test("permisos anon/auth false, service_role true",()=>{for(var f of ["listo_replace_selection(uuid,text,uuid,uuid)","listo_replace_proposal(uuid,uuid,uuid,uuid,text)"]){assert.equal(sql("select has_function_privilege('anon','"+f+"','execute'),has_function_privilege('authenticated','"+f+"','execute'),has_function_privilege('service_role','"+f+"','execute');"),"f|f|t");}});
  await t.test("selección nueva activa y anterior replaced; reintento no duplica",()=>{seed();var r=JSON.parse(sql(selection(S,N,B)));assert.equal(r.ok,true);assert.equal(active("plan_selections","interested"),N);assert.equal(sql("select status from plan_selections where id='"+S+"';"),"replaced");assert.equal(JSON.parse(sql(selection(S,N,B))).duplicate,true);assert.equal(sql("select count(*) from plan_selections;"),"2");});
  await t.test("selección inesperada y reutilización alterada del ID son conflictos",()=>{seed();assert.equal(JSON.parse(sql(selection(null,N,B))).http_status,409);assert.equal(active("plan_selections","interested"),S);sql(selection(S,N,B));assert.equal(JSON.parse(sql(selection(S,N,C))).ok,false);assert.equal(active("plan_selections","interested"),N);});
  await t.test("fallo INSERT revierte reemplazo de selección y propuesta",()=>{
    seed();sql("create function fail_insert() returns trigger language plpgsql as $$ begin raise exception 'fallo inyectado'; end $$; create trigger fail_selection before insert on plan_selections for each row execute function fail_insert();");
    assert.throws(()=>sql(selection(S,N,B)));assert.equal(active("plan_selections","interested"),S);sql("drop trigger fail_selection on plan_selections;");
    var q=newQuote();sql("create trigger fail_proposal before insert on plan_proposals for each row execute function fail_insert();");assert.throws(()=>sql(proposal(P,N,"NewCode12345",I,q)));assert.equal(active("plan_proposals","proposal_sent"),P);sql("drop trigger fail_proposal on plan_proposals;");
  });
  await t.test("selecciones simultáneas: sólo una gana; replay vieja no pisa la siguiente",async()=>{
    seed();var rows=await Promise.all([asyncSql(selection(S,N,B)),asyncSql(selection(S,M,C))]);var results=rows.map(JSON.parse);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.http_status===409).length,1);assert.equal(sql("select count(*) from plan_selections where status='interested';"),"1");
    var winner=results.find(r=>r.ok).selection;var next=winner.id===N?M:N;sql(selection(winner.id,next,A));assert.equal(JSON.parse(sql(selection(S,winner.id,winner.provider_google_place_id))).ok,false);assert.equal(active("plan_selections","interested"),next);
  });
  await t.test("propuesta nueva enviada, anterior replaced; replay conserva código",()=>{seed();var q=newQuote();var r=JSON.parse(sql(proposal(P,N,"NewCode12345",I,q)));assert.equal(r.ok,true);assert.equal(active("plan_proposals","proposal_sent"),N);assert.equal(sql("select status from plan_proposals where id='"+P+"';"),"proposal_replaced");var replay=JSON.parse(sql(proposal(P,N,"OtherCode123",I,q)));assert.equal(replay.created,false);assert.equal(replay.proposal.public_code,"NewCode12345");assert.equal(sql("select count(*) from plan_proposals;"),"2");});
  await t.test("propuesta inesperada no se pisa; código inválido hace rollback",()=>{seed();var q=newQuote();assert.equal(JSON.parse(sql(proposal(null,N,"NewCode12345",I,q))).http_status,409);assert.throws(()=>sql(proposal(P,N,"bad",I,q)));assert.throws(()=>sql(proposal(P,N,"OldCode12345",I,q)));assert.equal(active("plan_proposals","proposal_sent"),P);});
  await t.test("propuestas simultáneas: una gana y otra recibe conflicto",async()=>{seed();var q=newQuote();var results=(await Promise.all([asyncSql(proposal(P,N,"NewCode12345",I,q)),asyncSql(proposal(P,M,"OtherCode123",I,q))])).map(JSON.parse);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.http_status===409).length,1);assert.equal(sql("select count(*) from plan_proposals where status='proposal_sent';"),"1");});
  await t.test("aceptar/rechazar gana mientras reemplazo espera: conserva respuesta y conflicto",async()=>{for(var status of ["proposal_accepted","proposal_declined"]){seed();var q=newQuote();var out=await held("update plan_proposals set status='"+status+"' where id='"+P+"';",()=>asyncSql(proposal(P,N,"NewCode12345",I,q)));assert.equal(JSON.parse(out).http_status,409);assert.equal(sql("select status from plan_proposals where id='"+P+"';"),status);assert.equal(sql("select count(*) from plan_proposals;"),"1");}});
  await t.test("si reemplazo gana, respuesta condicionada no sobrescribe replaced",async()=>{seed();var q=newQuote();var count=await held(proposal(P,N,"NewCode12345",I,q),()=>asyncSql("with changed as (update plan_proposals set status='proposal_accepted' where id='"+P+"' and status='proposal_sent' returning id) select count(*) from changed;"));assert.equal(count,"0");assert.equal(active("plan_proposals","proposal_sent"),N);});
});
