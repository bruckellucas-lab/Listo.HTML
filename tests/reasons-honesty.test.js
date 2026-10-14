"use strict";
var test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
var h=require("./helpers"),plan=require("../api/_lib/plan"),guard=require("./matching/reason-guardians");
var cases=require("./fixtures/matching/f3/reasons.json");
var source=fs.readFileSync(path.join(h.ROOT,"app.js"),"utf8");
function grab(name){var start=source.indexOf("  function "+name+"(");assert.ok(start>=0,name);return source.slice(start,source.indexOf("\n  }\n",start)+4);}
var cardReason=new Function(grab("reasonForCard")+"return reasonForCard;")();
var visible=new Function(grab("reasonForCard")+grab("visibleReason")+"return visibleReason;")();
test("F3 etiquetas cerradas con fuente: tipos y zona tienen prueba actual, política no certifica",()=>{
 for(var c of cases){var reasons=plan.optionReasons({zone:c.zone},"Palermo",{primaryType:c.primaryType});
  assert.deepEqual(reasons,[{code:"profile_type",label:c.expectedTypeLabel,source:"google_maps",verified:true},{code:"zone_match",label:c.expectedZoneLabel,source:"google_maps",verified:true},{code:"manual_confirmation",label:"Precio y disponibilidad a confirmar",source:"listo_policy",verified:false}]);
  for(var r of reasons)assert.deepEqual(guard.reasonIssues(r,c),[]);
  assert.equal(visible({reasons},false),c.expectedTypeLabel);
 }
});
test("F3 zona: padre no prueba sub-barrio exacto; calle, zona ajena/ausente llevan incertidumbre",()=>{
 for(var [row,wanted] of [[{zone:"Palermo"},"Palermo Soho"],[{zone:"Belgrano"},"Belgrano R"],[{zone:"Belgrano"},"Palermo"],[{address:"Av. Palermo 123, Belgrano"},"Palermo"],[{},"Palermo"]]){
  var reasons=plan.optionReasons(row,wanted,{primaryType:"restaurant"});assert.equal(reasons[1].code,"zone_uncertain");assert.equal(reasons[1].label,"Zona a confirmar");
 }
 assert.equal(plan.optionReasons({zone:"Palermo Soho"},"Palermo",{primaryType:"restaurant"})[1].label,"En Palermo · Datos de Google Maps");
 assert.equal(plan.optionReasons({address:"Gorriti 1, Palermo, CABA"},"Palermo",{primaryType:"restaurant"})[1].label,"En Palermo · Datos de Google Maps");
 assert.equal(plan.optionReasons({zone:"Palermo"},"",{primaryType:"restaurant"}).length,2);
 assert.equal(plan.optionReasons({zone:"Ana Perez"},"Ana Perez",{primaryType:"restaurant"})[1].label,"Zona a confirmar");
});
test("F3 guardianes bloquean TODO el catálogo prohibido, variantes y afirmaciones mezcladas",()=>{
 var banned=["apto","apta","sin TACC","TACC","celíaco","celiaco","gluten free","gluten-free","kosher","halal","certificado","verificado","verificar dieta","disponible","disponibilidad confirmada","reserva confirmada","reservá","reservar ahora","acepta reservas","evento privado","eventos privados","capacidad","hasta 20 personas","entran 50 personas","para 120 personas","hasta X personas","para veinte personas","entran 20,5 personas","precio desde","desde $","ARS","por persona","ideal para tu grupo","recomendado","garantizado","confirmado"];
 for(var text of banned){assert.ok(guard.textIssues(text).length,text);assert.ok(guard.textIssues(text.toUpperCase()).length,text);assert.ok(guard.textIssues("Precio y disponibilidad a confirmar. "+text).length,text);}
 assert.ok(guard.textIssues("g\u200bluten-free").length);
 assert.ok(guard.textIssues("disponibilidad a confirmar").length,"sólo frase completa es excepción");
 for(var label of Object.values(plan.REASON_LABELS).concat(Object.values(plan.ZONE_REASON_LABELS)))assert.deepEqual(guard.textIssues(label),[],label);
 assert.deepEqual(guard.textIssues("Precio y disponibilidad a confirmar"),[]);
});
var f4aClaims = {
 recommendation: ["Ideal para cumpleaños", "Ideal para grupos grandes", "ideal", "ideal para", "recomendado", "recomendada", "recomendados", "recomendadas", "el mejor", "la mejor", "mejor de", "Muy popular", "popular", "top", "favorito", "garantizado"],
 private: ["privado", "privada", "privados", "privadas", "Salón privado", "espacio privado", "evento privado", "eventos privados", "exclusivo", "exclusiva"],
 dietary: ["100% vegano", "Opciones veganas", "Vegetariano", "vegano", "vegana", "veganos", "veganas", "vegan", "vegetariano", "vegetariana", "vegetarianos", "vegetarianas", "Sin lactosa", "lactosa", "alérgico", "alergico", "alérgica", "alergica", "alérgicos", "alergicos", "alergias", "alergia", "Seguro para alérgicos", "seguro para alergicos", "seguro", "segura", "seguros", "seguras", "apto vegano", "apto vegetariano", "libre de gluten"],
 price: ["Precio accesible", "Barato", "barata", "baratos", "baratas", "Económico", "economico", "económica", "economica", "accesible", "buen precio", "barato por persona"]
};
for (let [family, claims] of Object.entries(f4aClaims)) {
 test("F4A bloquea claims de " + family + " incluso normalizados o mezclados",()=>{
  for (var text of claims) {
   var variants = [text, text.toUpperCase(), text.normalize("NFKD"), text.replace(/ /g,"-"), text.split("").join("\u200b")];
   for (var label of variants) {
    assert.ok(guard.textIssues(label).includes("forbidden-claim"),label);
    assert.ok(guard.textIssues("Precio y disponibilidad a confirmar. " + label).length,label);
    assert.ok(guard.textIssues(label + ". Preferencias alimentarias a confirmar").length,label);
    assert.ok(guard.reasonIssues({code:"profile_type",label,source:"google_maps",verified:true},{primaryType:"restaurant"}).includes("forbidden-claim"),label);
   }
  }
 });
}
test("F4A conserva todas las etiquetas actuales y confirmar sin habilitar claims mezclados",()=>{
 var labels = ["Parrilla · Datos de Google Maps", "Restaurante · Datos de Google Maps", "Bar · Datos de Google Maps", "Café · Datos de Google Maps", "Salón / espacio · Datos de Google Maps", "Lugar para eventos · Datos de Google Maps", "Zona a confirmar", "Precio y disponibilidad a confirmar", "Preferencias alimentarias a confirmar"];
 for (var label of labels.concat(Object.values(plan.ZONE_REASON_LABELS))) assert.deepEqual(guard.textIssues(label),[],label);
 assert.deepEqual(guard.textIssues("Confirmar"),[]);
 for (var text of ["Precio y disponibilidad a confirmar. Disponible", "Precio y disponibilidad a confirmar. Reserva confirmada", "Precio y disponibilidad a confirmar. El mejor de Palermo"]) assert.ok(guard.textIssues(text).length,text);
});
test("F3 source y flags no bastan: fuente ajena, tipo falso, zona sin prueba, extra fields fallan",()=>{
 var type=plan.optionReasons({zone:"Palermo"},"Palermo",{primaryType:"restaurant"})[0];
 assert.ok(guard.reasonIssues(type,{primaryType:"cafe"}).length);
 assert.ok(guard.reasonIssues({...type,source:"listo_policy"},{primaryType:"restaurant"}).length);
 assert.ok(guard.reasonIssues({...type,verified:false},{primaryType:"restaurant"}).length);
 assert.ok(guard.reasonIssues({...type,label:"Parrilla · Datos de Google Maps"},{primaryType:"restaurant"}).length);
 var zone=plan.optionReasons({zone:"Palermo"},"Palermo",{primaryType:"restaurant"})[1];
 assert.ok(guard.reasonIssues(zone,{expectedZoneLabel:null}).length);
 assert.ok(guard.reasonIssues({...type,notes:"privado"},{primaryType:"restaurant"}).length);
 for(var label of ["apto","Kosher","precio desde $100","disponible el sábado"]){assert.equal(visible({reasons:[{...type,label}]},false),"");assert.ok(guard.reasonIssues({...type,label},{primaryType:"restaurant"}).length);}
});
test("F3 preferencias suaves: reason local de política, sin inferir dieta segura por tipo Google",()=>{
 var reasons=plan.optionReasons({zone:"Palermo"},"Palermo",{primaryType:"vegan_restaurant"});
 assert.equal(reasons[0].label,"Restaurante · Datos de Google Maps");
 var policy=cardReason({reasons},true);
 assert.deepEqual(policy,{code:"dietary_unverified",label:"Preferencias alimentarias a confirmar",source:"listo_policy",verified:false});
 assert.deepEqual(guard.reasonIssues(policy,{softPreference:true}),[]);assert.ok(guard.reasonIssues(policy,{}).length);
 assert.equal(visible({reasons},true),"Preferencias alimentarias a confirmar");
 for(var code of ["celiac_safe","kosher","halal","allergy"]){var poisoned={original_prompt:code,dietary_requirements:[{code,level:"hard",detail:"privado"}],guests:120,budget:1000,date:"2030-01-01",time:"20:00"};
  assert.deepEqual(plan.optionReasons({...poisoned,zone:"Palermo"},"Palermo",{primaryType:"restaurant",...poisoned}),plan.optionReasons({zone:"Palermo"},"Palermo",{primaryType:"restaurant"}));
 }
 for(var [rating,review_count] of [[1,0],[5,100000]])assert.deepEqual(plan.optionReasons({zone:"Palermo",rating,review_count},"Palermo",{primaryType:"restaurant",rating,userRatingCount:review_count}),plan.optionReasons({zone:"Palermo"},"Palermo",{primaryType:"restaurant"}));
 for(var n of [20,50,120])assert.deepEqual(plan.optionReasons({zone:"Palermo",guests:n,budget:10000,date:"2030-01-01"},"Palermo",{primaryType:"restaurant"}),plan.optionReasons({zone:"Palermo"},"Palermo",{primaryType:"restaurant"}));
});
test("F3 renderer real: una reason por tarjeta, escape/whitelist y guard F4 antes de razones",()=>{
 var box={innerHTML:""},titles=[{textContent:""},{textContent:""}],hard=false;
 var run=new Function("state","$","$all","hardRequirements","softPreferences","renderSensitive","photoHTML","safeHttps","ratingText","shareText","markSelected","watchImage","PRICE_NOTE","GMAPS","LISTO_WHATSAPP",grab("escapeHTML")+grab("setOptionsTitle")+grab("optionsFeedback")+grab("optionsFeedbackHTML")+grab("reasonForCard")+grab("visibleReason")+grab("renderOptions")+"renderOptions();");
 function render(options,soft){box.innerHTML="";run({options,selected:null},()=>box,s=>s==="#proposals-title .line > span"?titles:[],()=>hard?[{code:"allergy",level:"hard"}]:[],()=>soft?[{code:"vegan",level:"soft"}]:[],()=>{box.innerHTML="COORDINACION";},()=>"",()=>"",()=>"",()=>"",()=>{},()=>{},"Precio y disponibilidad a confirmar","Google Maps","5491158065840");return box.innerHTML;}
 var option={google_place_id:"ChIJabcdefghij0001",name:"Fixture",reasons:plan.optionReasons({zone:"Palermo"},"Palermo",{primaryType:"restaurant"})};
 for(var n of [0,1,2]){var html=render(Array.from({length:n},()=>option),false);assert.equal((html.match(/card-reason/g)||[]).length,n);}
 assert.match(render([option],true),/card-reason">Preferencias alimentarias a confirmar/);
 assert.match(render([{...option,outside_zone:true,zone_notice:"Zona a confirmar."}],false),/Zona a confirmar/);
 hard=true;assert.equal(render([option],true),"COORDINACION");
 hard=false;assert.doesNotMatch(render([{...option,reasons:[{code:"profile_type",label:"<script>apto</script>",source:"google_maps",verified:true}]}],false),/card-reason|<script>/);
 assert.doesNotMatch(render([{...option,reasons:undefined}],false),/card-reason/);
});
process.env.SUPABASE_URL="https://test.invalid";process.env.SUPABASE_SECRET_KEY="fake";process.env.RATE_LIMIT_SECRET="f3-local-rate-secret-1234567890123456";process.env.PHOTO_SIGNING_SECRET="f3-local-photo-secret-123456789012345";process.env.GOOGLE_PLACES_API_KEY="fake-google";
test("F3 endpoint: reasons sólo en respuesta no-store, Google request idéntico, writes mínimos y token",async t=>{
 var fetch=h.mockFetch([h.rpcRule(),{match:/places:searchText$/,reply:()=>h.response(200,{places:[{id:"ChIJabcdefghij0001",displayName:{text:"Fixture"},primaryType:"restaurant",rating:4.5,userRatingCount:100,businessStatus:"OPERATIONAL",addressComponents:[{longText:"Palermo",types:["neighborhood"]}]}]})},{match:/\/rest\/v1\/providers/,reply:c=>h.response(c.method==="GET"?200:201,c.method==="GET"?[]:null)}]);t.mock.method(global,"fetch",fetch);
 var req=h.fakeReq("GET"),res=h.fakeRes();req.query={profile:"dinner",zone:"Palermo",original_prompt:"SENTINEL nombre@example.invalid",allergies:"SENTINEL",budget:200000,date:"2030-01-01"};await require("../api/plan-options")(req,res);
 assert.equal(res.statusCode,200);assert.equal(res.headers["cache-control"],"no-store");var o=res.json().options[0];assert.equal(o.reasons.length,3);
 o.reasons.forEach(r=>assert.deepEqual(guard.reasonIssues(r,{primaryType:"restaurant",expectedZoneLabel:"En Palermo · Datos de Google Maps"}),[]));
 assert.equal(require("../api/_lib/option-token").verify(process.env.PHOTO_SIGNING_SECRET,o.google_place_id,o.option_token),"");
 var google=fetch.calls.filter(c=>/places:searchText$/.test(c.url));assert.equal(google.length,1);assert.deepEqual(JSON.parse(google[0].body),{textQuery:"restaurantes en palermo, Buenos Aires",pageSize:20,languageCode:"es",regionCode:"AR"});
 assert.doesNotMatch(JSON.stringify(fetch.calls),/SENTINEL|nombre@example/);
 fetch.calls.filter(c=>/providers/.test(c.url)&&c.method==="POST").forEach(c=>JSON.parse(c.body).forEach(r=>assert.deepEqual(Object.keys(r).sort(),["google_place_id","source","provider_status","last_verified_at"].sort())));
});
test("F3 catálogo de fixtures y todas las opciones F5: fuente honesta; selección/cantidad no cambia",()=>{
 var f5=require("./matching/f5"),f1=require("./matching/f1"),places=require("../api/_lib/google-places");
 assert.deepEqual(f5.report(),require("./fixtures/matching/baseline-f5.json"));
 for(var c of cases){assert.deepEqual(guard.textIssues(c.expectedTypeLabel),[]);assert.deepEqual(guard.textIssues(c.expectedZoneLabel),[]);}
 var total=0;
 for(var s of f1.scenarios){var a=f5.adapter(s),found=f1.syntheticSearch(a.request),cards=a.pick(found),map=new Map(found.map(p=>[p.id,p]));
  for(var card of cards){var p=map.get(card.id),row=places.toProviderRow(p),zone=plan.profileZone(s.zone),rs=plan.optionReasons(row,zone,p);
   var expectedZoneLabel=zone&&row.zone&&row.zone.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")===zone?plan.ZONE_REASON_LABELS[zone]:null;
   for(var r of rs)assert.deepEqual(guard.reasonIssues(r,{primaryType:p.primaryType,expectedZoneLabel}),[],s.id+" "+r.label);
   assert.deepEqual(guard.textIssues(visible({reasons:rs},false)),[]);total++;
  }
 }
 assert.equal(total,68);
});
