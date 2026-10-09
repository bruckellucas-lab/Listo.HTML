/* S2B-2: sólo RPC transaccionales; nunca fallback PATCH + INSERT. */
"use strict";
var store=require("./providers-store");
async function run(cfg,name,payload,fetchImpl){
  try {
    return await store.request(fetchImpl || fetch,store.normalizeUrl(cfg.url)+"/rest/v1/rpc/"+name,
      {method:"POST",headers:store.headersFor(cfg.key),body:JSON.stringify(payload)},"reemplazo atómico");
  } catch(err){
    if(["PGRST202","42883"].indexOf(err.code)!==-1){err.code="REPLACEMENT_MISSING";}
    throw err;
  }
}
module.exports={run:run};
