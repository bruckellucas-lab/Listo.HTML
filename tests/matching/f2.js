"use strict";
var quality = require("./quality"), f1 = require("./f1"), plan = require("../../api/_lib/plan");
var world = require("../fixtures/matching/world-f6a");
function adapter(s) {
  var profile = f1.chooseProfile(s);
  var a = f1.adapter(s, function (rows, zone, status, max) {
    return plan.pickOptions(rows, zone, status, max, {profile:profile, placesById:a.placesById});
  });
  var pick = a.pick;
  a.pick = function (found) {
    a.placesById = Object.create(null);
    found.forEach(function (p) { a.placesById[p.id] = p; });
    return pick(found);
  };
  return a;
}
function report() {
  var before = require("../fixtures/matching/baseline-f1.json").after;
  var after = quality.run(adapter, {scenarios:f1.scenarios, world:Object.assign({}, world, {search:f1.syntheticSearch})});
  after.targets.omissionsNotWorse = after.summary.adequateMissedSlots <= before.summary.adequateMissedSlots;
  return {synthetic:true, before:before, after:after};
}
module.exports = {adapter:adapter, report:report};
if (require.main === module) console.log(JSON.stringify(report(), null, 2));
