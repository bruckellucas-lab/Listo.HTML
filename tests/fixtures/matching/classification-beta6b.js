"use strict";

// Matriz sintética: no contiene datos de testers. `desired` marca las únicas diferencias
// autorizadas frente a main; todos los demás casos deben conservar exactamente su perfil.
module.exports = [
  {id:"desired-small-place", group:"desired", prompt:"Cena de cumpleaños para 6 personas en un lugar lindo con buena ambientación", main:"celebration", expected:"dinner"},
  {id:"desired-small-cake-deco", group:"desired", prompt:"Cena de cumpleaños para 6 personas con torta y ambientación", main:"multi_service", expected:"dinner"},
  {id:"desired-small-photo-deco", group:"desired", prompt:"Cena de cumpleaños para 6 personas con fotos y decoración", main:"multi_service", expected:"dinner"},
  {id:"desired-rent-hall", group:"desired", prompt:"Quiero alquilar un salón para 6 personas", main:"dinner", expected:"venues"},
  {id:"desired-rent-space", group:"desired", prompt:"Quiero alquilar un espacio para cena de 10 personas", main:"dinner", expected:"venues"},

  {id:"b1-edit-type", group:"unchanged", prompt:"Cumpleaños en un salón para 6 personas con comida", edits:{type:"Cena"}, expected:"dinner"},
  {id:"b1-edit-type-place", group:"unchanged", prompt:"Cumpleaños en un salón para 6 personas con comida", edits:{type:"Cena",needs:["comida"]}, expected:"dinner"},
  {id:"b1-edit-rental", group:"unchanged", prompt:"Quiero alquilar un salón para 6 personas", edits:{type:"Cena",needs:["comida"]}, expected:"dinner"},
  {id:"b1-remove-place-birthday", group:"unchanged", prompt:"Cumple de 6 personas en un salón con comida", edits:{needs:["comida"]}, expected:"dinner"},
  {id:"b1-remove-place-gathering", group:"unchanged", prompt:"Juntada de 6 amigos en un salón", edits:{needs:["comida"]}, expected:"dinner"},

  {id:"b2-no-want", group:"unchanged", prompt:"No quiero salón, quiero restaurante para cenar 6 personas", expected:"dinner"},
  {id:"b2-without", group:"unchanged", prompt:"Cena para 6 personas en Palermo, sin salón", expected:"dinner"},
  {id:"b2-hall-no", group:"unchanged", prompt:"Cena para 6 personas, salón no", expected:"dinner"},
  {id:"b2-no-rental-needed", group:"unchanged", prompt:"Cena de 6 personas, no hace falta alquilar un lugar", expected:"dinner"},
  {id:"b2-gathering-without", group:"unchanged", prompt:"Juntada de 6 amigos sin salón, algo tranqui para comer", expected:"dinner"},
  {id:"b2-rent-table", group:"unchanged", prompt:"Alquilar una mesa en un lugar lindo para cenar 6 personas", expected:"dinner"},
  {id:"b2-restaurant-room", group:"unchanged", prompt:"Cena para 8 personas en un restaurante con salón privado", expected:"dinner"},

  {id:"b3-hall-first", group:"unchanged", prompt:"Salón para cumpleaños de 8 personas con catering", expected:"celebration"},
  {id:"b3-we-search", group:"unchanged", prompt:"Buscamos un salón para un cumpleaños de 8 personas con comida", expected:"celebration"},
  {id:"b3-we-need", group:"unchanged", prompt:"Necesitamos un salón para festejar mi cumple, somos 10, con comida", expected:"celebration"},
  {id:"b3-search-any", group:"unchanged", prompt:"Cumpleaños para 8 personas, busco algún salón con comida", expected:"celebration"},
  {id:"b3-party-hall", group:"unchanged", prompt:"Cumpleaños de 10 personas con comida, salón de fiestas", expected:"celebration"},
  {id:"b3-small-hall", group:"unchanged", prompt:"Cumple 12 personas, comida y torta, salón chico", expected:"celebration"},
  {id:"b3-private-space", group:"unchanged", prompt:"Cumple de 8 personas con comida, espacio privado", expected:"celebration"},
  {id:"b3-not-large", group:"unchanged", prompt:"Cumpleaños para 10 personas con comida en un salón no muy grande", expected:"celebration"},
  {id:"b3-not-expensive", group:"unchanged", prompt:"Busco un salón no tan caro para cumpleaños de 10 personas con comida", expected:"celebration"},
  {id:"b4-negated-rental", group:"unchanged", prompt:"No quiero alquilar un salón, quiero reservar un restaurante", expected:"dinner"},

  {id:"control-simple-small-dinner", group:"unchanged", prompt:"Cena de cumpleaños para 6 personas en Palermo", expected:"dinner"},
  {id:"control-small-place", group:"unchanged", prompt:"Cena para 6 personas en un lugar lindo con buena ambientación", expected:"dinner"},
  {id:"control-small-cake", group:"unchanged", prompt:"Cena de cumpleaños para 6 personas con torta", expected:"dinner"},
  {id:"control-small-photo", group:"unchanged", prompt:"Cena para 6 personas con fotos y decoración", expected:"dinner"},
  {id:"control-large-hall", group:"unchanged", prompt:"Cumpleaños para 30 personas con salón", expected:"celebration"},
  {id:"control-private-hall", group:"unchanged", prompt:"Cena de cumpleaños para 6 personas en un salón privado", expected:"celebration"},
  {id:"control-multi", group:"unchanged", prompt:"Evento con lugar, música, fotografía y catering", expected:"multi_service"},
  {id:"control-after", group:"unchanged", prompt:"After office con tragos en Palermo", expected:"after_office"},
  {id:"control-grill", group:"unchanged", prompt:"Asado para 8 personas en Palermo", expected:"grill"},
  {id:"control-romantic", group:"unchanged", prompt:"Aniversario para 2 personas en Recoleta", expected:"romantic"},
  {id:"control-corporate", group:"unchanged", prompt:"Evento corporativo para 20 personas en Palermo", expected:"corporate"},
  {id:"control-baby", group:"unchanged", prompt:"Baby shower para 20 personas en Palermo", expected:"baby_shower"},
  {id:"control-fiesta15", group:"unchanged", prompt:"Fiesta de 15 con salón y comida", expected:"venues"},
  {id:"control-bars", group:"unchanged", data:{type:"Cumpleaños",guests:10,needs:["bebida"]}, expected:"bars"},
  {id:"control-vegan", group:"unchanged", data:{type:"Cena",guests:4,needs:["comida"],diet:{on:{vegan:true}}}, expected:"vegan"}
];
