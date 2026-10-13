"use strict";
var test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
var h = require("./helpers"), plan = require("../api/_lib/plan"), places = require("../api/_lib/google-places");
var optionToken = require("../api/_lib/option-token"), guard = require("./matching/guardians");
process.env.SUPABASE_URL = "https://test.invalid";
process.env.SUPABASE_SECRET_KEY = "fake";
process.env.RATE_LIMIT_SECRET = "f5-local-rate-secret-1234567890123456";
process.env.PHOTO_SIGNING_SECRET = "f5-local-photo-secret-123456789012345";
process.env.GOOGLE_PLACES_API_KEY = "fake-google";
var REQUEST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", SELECTION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", OP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
function fixture(i, extra) {
  return Object.assign({id:"ChIJabcdefghij000" + i, displayName:{text:"Fixture " + i}, primaryType:"restaurant", businessStatus:"OPERATIONAL", rating:4.5, userRatingCount:100,
    formattedAddress:"Calle " + i + ", Palermo, CABA", addressComponents:[{longText:"Palermo", types:["neighborhood"]}]}, extra || {});
}
function pick(found, profile, zone) {
  var map = Object.create(null), status = {}; found.forEach(p => {map[p.id]=p; status[p.id]=p.businessStatus;});
  return plan.pickAdequateOptions(places.toProviderRows(found).rows, zone || "Palermo", status, 3, {profile:profile || "dinner", placesById:map});
}
async function call(file, method, body, query) {
  var req = h.fakeReq(method, method === "POST" ? {"content-type":"application/json"} : {}, body), res = h.fakeRes(); req.query = query;
  await require("../api/" + file)(req, res); return res;
}
function network(found, extra) {
  return h.mockFetch([h.rpcRule(), {match:/places:searchText$/, reply:() => h.response(200, {places:found})},
    {match:/\/rest\/v1\/providers/, reply:c => h.response(c.method === "GET" ? 200 : 201, c.method === "GET" ? [] : null)}].concat(extra || []));
}
function bad() { return [fixture(6,{rating:3.9}), fixture(7,{userRatingCount:19}), fixture(8,{primaryType:"hospital"}), fixture(9,{businessStatus:"CLOSED_PERMANENTLY"})]; }
test("F5 filtra antes del top tres: devuelve 0/1/2 sin relleno, también si malas vienen primero", () => {
  for (var count of [0,1,2,3]) {
    var good = Array.from({length:count}, (_,i) => fixture(i+1));
    assert.deepEqual(pick(bad().concat(good)).map(r => r.google_place_id), good.map(p => p.id));
  }
  assert.equal(pick([fixture(1,{rating:null}), fixture(2,{userRatingCount:null}), fixture(3,{primaryType:undefined})]).length, 0);
  assert.equal(pick([fixture(1), fixture(1), fixture(2,{displayName:{text:"Fixture 1"}})]).length, 1);
});
test("F5 no confunde Av. Belgrano con barrio y no inventa cercanía", () => {
  var row = places.toProviderRow(fixture(1,{addressComponents:[], formattedAddress:"Av. Belgrano 123, Monserrat, CABA"}));
  assert.equal(plan.zoneMatches(row,"Belgrano"), false);
  assert.equal(plan.optionZoneNotice(row,"Belgrano"), "Zona a confirmar.");
  assert.equal(plan.optionZoneNotice(row,""), "");
  assert.equal(plan.optionZoneNotice(places.toProviderRow(fixture(1)),"Palermo"), "");
});
test("F5 endpoint 0/1/2: mensaje y coordinación, no-store, una sola búsqueda, tokens válidos", async t => {
  for (var count of [0,1,2]) {
    var found = bad().concat(Array.from({length:count},(_,i) => fixture(i+1))), fetch = network(found); t.mock.method(global,"fetch",fetch);
    var res = await call("plan-options.js","GET",null,{profile:"dinner",zone:"Palermo",original_prompt:"SENTINEL privado",allergies:"SENTINEL privado",email:"private@example.invalid"});
    assert.equal(res.statusCode,200); assert.equal(res.json().options.length,count); assert.equal(res.headers["cache-control"],"no-store");
    assert.equal(res.json().fallback.manual_coordination,true); assert.ok(res.json().fallback.message);
    assert.deepEqual(res.json().fallback,plan.optionsFeedback(res.json().options));
    assert.equal(fetch.calls.filter(c=>/places:searchText$/.test(c.url)).length,1);
    var google = fetch.calls.find(c=>/places:searchText$/.test(c.url));
    assert.deepEqual(JSON.parse(google.body),{textQuery:"restaurantes en palermo, Buenos Aires",pageSize:20,languageCode:"es",regionCode:"AR"});
    assert.doesNotMatch(JSON.stringify(fetch.calls),/SENTINEL|private@example/);
    res.json().options.forEach(o=>assert.equal(optionToken.verify(process.env.PHOTO_SIGNING_SECRET,o.google_place_id,o.option_token),""));
    for(var c of fetch.calls.filter(c=>c.method!=="GET"&&/providers/.test(c.url))) {
      JSON.parse(c.body).forEach(r=>assert.deepEqual(Object.keys(r).sort(),["google_place_id","source","provider_status","last_verified_at"].sort()));
    }
  }
});
test("F5 fuera de zona siempre marcada, incluso todas fuera; local precede y no se afirma distancia", async t => {
  var found = [fixture(1,{addressComponents:[{longText:"Belgrano",types:["neighborhood"]}]}),fixture(2,{addressComponents:[],formattedAddress:"Calle 2"})];
  var fetch = network(found); t.mock.method(global,"fetch",fetch);
  var res = await call("plan-options.js","GET",null,{profile:"dinner",zone:"Palermo"});
  assert.equal(res.json().options.length,2);
  assert.ok(res.json().options.every(o=>o.outside_zone&&o.zone_notice));
  assert.equal(res.json().options[0].zone_notice,"Puede quedar fuera de la zona exacta.");
  assert.equal(res.json().options[1].zone_notice,"Zona a confirmar.");
  assert.ok(res.json().fallback.outside_zone_message); assert.equal(res.json().fallback.manual_coordination,true);
  assert.doesNotMatch(JSON.stringify(res.json()),/cerca|metros|kilómetros/);
  assert.equal(pick(found.concat(fixture(3)))[0].google_place_id,fixture(3).id);
});
test("F5 categoría vieja sigue con array compatible y filtro honesto", async t => {
  var fetch = network([fixture(1),fixture(2),...bad()]); t.mock.method(global,"fetch",fetch);
  var res = await call("plan-options.js","GET",null,{category:"restaurantes",zone:"Palermo"});
  assert.equal(res.statusCode,200); assert.equal(res.json().category,"restaurantes"); assert.equal(res.json().options.length,2);
  assert.equal(res.json().profile,null);
  fetch = network([fixture(1,{addressComponents:[{longText:"Belgrano",types:["neighborhood"]}]}),fixture(2,{addressComponents:[],formattedAddress:"Calle 2"})]);
  t.mock.method(global,"fetch",fetch);
  var outside=await call("plan-options.js","GET",null,{category:"restaurantes",zone:"Palermo"});
  assert.equal(outside.statusCode,200);assert.equal(outside.json().options.length,0);assert.equal(outside.json().fallback.manual_coordination,true);
});
test("F5 opciones 1/2: elegir y Quiero avanzar usan handlers reales; replay no duplica ni avisa", async t => {
  t.mock.method(require("../api/_lib/turnstile"),"verify",async()=>({ok:true}));
  for (var count of [1,2]) {
    var stored=false,emails=0,created=0;
    t.mock.method(require("../api/_lib/notify"),"notifyInquiry",async()=>{emails++;return true;});
    var fetch = network(Array.from({length:count},(_,i)=>fixture(i+1)),[
      {match:/\/rest\/v1\/event_requests/,reply:()=>h.response(200,[{id:REQUEST,dietary_requirements:[]}])},
      {match:/rpc\/listo_replace_selection$/,reply:c=>{var b=JSON.parse(c.body);assert.equal(b.p_place_id,fixture(1).id);return h.response(200,{ok:true,changed:true,selection:{id:SELECTION,status:"interested"}});}},
      {match:/rpc\/listo_save_inquiry$/,reply:c=>{
        var b=JSON.parse(c.body);assert.equal(b.p_selection_id,SELECTION);assert.equal(b.p_place_id,fixture(1).id);assert.equal(b.p_operation_id,OP);
        var replay=stored;if(!stored){stored=true;created++;}return h.response(200,{ok:true,selectionId:SELECTION,inquiryId:OP,status:"inquiry_requested",updated:false,already_applied:replay,notify:!replay});
      }}
    ]);t.mock.method(global,"fetch",fetch);
    var options=(await call("plan-options.js","GET",null,{profile:"dinner",zone:"Palermo"})).json().options;
    assert.equal(options.length,count);
    var selected=await call("plan-selection.js","POST",{event_request_id:REQUEST,google_place_id:options[0].google_place_id,option_token:options[0].option_token,expected_selection_id:null,selection_id:SELECTION});
    assert.equal(selected.statusCode,200); assert.equal(selected.json().selection.id,SELECTION);
    var body={event_request_id:REQUEST,google_place_id:options[0].google_place_id,selection_id:SELECTION,operation_id:OP,name:"Fixture",phone:"11111111",event_date:new Date(Date.now()+864e5).toISOString().slice(0,10),approximate_time:"20:00",turnstile_token:"fake"};
    assert.equal((await call("plan-inquiry.js","POST",body)).statusCode,200);
    var repeat=await call("plan-inquiry.js","POST",body);assert.equal(repeat.statusCode,200);assert.equal(repeat.json().already_applied,true);
    assert.equal(created,1);assert.equal(emails,1);
    assert.equal(fetch.calls.filter(c=>/places:searchText$/.test(c.url)).length,1);
  }
});
function renderer(list) {
  var src=fs.readFileSync(path.join(h.ROOT,"app.js"),"utf8");
  function grab(name){var start=src.indexOf("  function "+name+"(");assert.ok(start>=0);return src.slice(start,src.indexOf("\n  }\n",start)+4);}
  var box={innerHTML:""}, titles=[{textContent:""},{textContent:""}];
  var render=new Function("state","$","$all","hardRequirements","renderSensitive","photoHTML","safeHttps","ratingText","shareText","markSelected","watchImage","PRICE_NOTE","GMAPS","LISTO_WHATSAPP",
    grab("escapeHTML")+grab("setOptionsTitle")+grab("optionsFeedback")+grab("optionsFeedbackHTML")+grab("renderOptions")+'renderOptions();return {html:$("#proposals").innerHTML,feedback:optionsFeedback(state.options),title:$all("#proposals-title .line > span").map(x=>x.textContent).join(" ")};');
  return render({options:list,selected:null,text:"SENTINEL contacto privado",data:{allergy:"SENTINEL alergia"}},()=>box,sel=>sel==="#proposals-title .line > span"?titles:[],()=>[],()=>{throw Error("unexpected hard");},()=>"",()=>"",()=>"",()=>"",()=>{},()=>{},"Precio y disponibilidad a confirmar","Google Maps","5491158065840");
}
test("F5 renderer real muestra mensajes, avisos y acciones con 0/1/2; manual no incluye PII", () => {
  for(var count of [0,1,2,3]) {
    var list=Array.from({length:count},(_,i)=>({google_place_id:fixture(i+1).id,name:"Fixture",outside_zone:i===0,zone_notice:"Zona a confirmar."}));
    var out=renderer(list);assert.deepEqual(out.feedback,plan.optionsFeedback(list));
    assert.equal(out.title,count===0?"Busquemos otra forma.":count+(count===1?" forma":" formas")+" de hacerlo.");
    assert.equal((out.html.match(/data-choose=/g)||[]).length,count);assert.equal((out.html.match(/data-advance=/g)||[]).length,count);
    assert.match(out.html,/Coordinar con LISTO/);assert.match(out.html,/wa.me\/5491158065840/);assert.match(out.html,/rel="noopener noreferrer"/);assert.doesNotMatch(out.html,/SENTINEL/);
    if(count)assert.match(out.html,/Zona a confirmar/);
    assert.deepEqual(guard.issues({id:"fixture",text:out.feedback.message+out.feedback.outside_zone_message}),[]);
  }
  var ordinary=renderer(Array.from({length:3},(_,i)=>({google_place_id:fixture(i+1).id,name:"Fixture"})));
  assert.doesNotMatch(ordinary.html,/Coordinar con LISTO|proposals-message/);
  assert.doesNotMatch(fs.readFileSync(path.join(h.ROOT,"app.js"),"utf8").split("function optionsFeedbackHTML")[1].split("function renderOptions")[0],/state.text|currentDiet|contact_email|contact_phone|original_prompt/);
});
test("F5 snapshot mantiene queries/mundo y marca todas las opciones externas sin aviso", () => {
  var baseline=require("./fixtures/matching/baseline-f5.json");assert.deepEqual(require("./matching/f5").report(),baseline);
  assert.deepEqual(baseline.before,require("./fixtures/matching/baseline-f2.json").after);
  assert.equal(baseline.after.summary.outsideUnwarned,0);
  assert.ok(baseline.after.summary.padding<baseline.before.summary.padding);
  assert.ok(baseline.after.summary.scenariosShowingFewerThan3>baseline.before.summary.scenariosShowingFewerThan3);
  assert.equal(baseline.after.summary.distinctSearches,baseline.before.summary.distinctSearches);
  assert.ok(baseline.after.summary.averageShown<baseline.averageShownBefore);
  for(var key of ["prohibitedTexts","unverifiedClaims","unsupportedReasons"])assert.equal(baseline.after.summary[key],0);
});
