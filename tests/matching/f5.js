"use strict";
var quality = require("./quality"), f1 = require("./f1"), plan = require("../../api/_lib/plan");
var world = require("../fixtures/matching/world-f6a");
function adapter(s) {
  var profile = f1.chooseProfile(s);
  var a = f1.adapter(s, function (rows, zone, status, max) {
    return plan.pickAdequateOptions(rows, zone, status, max, {profile:profile, placesById:a.placesById});
  });
  var pick = a.pick;
  a.pick = function (found) {
    a.placesById = Object.create(null); found.forEach(function (p) { a.placesById[p.id] = p; });
    return pick(found).map(function (card) {
      var p = a.placesById[card.id], row = require("../../api/_lib/google-places").toProviderRow(p);
      var notice = plan.optionZoneNotice(row, plan.profileZone(s.zone));
      return Object.assign(card, {outsideZoneNotice:notice});
    });
  };
  return a;
}
function report() {
  var before = require("../fixtures/matching/baseline-f2.json").after;
  var after = quality.run(adapter, {scenarios:f1.scenarios, world:Object.assign({}, world, {search:f1.syntheticSearch})});
  after.summary.averageShown = +(after.summary.shown / after.summary.scenarios).toFixed(3);
  return {synthetic:true, before:before, averageShownBefore:+(before.summary.shown / before.summary.scenarios).toFixed(3), after:after};
}
module.exports = {adapter:adapter, report:report};
if (require.main === module) console.log(JSON.stringify(report(), null, 2));
