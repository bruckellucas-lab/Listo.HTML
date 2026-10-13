/* Contrato TEST-ONLY para F1/F3/F4. No habilita afirmaciones en producción. */
"use strict";
var world=require('../fixtures/matching/world-f6a'),calendar=require('../../api/_lib/calendar');
function assertRequest(request,profile,zone,costKey){
  if(!Object.hasOwn(world.PHRASES,profile))throw Error('Perfil debe ser id cerrado');
  if(zone&&!world.ZONES.some(z=>world.norm(z)===world.norm(zone)))throw Error('Zona no resuelta');
  var expected=world.PHRASES[profile]+' en '+(zone||'Buenos Aires');
  if(request.textQuery!==expected)throw Error('Consulta contiene texto libre o no corresponde al perfil');
  if(Object.keys(request).some(k=>!['textQuery','includedType','maxResultCount'].includes(k)))throw Error('Campos sensibles/inesperados');
  if(request.includedType&&!Object.values(world.TYPES).flat().includes(request.includedType))throw Error('includedType no cerrado');
  if(request.maxResultCount!==undefined&&(!Number.isInteger(request.maxResultCount)||request.maxResultCount<1||request.maxResultCount>20))throw Error('Límite de resultados inválido');
  if(costKey!==profile+'|'+world.norm(zone))throw Error('search_repeat no está alineado a perfil|zona');
}
var PATTERNS={price:/precio confirmado|precio final|cuesta\s*\$|desde\s*\$|\$\s*\d/i,availability:/disponibilidad confirmada|hay disponibilidad|disponible para/i,capacity:/capacidad\s*(?:de|para|:)|apto para\s*\d/i,reservations:/acepta reservas|reserva garantizada|reservas disponibles/i,vegan_safe:/vegano seguro|vegana segura/i,celiac_safe:/sin tacc seguro|sin gluten seguro|apto para cel[ií]acos/i,kosher:/kosher verificado/i};
function issues(card,evidence,today){
  today=today||'2026-10-07';
  evidence=evidence||[];var out=[],claims=card.claims||[];
  var sources={price:['provider_quote','listo_manual'],availability:['provider_quote','listo_manual'],capacity:['listo_manual'],reservations:['listo_manual'],vegan_safe:['listo_manual'],celiac_safe:['listo_manual'],kosher:['listo_manual'],zone:['google_live','listo_manual'],category:['google_live','listo_manual'],rating:['google_live']};
  function supported(claim){return evidence.some(e=>e.id===claim.evidenceId&&e.placeId===card.id&&e.field===claim.field&&e.value===claim.value&&e.verified===true&&(sources[e.field]||[]).includes(e.source)&&calendar.validDate(e.validUntil)&&e.validUntil>=today);}
  var text=[card.text||''].concat((card.reasons||[]).map(r=>r.text||'')).join(' ');
  function binds(claim){if(['price','capacity'].includes(claim.field)){var pattern=claim.field==='price'?/\$\s*(\d+)/gi:/(?:apto para|capacidad(?: de| para|:)?)\s*(\d+)/gi;var numbers=(text.match(pattern)||[]).map(s=>Number(s.match(/\d+/)[0]));return typeof claim.value==='number'&&claim.value>0&&numbers.length>0&&numbers.every(n=>n===claim.value);}return claim.value===true;}
  for(var [field,regex] of Object.entries(PATTERNS))if(regex.test(text)&&!claims.some(c=>c.field===field&&supported(c)&&binds(c)))out.push('unsupported:'+field);
  for(var claim of claims)if(!supported(claim))out.push('unverified:'+claim.field);
  for(var reason of card.reasons||[])if(!supported(reason))out.push('reason-without-source');
  return out;
}
module.exports={assertRequest:assertRequest,issues:issues,PATTERNS:PATTERNS};
