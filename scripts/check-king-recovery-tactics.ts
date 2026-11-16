import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createGame,emptyHand,play,legalMoves,type Position,type Kind} from '../src/game/engine';
import {gameToUsiPosition,moveFromUsi,moveToUsi} from '../src/game/usi-format';
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='emulator-5580',remote='/data/local/tmp/meguru-king-all',results=[];
for(const model of ['hao','trained'])for(const flags of [6,7]){
 const rules={kingCapture:'all' as const,selfCapture:flags===6?'gote' as const:'both' as const};
 const p:Position={board:Array(81).fill(null),hands:{sente:emptyHand(),gote:emptyHand()},turn:'sente',rules};
 const put=(sq:number,kind:Kind,side:'sente'|'gote')=>p.board[sq]={kind,side,promoted:false};
 put(4,'K','gote');put(76,'K','sente');put(3,'L','gote');put(5,'L','gote');put(12,'P','gote');put(14,'P','gote');put(22,'G','sente');p.hands.sente.P=1;
 const game=play(createGame(rules,p),{drop:'P',to:13});assert.deepEqual(legalMoves(game.position).map(moveToUsi).sort(),['5a4a','5a6a']);
 const out=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/'+model+' '+flags+' 200'],{input:'analyze '+gameToUsiPosition(game,'mobile-king-all')+'\nquit\n',encoding:'utf8',windowsHide:true,timeout:30000});
 const a=JSON.parse(out.split(/\r?\n/).find(l=>l.startsWith('MOBILE_RESULT '))!.slice(14));const next=play(game,moveFromUsi(a.bestmove));assert(next.log.at(-1)!.selfCapture);assert.equal(next.position.hands.gote.L,1);assert.equal(next.result,null);
 results.push({model,flags,analysis:a,kingRecovery:true,escapedCheck:true,recoveredHand:'L'});
}
const report={createdAt:new Date().toISOString(),passed:true,platform:'Android x86_64 emulator',results};writeFileSync('reports/king-recovery-tactics.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
