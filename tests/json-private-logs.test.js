"use strict";
var test=require("node:test"),assert=require("node:assert/strict"),events=require("node:events"),fs=require("node:fs"),path=require("node:path"),h=require("./helpers"),http=require("../api/_lib/http"),logger=require("../api/_lib/private-log"),auth=require("../api/_lib/admin-auth"),rate=require("../api/_lib/rate-limit"),notify=require("../api/_lib/notify"),turnstile=require("../api/_lib/turnstile");
process.env.ADMIN_PASSWORD="local-json-test-password-123456";process.env.SUPABASE_URL="https://test.invalid";process.env.SUPABASE_SECRET_KEY="fake";
var marker="Persona PRIVADA correo@example.invalid +5491155551234 nota-secreta key-private token-private Authorization header-private stack-private";
var endpoints=[['event-request','POST',32000],['plan-selection','POST',4000],['plan-inquiry','POST',8000],['proposal','POST',6000],['admin-login','POST',2000],['admin-inquiries','PATCH',1000],['admin-proposals','POST',2000],['admin-bookings','POST',20000],['admin-bookings','PATCH',20000],['admin-quotes','POST',32000],['admin-providers','POST',16000],['admin-providers','DELETE',16000]];
async function call(name,method,body){var res=h.fakeRes();await require('../api/'+name)(h.fakeReq(method,{'content-type':'application/json',cookie:auth.sessionCookie().split(';')[0],'x-listo-admin':'1'},body),res);return res;}
test("S2C todas las escrituras: inválido/array/null/primitivo 400, exceso 413, campos inesperados 400; sin escritura externa",async(t)=>{
  t.mock.method(rate,'guard',async()=>true);t.mock.method(global,'fetch',()=>{throw Error('no debe escribir');});
  for(var [name,method,limit] of endpoints){
    for(var body of ['{', '[]','null','1','"texto"', {unexpected:marker}]){var res=await call(name,method,body);assert.equal(res.statusCode,400,name+' '+method);assert.doesNotMatch(res.body,/Persona|correo@|stack-private/);}
    for(var body of ['{"unexpected":"'+'a'.repeat(limit)+'"}',{unexpected:'a'.repeat(limit)}])assert.equal((await call(name,method,body)).statusCode,413,name+' '+method);
  }
});
test("S2C reader: cuenta UTF-8 en objeto, texto y Buffer; stream multibyte dividido; límite exacto",async()=>{
  var raw=JSON.stringify({name:'é🙂'}),limit=Buffer.byteLength(raw);
  for(var body of [JSON.parse(raw),raw,Buffer.from(raw)]){assert.deepEqual(await http.readJson({headers:{},body},limit),{name:'é🙂'});assert.equal(await http.readJson({headers:{},body},limit-1),null);}
  var req=new events.EventEmitter();req.headers={};var bytes=Buffer.from(raw),res=h.fakeRes(),p=http.readJson(req,limit,res);req.emit('data',bytes.subarray(0,10));req.emit('data',bytes.subarray(10));req.emit('end');assert.deepEqual(await p,{name:'é🙂'});
});
test("S2C streams: exceso responde sin destruir socket ni quedar pendiente; abort/error/close seguros",async()=>{
  for(var event of ['aborted','error','close']){var req=new events.EventEmitter();req.headers={};var res=h.fakeRes(),p=http.readJson(req,10,res);req.emit(event,Error(marker));assert.equal(await p,null);assert.equal(res.statusCode,400);assert.doesNotMatch(res.body,/correo@/);}
  var req=new events.EventEmitter();req.headers={};req.destroy=()=>assert.fail('no destruir antes del 413');var res=h.fakeRes(),ends=0,original=res.end;res.end=function(b){ends++;original.call(this,b);};
  var p=http.readJson(req,5,res);req.emit('data',Buffer.from('123456'));assert.equal(await p,null);req.emit('data',Buffer.from(marker));req.emit('end');assert.equal(res.statusCode,413);assert.equal(ends,1);
});
test("S2C reader: no confía sólo en Content-Length; rechaza profundidad y campo gigante",async(t)=>{
  var res=h.fakeRes();assert.equal(await http.readJson({headers:{'content-length':'999'},body:{}},100,res),null);assert.equal(res.statusCode,413);
  res=h.fakeRes();assert.equal(await http.readJson({headers:{'content-length':'1'},body:'x'.repeat(200)},100,res),null);assert.equal(res.statusCode,413);
  var deep={};for(var n=0;n<10;n++)deep={child:deep};res=h.fakeRes();assert.equal(await http.readJson({headers:{},body:deep},4000,res),null);assert.equal(res.statusCode,400);
  t.mock.method(rate,'guard',async()=>true);assert.equal((await call('plan-inquiry','POST',{name:'a'.repeat(1000)})).statusCode,400);
  res=h.fakeRes();assert.equal(await http.readJson({headers:{},body:{name:{value:'Ana'}}},4000,res,['name']),null);assert.equal(res.statusCode,400);
});
test("S2C logger: nunca serializa mensaje/stack/step/code arbitrario, payloads o headers",(t)=>{
  var logs=[];t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));
  logger.error('[prueba]',Object.assign(new Error(marker),{step:marker,code:marker,status:marker,headers:{Authorization:marker},body:marker}));
  logger.error('[prueba]',{status:502,code:'23505',name:'AbortError',message:marker});
  assert.doesNotMatch(logs.join(' '),/correo@|549115555|Persona|nota-secreta|key-private|token-private|Authorization|header-private|stack-private/);
  assert.deepEqual(JSON.parse(logs[1]),{context:'[prueba]',status:502,code:'23505',kind:'timeout'});
});
test("S2C errores Supabase: logs y respuesta pública/admin no filtran detalles",async(t)=>{
  var logs=[];t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));t.mock.method(rate,'guard',async()=>true);t.mock.method(require('../api/_lib/cost-guard'),'allow',async()=>({allowed:true}));
  t.mock.method(global,'fetch',async()=>h.response(500,{message:marker,code:marker,details:marker,hint:marker}));
  var a=await call('admin-inquiries','GET');assert.equal(a.statusCode,502);
  var b=await call('proposal','POST',{code:'AbCdEf123456',action:'accept'});assert.equal(b.statusCode,502);
  for(var output of [a.body,b.body,logs.join(' ')])assert.doesNotMatch(output,/Persona|correo@|549115555|key-private|token-private|stack-private/);
});
test("S2C Resend: fallo posterior conserva éxito y warning sin log de respuesta externa",async(t)=>{
  var logs=[];t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));t.mock.method(rate,'guard',async()=>true);t.mock.method(require('../api/_lib/cost-guard'),'allow',async()=>({allowed:true}));
  var proposals=require('../api/_lib/proposals');t.mock.method(proposals,'loadByCode',async()=>({id:'p',plan_inquiry_id:'i',status:'proposal_sent',provider_quotes:{availability:'yes'}}));
  t.mock.method(global,'fetch',async()=>h.response(200,[{id:'p',status:'proposal_accepted'}]));
  t.mock.method(notify,'notifyProposalResponse',async()=>{logger.error('[notify]',new Error(marker));return false;});
  var res=await call('proposal','POST',{code:'AbCdEf123456',action:'accept'});assert.equal(res.statusCode,200);assert.match(res.json().warning,/guardada/);assert.doesNotMatch(res.body+logs.join(' '),/correo@|key-private|token-private/);
});
test("S2C Turnstile: códigos externos maliciosos no se registran ni se devuelven",async(t)=>{
  var logs=[];t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));
  var req=h.fakeReq('POST',{host:'listo.test','x-forwarded-host':'listo.test'}),out=await turnstile.verify(req,'token',{env:()=> 'local-test',fetch:async()=>h.response(200,{success:false,'error-codes':[marker]})});
  assert.equal(out.ok,false);assert.doesNotMatch(JSON.stringify(out)+logs.join(' '),/correo@|key-private|token-private/);
});
test("S2C RPC: error no reconocido se traduce; mensajes comerciales versionados se conservan",()=>{
  var clean=require('../api/_lib/rpc-error');assert.doesNotMatch(clean(marker),/correo@|key-private/);assert.equal(clean('El estado cambió mientras tanto. Actualizá el panel.'),'El estado cambió mientras tanto. Actualizá el panel.');
});
test("S2C ningún catch vuelve a loguear errores externos directamente",()=>{
  for(var dir of ['api','api/_lib'])for(var name of fs.readdirSync(path.join(h.ROOT,dir)).filter(n=>n.endsWith('.js')&&n!=='private-log.js')){
    var src=fs.readFileSync(path.join(h.ROOT,dir,name),'utf8');assert.doesNotMatch(src,/console\.(?:error|warn|log)\(/,name);
  }
});
test("S2C Google: error remoto o de red no llega a logs ni a la respuesta",async(t)=>{
  t.mock.method(require('../api/_lib/cost-guard'),'guard',async()=>true);
  var logs=[];t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));t.mock.method(rate,'guard',async()=>true);t.mock.method(require('../api/_lib/cost-guard'),'allow',async()=>({allowed:true}));
  var places=require('../api/_lib/google-places');t.mock.method(places,'searchText',async()=>{throw Object.assign(new Error(marker),{status:500});});
  var prior=process.env.GOOGLE_PLACES_API_KEY;process.env.GOOGLE_PLACES_API_KEY='local-google-test';
  try {var req=h.fakeReq('GET',{}),res=h.fakeRes();req.query={category:'restaurantes',zone:'Palermo'};await require('../api/plan-options')(req,res);assert.equal(res.statusCode,502);assert.doesNotMatch(res.body+logs.join(' '),/correo@|key-private|token-private|stack-private/);}finally{if(prior===undefined)delete process.env.GOOGLE_PLACES_API_KEY;else process.env.GOOGLE_PLACES_API_KEY=prior;}
});
test("S2C notify real: Resend responde con PII y secretos; log privado y fallo contenido",async(t)=>{
  var logs=[];t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));
  var prior=process.env.RESEND_API_KEY;process.env.RESEND_API_KEY='local-resend-test';
  try {var sent=await notify.notifyProposalResponse({url:'https://test.invalid',key:'fake'},{planInquiryId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',action:'accept',quote:{}},async(url)=>/api.resend.com/.test(url)?h.response(500,{message:marker}):h.response(200,[]));assert.equal(sent,false);assert.doesNotMatch(logs.join(' '),/Persona|correo@|549115555|key-private|token-private|Authorization|stack-private/);}finally{if(prior===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=prior;}
});
test("S2C UTF-8 inválido se rechaza en Buffer y stream",async()=>{
  var raw=Buffer.from([123,34,120,34,58,34,255,34,125]),res=h.fakeRes();assert.equal(await http.readJson({headers:{},body:raw},100,res),null);assert.equal(res.statusCode,400);
  var req=new events.EventEmitter();req.headers={};res=h.fakeRes();var p=http.readJson(req,100,res);req.emit('data',raw);req.emit('end');assert.equal(await p,null);assert.equal(res.statusCode,400);
});
test("S2C formulario de cotización largo con emojis conserva el flujo normal",async(t)=>{
  var text='🙂'.repeat(1000),id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  t.mock.method(global,'fetch',async(url,opts)=>/provider_quotes/.test(url)?h.response(201,[{id:'quote'}]):h.response(200,[{id:id,status:'quoted'}]));
  var res=await call('admin-quotes','POST',{plan_inquiry_id:id,total_price:1000,currency:'ARS',availability:'yes',includes:text,conditions:text,internal_notes:text});
  assert.equal(res.statusCode,200);assert.equal(res.json().ok,true);assert.equal(res.json().quote.id,'quote');
});
test("S2C error RPC descarta stack/details/headers y PII extra; conserva conflicto comercial",async(t)=>{
  t.mock.method(global,'fetch',async()=>h.response(200,{ok:false,http_status:409,error:marker,stack:marker,details:marker,headers:{Authorization:marker},item:{id:'id',status:'completed',contact_name:marker,notes:marker}}));
  var res=await call('admin-inquiries','PATCH',{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',status:'completed',expected_status:'confirmed',operation_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'});
  assert.equal(res.statusCode,409);assert.equal(res.json().item.status,'completed');assert.doesNotMatch(res.body,/Persona|correo@|549115555|key-private|token-private|Authorization|stack-private/);
});
