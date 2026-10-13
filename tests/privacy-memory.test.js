"use strict";
var test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto'),h=require('./helpers');
function localCounters(){
  var src=fs.readFileSync(h.ROOT+'/api/proposal.js','utf8'),start=src.indexOf('function ipOf('),end=src.indexOf('// ¿Se puede pedir',start);
  var ctx={crypto:crypto,hitSecret:crypto.randomBytes(32),hits:{view:{},miss:{}},WINDOW_MS:600000,Date:Date};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);return ctx;
}
test('S2E propuesta: contadores locales retienen huellas, no IP literal; misma instancia conserva identidad',()=>{
  var a=localCounters(),b=localCounters(),req={headers:{'x-forwarded-for':'203.0.113.77, 127.0.0.1'}},key=a.ipOf(req);
  assert.match(key,/^[a-f0-9]{64}$/);assert.equal(a.ipOf(req),key);assert.notEqual(b.ipOf(req),key);
  a.count('view',key,true);a.count('miss',key,true);assert.doesNotMatch(JSON.stringify(a.hits),/203\.0\.113\.77|127\.0\.0\.1/);
  assert.notEqual(a.ipOf({headers:{},socket:{remoteAddress:'203.0.113.78'}}),key);
});
test('S2E contador de propuestas: huellas no cambian acumulación ni vencimiento de ventana',()=>{
  var ctx=localCounters(),key=ctx.ipOf({headers:{'x-forwarded-for':'203.0.113.77'}}),now=1000000;
  ctx.Date={now:()=>now};assert.equal(ctx.count('view',key,true),1);assert.equal(ctx.count('view',key,true),2);assert.equal(ctx.count('miss',key,false),0);
  now+=600001;assert.equal(ctx.count('view',key,false),0);assert.equal(ctx.count('view',key,true),1);
});
