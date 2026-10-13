/* Sólo sintético: sin red, datos Google reales ni persistencia. No conoce los escenarios. */
"use strict";
var old=require('./world');
var TYPES={dinner:['restaurant','french_restaurant','italian_restaurant','steak_house','sushi_restaurant','pizza_restaurant','vegan_restaurant','spanish_restaurant','fine_dining_restaurant','barbecue_restaurant','cafe','brunch_restaurant'],grill:['steak_house','barbecue_restaurant'],vegan:['vegan_restaurant'],celebration:['event_venue','banquet_hall','wedding_venue','convention_center','bar'],baby_shower:['cafe','brunch_restaurant','event_venue'],multi_service:['event_venue','banquet_hall'],bars:['bar','pub','cocktail_bar','wine_bar'],venues:['event_venue','banquet_hall','wedding_venue','convention_center','hotel']};
var PHRASES={dinner:'restaurantes',grill:'parrillas',vegan:'restaurantes veganos',celebration:'salones para celebraciones',baby_shower:'lugares para baby shower',multi_service:'salones para eventos',bars:'bares',venues:'salones para eventos'};
var catalog=Object.values(old.POOLS).flat().map(p=>JSON.parse(JSON.stringify(p)));
function synthetic(i,zone,type){return {id:'SYNF6A'+i+'xxxxxxxxxx',displayName:{text:'Fixture F6a '+i},primaryType:type,primaryTypeDisplayName:{text:type},rating:4.4,userRatingCount:100,businessStatus:'OPERATIONAL',formattedAddress:'Calle Sintética '+i+', '+zone,addressComponents:[{longText:zone,types:['neighborhood']}],googleMapsUri:'https://maps.example.invalid/'+i};}
for(var [zone,n] of [['Villa Uno',1],['Villa Dos',2],['Villa Pocos',2]])for(var i=0;i<n;i++)catalog.push(synthetic(zone.replace(/ /g,'')+i,zone,'restaurant'));
catalog.push(synthetic('fuera','Villa Lejos','restaurant')); // búsqueda permite vecino: el ranking/aviso debe hacerse cargo.
var ZONES=['Palermo','Caballito','Núñez','Villa Cero','Villa Uno','Villa Dos','Villa Pocos','Villa Borde','Villa Lejos'];
function zoneOf(p){return p.addressComponents[0]&&p.addressComponents[0].longText||'';}
function norm(s){return old.norm(s).replace(/\s+/g,' ');}
function profile(query){var s=norm(query);if(/baby shower/.test(s))return 'baby_shower';if(/vegano/.test(s))return 'vegan';if(/parrilla|asado/.test(s))return 'grill';if(/celebracion|fiesta/.test(s))return 'celebration';if(/salon/.test(s))return 'venues';if(/bar/.test(s))return 'bars';if(/restaurante/.test(s))return 'dinner';return null;}
function queryZone(query){var match=String(query).match(/ en (.+?)(?:, Buenos Aires)?$/i);return match?match[1]:'';}
function search(request){
  var p=profile(request.textQuery),zone=queryZone(request.textQuery);if(!p)return [];
  if(zone==='Buenos Aires')zone='';
  if(zone&&!ZONES.some(z=>norm(z)===norm(zone)))return [];
  if(norm(zone)==='villa cero')return [];
  var types=request.includedType?(request.includedType==='restaurant'?TYPES.dinner:[request.includedType]):TYPES[p];
  types=types.filter(t=>TYPES[p].includes(t));
  var rows=catalog.filter(row=>types.includes(row.primaryType)&&(!zone||norm(zoneOf(row))===norm(zone)||(norm(zone)==='villa borde'&&norm(zoneOf(row))==='villa lejos')));
  // Misma consulta, mismo resultado; límite simula el request a Google, no un top3 oracle.
  return JSON.parse(JSON.stringify(rows.slice(0,request.maxResultCount||20)));
}
module.exports={catalog:catalog,TYPES:TYPES,PHRASES:PHRASES,ZONES:ZONES,norm:norm,zoneOf:zoneOf,search:search};
