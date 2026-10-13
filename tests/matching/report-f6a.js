"use strict";
var fs=require('node:fs'),path=require('node:path'),quality=require('./quality');
if(require.main===module){var out=quality.run();console.log(JSON.stringify(out,null,2));if(process.argv.includes('--write'))fs.writeFileSync(path.join(__dirname,'../fixtures/matching/baseline-f6a.json'),JSON.stringify(out,null,2)+'\n');}
