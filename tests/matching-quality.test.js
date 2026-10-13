"use strict";
var test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),quality=require('./matching/quality'),world=require('./fixtures/matching/world-f6a'),guard=require('./matching/guardians'),baseline=require('./fixtures/matching/baseline-f6a.json');
test('F6a baseline reproducible: misma implementación productiva, sin reemplazar F0',()=>{assert.deepEqual(quality.run(),baseline);assert.deepEqual(quality.run(),quality.run());assert.equal(quality.scenarios.length,29);});
test('F6a mundo responde a consulta/includedType, no recibe etiquetas de adecuación',()=>{
 var generic=world.search({textQuery:'restaurantes en Palermo'}),grill=world.search({textQuery:'parrillas en Palermo'}),vegan=world.search({textQuery:'restaurantes en Palermo',includedType:'vegan_restaurant'});
 assert.ok(generic.length>grill.length);assert.ok(grill.length);assert.ok(grill.every(p=>['steak_house','barbecue_restaurant'].includes(p.primaryType)));assert.ok(vegan.length);assert.ok(vegan.every(p=>p.primaryType==='vegan_restaurant'));
 var prior=grill[0].displayName.text;grill[0].displayName.text='mutado';assert.equal(world.search({textQuery:'parrillas en Palermo'})[0].displayName.text,prior);assert.deepEqual(world.search({textQuery:'consulta desconocida'}),[]);
});
test('F6a casos 0/1/2, inválido y fuera de zona son alcanzables por consulta',()=>{
 for(var [zone,n] of [['Villa Cero',0],['Villa Uno',1],['Villa Dos',2]])assert.equal(world.search({textQuery:'restaurantes en '+zone}).length,n);
 assert.equal(world.search({textQuery:'restaurantes en en Marzo'}).length,0);
 var out=quality.run().results;for(var [id,n] of [['google-cero',0],['google-uno',1],['google-dos',2]])assert.equal(out.find(r=>r.id===id).shown,n);
 assert.ok(out.find(r=>r.id==='fuera-zona').outsideUnwarned>0);assert.ok(out.find(r=>r.id==='ranking-omite-parrilla').missedSlots>0);
});
test('F6a sólo mejorar consulta cambia medición sin cambiar ranking real',()=>{
 var newer=quality.run(s=>{var a=quality.current(s);if(s.profile==='grill')a.request.textQuery='parrillas en '+s.zone;return a;});
 for(var id of ['asado-12-palermo','ranking-omite-parrilla']){var old=baseline.results.find(r=>r.id===id),next=newer.results.find(r=>r.id===id);assert.ok(next.pertinent>old.pertinent);assert.ok(next.padding<old.padding);}
});
test('F6a adaptadores futuros pueden mostrar menos de tres y medir omisiones; no pueden inventar IDs',()=>{
 var less=quality.run(s=>{var a=quality.current(s),pick=a.pick;a.pick=found=>pick(found).slice(0,1);return a;});assert.ok(less.summary.scenariosShowingFewerThan3>baseline.summary.scenariosShowingFewerThan3);assert.ok(less.summary.adequateMissedSlots>0);
 assert.throws(()=>quality.run(s=>({request:quality.current(s).request,pick:()=>[{id:'inventado'}]})),/inventa/);
});
test('F6a metas son objetivos explícitos, no una baseline reescrita para aprobar calidad',()=>{assert.equal(baseline.targets.pertinenceMet,false);assert.equal(baseline.targets.zoneNoticeMet,false);assert.ok(baseline.summary.padding>10);assert.equal(baseline.summary.groundedReasonRate,null);});
test('F6a perfiles/query/cost key: texto privado no entra a Google y search_repeat debe seguir perfil|zona',()=>{
 guard.assertRequest({textQuery:'parrillas en Palermo'},'grill','Palermo','grill|palermo');
 for(var secret of ['original_prompt','alergia: maní','comentario libre','nombre@example.invalid'])assert.throws(()=>guard.assertRequest({textQuery:'parrillas en Palermo '+secret},'grill','Palermo','grill|palermo'));
 assert.throws(()=>guard.assertRequest({textQuery:'parrillas en Palermo',original_prompt:'privado'},'grill','Palermo','grill|palermo'));
 assert.throws(()=>guard.assertRequest({textQuery:'parrillas en Palermo'},'grill','Palermo','restaurantes|palermo'),/search_repeat/);
 assert.throws(()=>guard.assertRequest({textQuery:'restaurantes en en Marzo'},'dinner','en Marzo','dinner|en marzo'));
 assert.throws(()=>guard.assertRequest({textQuery:'libre'},'mi texto privado','Palermo','x'));
});
test('F6a honestidad: textos afirmativos y razones sin evidencia fallan cerrado',()=>{
 for(var text of ['precio confirmado','disponibilidad confirmada','capacidad para 30','acepta reservas','apto para 30','vegano seguro','sin TACC seguro','kosher verificado'])assert.ok(guard.issues({id:'SYNtest',text:text}).length,text);
 assert.deepEqual(guard.issues({id:'SYNtest',text:'Precio y disponibilidad a confirmar. Capacidad a confirmar.'}),[]);
 assert.ok(guard.issues({id:'SYNtest',text:'Precio y disponibilidad a confirmar',reasons:[{field:'zone',value:'Palermo',evidenceId:'inventado'}]}).includes('reason-without-source'));
 var evidence=[{id:'e1',placeId:'SYNtest',field:'vegan_safe',value:true,verified:true,source:'listo_manual',validUntil:'2027-01-01'}];
 assert.deepEqual(guard.issues({id:'SYNtest',text:'vegano seguro',claims:[{field:'vegan_safe',value:true,evidenceId:'e1'}]},evidence),[]);
 assert.ok(guard.issues({id:'SYNotro',text:'vegano seguro',claims:[{field:'vegan_safe',value:true,evidenceId:'e1'}]},evidence).length);
 assert.ok(guard.issues({id:'SYNtest',text:'vegano seguro',claims:[{field:'vegan_safe',value:true,evidenceId:'e1'}]},evidence.map(e=>Object.assign({},e,{source:'google_live'}))).length);
});
test('F6a fixtures sólo sintéticos y no simulan certezas comerciales ni datos sensibles',()=>{
 for(var p of world.catalog){assert.match(p.id,/^SYN/);assert.match(p.formattedAddress,/^Calle Sintética/);for(var key of ['price','availability','capacity','reservable','certified','safeDiet','photos'])assert.equal(Object.hasOwn(p,key),false);}
});
test('F6a guardianes productivos G/S2D/S2E siguen presentes sin agregar persistencia/ranking',()=>{
 var root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'api/plan-options.js'),'utf8'),photo=fs.readFileSync(path.join(root,'api/place-photo.js'),'utf8');
 assert.match(src,/search_repeat/);assert.match(src,/key: searchKey/);assert.doesNotMatch(src,/original_prompt|contact_phone|user_comment/);assert.match(photo,/no-store/);
 var stored=require('../api/_lib/providers-store').STORED_FIELDS;assert.deepEqual(stored,['google_place_id','source','provider_status','last_verified_at']);
 var fns=fs.readdirSync(path.join(root,'api')).filter(n=>n.endsWith('.js'));assert.equal(fns.length,12);
 assert.ok(fs.existsSync(path.join(root,'tests/google-compliance.test.js')));assert.ok(fs.existsSync(path.join(root,'tests/cost-abuse.test.js')));assert.ok(fs.existsSync(path.join(root,'tests/privacy-memory.test.js')));
});
test('F6a valores, vigencia y fuente de razón no se pueden autoafirmar',()=>{
 var card={id:'SYNtest',text:'apto para 30',claims:[{field:'capacity',value:20,evidenceId:'e'}]},evidence=[{id:'e',placeId:'SYNtest',field:'capacity',value:20,verified:true,source:'listo_manual',validUntil:'2027-01-01'}];assert.ok(guard.issues(card,evidence).includes('unsupported:capacity'));
 var reason={field:'zone',value:'Palermo',evidenceId:'z',text:'En Palermo'},z={id:'z',placeId:'SYNtest',field:'zone',value:'Palermo',verified:true,source:'google_live',validUntil:'2027-01-01'};
 assert.deepEqual(guard.issues({id:'SYNtest',text:'A confirmar',reasons:[reason]},[z]),[]);
 assert.ok(guard.issues({id:'SYNtest',text:'A confirmar',reasons:[Object.assign({},reason,{text:'kosher verificado'})]},[z]).includes('unsupported:kosher'));
 assert.ok(guard.issues({id:'SYNtest',text:'A confirmar',reasons:[reason]},[Object.assign({},z,{validUntil:'2020-01-01'})]).includes('reason-without-source'));
});
test('F6a contrato futuro se aplica dentro del arnés; variety y aviso se miden',()=>{
 assert.throws(()=>quality.run(quality.current,{futureContract:true}),/search_repeat|Consulta/);
 var advised=quality.run(s=>{var a=quality.current(s),pick=a.pick;a.pick=(found,user)=>{var cards=pick(found);if(cards.length>1&&user%2)cards.reverse();return cards.map(c=>Object.assign({},c,{outsideZoneNotice:'Otra zona: revisar distancia'}));};return a;});
 assert.equal(advised.summary.outsideUnwarned,0);assert.ok(advised.summary.identicalAcrossUsers<baseline.summary.identicalAcrossUsers);
});
test('F6a consulta real no usa campos libres/sensibles y includedType no contradice la consulta',t=>{
 var logs=[];t.mock.method(console,'error',(...args)=>logs.push(args.join(' ')));t.mock.method(console,'log',(...args)=>logs.push(args.join(' ')));
 var poisoned=Object.assign({},quality.scenarios[0],{original_prompt:'SENTINEL privado',notes:'SENTINEL privado',dietary_requirements:[{code:'allergy',detail:'SENTINEL privado'}]});
 assert.doesNotMatch(JSON.stringify(quality.current(poisoned).request)+logs.join(' '),/SENTINEL/);
 assert.deepEqual(world.search({textQuery:'parrillas en Palermo',includedType:'vegan_restaurant'}),[]);
 assert.throws(()=>guard.assertRequest({textQuery:'parrillas en Palermo',maxResultCount:100},'grill','Palermo','grill|palermo'));
});
test('F6a contrato futuro corta afirmaciones sin fuente en cualquier usuario simulado',()=>{
 function future(s){var a=quality.current(s),zone=s.invalidZone?'':s.zone;a.request={textQuery:world.PHRASES[s.profile]+' en '+(zone||'Buenos Aires')};a.costKey=s.profile+'|'+world.norm(zone);return a;}
 assert.doesNotThrow(()=>quality.run(future,{futureContract:true}));
 assert.throws(()=>quality.run(s=>{var a=future(s),pick=a.pick;a.pick=(found,u)=>pick(found).map(c=>Object.assign({},c,{text:u===1?'vegano seguro':c.text}));return a;},{futureContract:true}),/sin fuente/);
});
