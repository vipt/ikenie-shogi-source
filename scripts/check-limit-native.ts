import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {createGame,play,withMoveLimit,type Move} from '../src/game/engine';
import {deserialize} from '../src/game/persistence';
import {gameToUsiPosition,moveFromUsi} from '../src/game/usi-format';
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='ZY22H5QCNM',remote='/data/local/tmp/meguru-live-validation';
const run=(...args:string[])=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000});
run('push','.tools/m-arm64/meguru_cli',remote+'/meguru_cli');run('shell','chmod','755',remote+'/meguru_cli');
const fixture=JSON.parse(readFileSync('tests/fixtures/presentation.json','utf8'));
let game=createGame({kingCapture:'enemy',moveLimit:2});game=play(game,{from:70,to:61,promote:false});game=play(game,{from:10,to:19,promote:false});
const beforeMate=deserialize(fixture.beforeMate).game;
const cases=[{name:'over-limit-draw',game,limit:2},{name:'mate-priority',game:withMoveLimit(beforeMate,beforeMate.log.length),limit:beforeMate.log.length}];
const results=[];
for(const c of cases){
 const input='analyze '+gameToUsiPosition(c.game,'recovery')+'\nquit\n';
 const out=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao 3 500 no-book '+c.limit],{input,encoding:'utf8',windowsHide:true,timeout:30000});
 const row=JSON.parse(out.split(/\r?\n/).find(l=>l.startsWith('MOBILE_RESULT '))!.slice(14));const next=play(c.game,moveFromUsi(row.bestmove));
 assert.equal(next.result?.reason,c.name==='mate-priority'?'mate':'move-limit');if(c.name==='over-limit-draw')assert(Math.abs(row.scoreCp)<=10);
 results.push({name:c.name,limit:c.limit,analysis:row,result:next.result});
}
const report={createdAt:new Date().toISOString(),passed:true,serial,results};writeFileSync('reports/presentation-limit-native.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
