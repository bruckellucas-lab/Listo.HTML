"use strict";
var test = require("node:test"), assert = require("node:assert/strict");
var h = require("./helpers"), auth = require("../api/_lib/admin-auth");
process.env.ADMIN_PASSWORD = "local-commercial-password-123456";
process.env.SUPABASE_URL = "https://local-test.invalid";
process.env.SUPABASE_SECRET_KEY = "local-test-key";
var ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
async function call(file, method, body) {
  var res = h.fakeRes();
  await require("../api/" + file)(h.fakeReq(method, { cookie: auth.sessionCookie().split(";")[0], "x-listo-admin": "1", "content-type": "application/json" }, body), res);
  return res;
}
test("S2B: panel viejo sin estado esperado se rechaza sin RPC", async function (t) {
  t.mock.method(global, "fetch", function () { throw new Error("no debe escribir"); });
  var r = await call("admin-inquiries.js", "PATCH", { id: ID, status: "cancelled" });
  assert.equal(r.statusCode, 400);
});
test("S2B: estado esperado se manda a RPC; conflicto no ejecuta PATCH directo", async function (t) {
  var calls=[];
  t.mock.method(global,"fetch",async function(url,opts){ calls.push(url); var d=JSON.parse(opts.body); assert.equal(d.p_expected,"inquiry_requested"); return h.response(200,{ok:false,http_status:409,error:"El estado cambió"}); });
  var r=await call("admin-inquiries.js","PATCH",{id:ID,status:"quoted",expected_status:"inquiry_requested"});
  assert.equal(r.statusCode,409); assert.equal(calls.length,1); assert.match(calls[0],/rpc\/listo_commercial_state$/);
});
test("S2B: falta migration falla cerrado con 503, sin fallback",async function(t){
  t.mock.method(global,"fetch",async function(){return h.response(404,{code:"PGRST202"});});
  var r=await call("admin-bookings.js","POST",{action:"sync_status",plan_inquiry_id:ID,expected_status:"quoted"});
  assert.equal(r.statusCode,503); assert.match(r.json().error,/migration/);
});
test("S2B: mark_contacted usa estado esperado y la misma RPC",async function(t){
  t.mock.method(global,"fetch",async function(url,opts){var d=JSON.parse(opts.body);assert.equal(d.p_action,"contact");assert.equal(d.p_expected,"quoted");return h.response(200,{ok:false,error:"El estado cambió"});});
  assert.equal((await call("admin-inquiries.js","PATCH",{id:ID,action:"mark_contacted",channel:"phone",expected_status:"quoted"})).statusCode,409);
});
