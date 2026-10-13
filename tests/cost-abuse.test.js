"use strict";
var test=require('node:test'),assert=require('node:assert/strict'),h=require('./helpers'),rate=require('../api/_lib/rate-limit'),cost=require('../api/_lib/cost-guard'),photos=require('../api/_lib/photos'),auth=require('../api/_lib/admin-auth'),notify=require('../api/_lib/notify'),inquiries=require('../api/_lib/inquiries'),turnstile=require('../api/_lib/turnstile'),proposals=require('../api/_lib/proposals');
process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='fake';process.env.RATE_LIMIT_SECRET='local-rate-cost-secret-123456789012345';process.env.PHOTO_SIGNING_SECRET='local-photo-cost-secret-123456789012345';process.env.GOOGLE_PLACES_API_KEY='fake-google';process.env.ADMIN_PASSWORD='local-admin-cost-password-123456';
var ID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',PLACE='ChIJabcdefghij0001',NAME='places/'+PLACE+'/photos/AbCdEfGhIjKlMnOp';
function q(){return Object.fromEntries(new URL(photos.signedSrc(process.env.PHOTO_SIGNING_SECRET,NAME,480),'https://test.invalid').searchParams);}
async function photo(query,ip,method,headers){var req=h.fakeReq(method||'GET',headers||{},undefined,ip),res=h.fakeRes();req.query=query;await require('../api/place-photo')(req,res);return res;}
async function search(ip,zone){var req=h.fakeReq('GET',{},undefined,ip),res=h.fakeRes();req.query={category:'restaurantes',zone:zone||'Palermo'};await require('../api/plan-options')(req,res);return res;}
async function cap(scope,max,fn){var prev=rate.LIMITS[scope].max;rate.LIMITS[scope].max=max;try{return await fn();}finally{rate.LIMITS[scope].max=prev;}}
function world(){return h.mockFetch([h.rpcRule(),{match:/places:searchText$/,reply:()=>h.response(200,{places:[]})},{match:/\/media\?/,reply:()=>h.response(200,{photoUri:'https://lh3.googleusercontent.com/photo'})}]);}
function googleCalls(fetch){return fetch.calls.filter(c=>/places.googleapis.com/.test(c.url));}
test('S2D búsqueda idéntica: dos intentos, tercero 429 antes de Google; otra búsqueda funciona',async(t)=>{
  var fetch=world();t.mock.method(global,'fetch',fetch);
  assert.equal((await search('10.20.0.1')).statusCode,200);assert.equal((await search('10.20.0.1','pálermo')).statusCode,200);
  var blocked=await search('10.20.0.1','Palermo');assert.equal(blocked.statusCode,429);assert.ok(blocked.headers['retry-after']);assert.equal(googleCalls(fetch).length,2);
  assert.equal((await search('10.20.0.1','Belgrano')).statusCode,200);assert.equal(googleCalls(fetch).length,3);
});
test('S2D búsqueda global/día: cambiar IP no evade el presupuesto compartido',async(t)=>{
  for(var scope of ['search_all','search_day'])await cap(scope,2,async()=>{var fetch=world();t.mock.method(global,'fetch',fetch);assert.equal((await search('10.20.1.1')).statusCode,200);assert.equal((await search('10.20.1.2')).statusCode,200);assert.equal((await search('10.20.1.3')).statusCode,429);assert.equal(googleCalls(fetch).length,2);});
});
test('S2D fotos: misma firma compartida entre visitantes y copias queda limitada; sin cachear',async(t)=>{
  await cap('photo_signature',2,async()=>{var fetch=world();t.mock.method(global,'fetch',fetch);var query=q();
    assert.equal((await photo(query,'10.20.2.1')).statusCode,302);
    var req=h.fakeReq('GET',{},undefined,'10.20.2.2'),res=h.fakeRes();req.query=query;await h.fresh('api/place-photo.js')(req,res);assert.equal(res.statusCode,302);assert.equal(res.headers['cache-control'],'no-store');
    assert.equal((await photo(query,'10.20.2.3')).statusCode,429);assert.equal(googleCalls(fetch).length,2);
    var payloads=fetch.calls.filter(c=>/rpc/.test(c.url)).map(c=>JSON.parse(c.body));assert.ok(payloads.every(b=>/^[a-f0-9]{64}$/.test(b.p_key)));
    assert.doesNotMatch(JSON.stringify(payloads),/places\/|AbCdEf|10\.20|Palermo/);
  });
});
test('S2D fotos: inválida/vencida/hotlink cross-site y HEAD no llaman a Google ni a Supabase',async(t)=>{
  var fetch=world();t.mock.method(global,'fetch',fetch);
  assert.equal((await photo(Object.assign(q(),{sig:'incorrecta'}))).statusCode,403);
  var expired=Object.fromEntries(new URL(photos.signedSrc(process.env.PHOTO_SIGNING_SECRET,NAME,480,Math.floor(Date.now()/1000)-7200),'https://test.invalid').searchParams);
  assert.equal((await photo(expired)).statusCode,410);
  assert.equal((await photo(q(),undefined,'GET',{'sec-fetch-site':'cross-site'})).statusCode,403);
  assert.equal((await photo(q(),undefined,'HEAD')).statusCode,204);assert.equal(fetch.calls.length,0);
});
test('S2D fotos: topes por visitante/global/día; URL nueva no evade total',async(t)=>{
  for(var scope of ['photo_visitor','photo_all','photo_day'])await cap(scope,1,async()=>{var fetch=world();t.mock.method(global,'fetch',fetch);assert.equal((await photo(q(),'10.20.3.1')).statusCode,302);var next=Object.fromEntries(new URL(photos.signedSrc(process.env.PHOTO_SIGNING_SECRET,NAME,800),'https://test.invalid').searchParams);assert.equal((await photo(next,scope==='photo_visitor'?'10.20.3.1':'10.20.3.2')).statusCode,429);assert.equal(googleCalls(fetch).length,1);});
});
test('S2D Google público: si Supabase cae o falta secreto, no hay fallback facturable',async(t)=>{
  t.mock.method(console,'error',()=>{});
  for(var status of [404,500]){var fetch=h.mockFetch([{match:/rpc/,reply:()=>h.response(status,{code:'PGRST202'})}]);t.mock.method(global,'fetch',fetch);assert.equal((await search('10.20.4.1')).statusCode,503);assert.equal((await photo(q(),'10.20.4.1')).statusCode,503);assert.equal(googleCalls(fetch).length,0);}
  var prev=process.env.RATE_LIMIT_SECRET;process.env.RATE_LIMIT_SECRET='corto';try{var fetch=world();t.mock.method(global,'fetch',fetch);assert.equal((await photo(q())).statusCode,503);assert.equal(googleCalls(fetch).length,0);}finally{process.env.RATE_LIMIT_SECRET=prev;}
});
test('S2D admin: detalle normal disponible; presupuesto agotado devuelve fallback honesto, sesión exigida',async(t)=>{
  await cap('admin_details_all',1,async()=>{var fetch=h.mockFetch([h.rpcRule(),{match:/places.googleapis.com/,reply:()=>h.response(200,{id:PLACE,displayName:{text:'Lugar de prueba'}})}]);t.mock.method(global,'fetch',fetch);
    async function admin(cookie,ip){var req=h.fakeReq('GET',{cookie:cookie||''},undefined,ip),res=h.fakeRes();req.query={place_id:PLACE};await require('../api/admin-providers')(req,res);return res;}
    assert.equal((await admin()).statusCode,401);var cookie=auth.sessionCookie().split(';')[0];assert.equal((await admin(cookie,'10.20.5.1')).json().place.name,'Lugar de prueba');var denied=await admin(cookie,'10.20.5.2');assert.equal(denied.statusCode,200);assert.equal(denied.json().place.ok,false);assert.ok(denied.json().place.maps_url);assert.equal(googleCalls(fetch).length,1);
  });
});
test('S2D scopes nuevos: usan SQL existente, ventanas permitidas y huellas diferentes',async(t)=>{
  var fetch=world(),req=h.fakeReq('GET',{},undefined,'10.20.6.1');
  var scopes=['search_repeat','photo_signature','photo_all','email_all','email_day','admin_details','proposal_details_day'];
  for(var scope of scopes)assert.equal((await rate.check(req,scope,{fetch:fetch,key:'firma-opaca'})).allowed,true);
  var bodies=fetch.calls.map(c=>JSON.parse(c.body));assert.equal(new Set(bodies.map(b=>b.p_key)).size,scopes.length);assert.ok(bodies.every(b=>rate.SCOPES.includes(b.p_scope)&&b.p_window_seconds>=10&&b.p_window_seconds<=86400&&b.p_max<=10000));
  assert.equal((await cost.allow(req,['photo_signature'],{fetch:fetch})).allowed,false);
});
test('S2D presupuesto de email: inquiry guardada queda exitosa con warning/aviso fallido; replay no consume ni envía',async(t)=>{
  t.mock.method(rate,'guard',async()=>true);t.mock.method(turnstile,'verify',async()=>({ok:true}));t.mock.method(console,'error',()=>{});
  var replay=false,checks=0,emails=0,patches=[];
  t.mock.method(cost,'allow',async()=>{checks++;return {allowed:false,source:'supabase'};});
  t.mock.method(inquiries,'saveInquiry',async()=>({notify:!replay,already_applied:replay,inquiryId:ID,status:'inquiry_requested'}));
  t.mock.method(notify,'notifyInquiry',async()=>{emails++;return true;});
  t.mock.method(global,'fetch',async(url,opts)=>{patches.push({url,body:JSON.parse(opts.body)});return h.response(204,'');});
  var body={event_request_id:ID,google_place_id:PLACE,name:'Ana',phone:'11111111',event_date:new Date(Date.now()+864e5).toISOString().slice(0,10),approximate_time:'20:00'};
  async function send(){var res=h.fakeRes();await require('../api/plan-inquiry')(h.fakeReq('POST',{'content-type':'application/json'},body),res);return res;}
  var first=await send();assert.equal(first.statusCode,200);assert.match(first.json().warning,/guardada/);assert.equal(patches[0].body.notification_status,'failed');assert.ok(patches[0].url.endsWith('id=eq.'+ID));
  replay=true;assert.equal((await send()).json().already_applied,true);assert.equal(checks,1);assert.equal(emails,0);assert.equal(patches.length,1);
});
test('S2D propuesta respondida: límite de email no revierte PATCH; retry no envía ni cuenta de nuevo',async(t)=>{
  t.mock.method(rate,'guard',async()=>true);var row={id:ID,plan_inquiry_id:ID,status:'proposal_sent',provider_quotes:{availability:'yes'}},emails=0,checks=0,writes=0;
  t.mock.method(proposals,'loadByCode',async()=>row);t.mock.method(cost,'allow',async()=>{checks++;return {allowed:false};});t.mock.method(notify,'notifyProposalResponse',async()=>{emails++;return true;});t.mock.method(global,'fetch',async()=>{writes++;return h.response(200,[{id:ID,status:'proposal_accepted'}]);});
  async function send(){var res=h.fakeRes();await require('../api/proposal')(h.fakeReq('POST',{'content-type':'application/json'},{code:'AbCdEf123456',action:'accept'}),res);return res;}
  var first=await send();assert.equal(first.statusCode,200);assert.match(first.json().warning,/guardada/);row.status='proposal_accepted';assert.equal((await send()).statusCode,200);assert.equal(emails,0);assert.equal(checks,1);assert.equal(writes,1);
});
test('S2D límites diarios de emails son compartidos y no mezclan respuestas de propuestas',async(t)=>{
  await cap('email_day',2,async()=>{var fetch=world(),opts={fetch:fetch};
    assert.equal((await cost.allow(h.fakeReq('GET',{},undefined,'10.21.0.1'),['email_all','email_day'],opts)).allowed,true);
    assert.equal((await cost.allow(h.fakeReq('GET',{},undefined,'10.21.0.2'),['email_all','email_day'],opts)).allowed,true);
    assert.equal((await cost.allow(h.fakeReq('GET',{},undefined,'10.21.0.3'),['email_all','email_day'],opts)).allowed,false);
    assert.equal((await rate.check(h.fakeReq('GET',{},undefined,'10.21.0.1'),'proposal_response',opts)).allowed,true);
  });
});
test('S2D controles simultáneos de foto: sólo el presupuesto permitido llega a Google',async(t)=>{
  await cap('photo_signature',1,async()=>{var fetch=world();t.mock.method(global,'fetch',fetch);var query=q();var replies=await Promise.all([photo(query,'10.22.0.1'),photo(query,'10.22.0.2')]);assert.deepEqual(replies.map(r=>r.statusCode).sort(),[302,429]);assert.equal(googleCalls(fetch).length,1);});
});
