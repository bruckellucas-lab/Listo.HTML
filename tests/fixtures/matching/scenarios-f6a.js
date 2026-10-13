"use strict";
var base=require('./scenarios').map(s=>Object.assign({},s,{profile:s.id.startsWith('asado')?'grill':s.id.includes('vegana')?'vegan':s.id.startsWith('baby')?'baby_shower':s.id.startsWith('fiesta')?'celebration':s.relevant.includes('event_venue')?'venues':s.relevant.includes('cocktail_bar')?'bars':'dinner'}));
var extra=[
{id:'cumple-25-palermo',type:'Cumpleaños',needs:['lugar','comida'],guests:25,zone:'Palermo',profile:'celebration',relevant:['event_venue','banquet_hall','bar']},
{id:'musica-deco-torta-fotos',type:'Fiesta',needs:['musica','deco','torta','fotos'],guests:30,zone:'Palermo',profile:'multi_service',relevant:['event_venue','banquet_hall']},
{id:'zona-en-marzo',type:'Cena',needs:['comida'],guests:4,zone:'en Marzo',profile:'dinner',invalidZone:true,relevant:['restaurant']},
{id:'google-cero',type:'Cena',needs:['comida'],guests:4,zone:'Villa Cero',profile:'dinner',relevant:['restaurant']},
{id:'google-uno',type:'Cena',needs:['comida'],guests:4,zone:'Villa Uno',profile:'dinner',relevant:['restaurant']},
{id:'google-dos',type:'Cena',needs:['comida'],guests:4,zone:'Villa Dos',profile:'dinner',relevant:['restaurant']},
{id:'zona-pocos',type:'Cena',needs:['comida'],guests:4,zone:'Villa Pocos',profile:'dinner',relevant:['restaurant']},
{id:'fuera-zona',type:'Cena',needs:['comida'],guests:4,zone:'Villa Borde',profile:'dinner',relevant:['restaurant']},
{id:'ranking-omite-parrilla',type:'Asado',needs:['comida'],guests:8,zone:'Palermo',profile:'grill',relevant:['steak_house','barbecue_restaurant']}
];
module.exports=base.concat(extra);
