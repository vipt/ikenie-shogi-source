import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {createGame,play,legalMoves,applyUnchecked,isInCheck,emptyHand,type Position,type Kind} from '../src/game/engine';
import {gameToUsiPosition,moveToUsi,moveFromUsi,toSfen,type UsiRuleMode} from '../src/game/usi-format';
const adb='C:/Users/motok/AppData/Local/Android/Sdk/platform-tools/adb.exe',serial='emulator-5580',remote='/data/local/tmp/meguru-king-all';
const run=(...args:string[])=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:50*1024*1024});
run('shell','mkdir','-p',remote+'/hao',remote+'/trained');
for(const [a,b] of [['.tools/m-x64/meguru_cli','meguru_cli'],['C:/Users/motok/AppData/Local/Android/Sdk/ndk/28.2.13676358/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/lib/x86_64-linux-android/libc++_shared.so','libc++_shared.so'],['modules/meguru-engine/assets/hao.nnue','hao/nn.bin'],['modules/meguru-engine/assets/trained.nnue','trained/nn.bin']])run('push',a!,remote+'/'+b);
run('shell','chmod','755',remote+'/meguru_cli');
let seed=20261115;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const results:any[]=[];
for(const kingCapture of ['enemy','all'] as const)for(const [mask,selfCapture,oldMode] of [[0,'none','standard'],[1,'sente','asymmetric-sente'],[2,'gote','asymmetric-gote'],[3,'both','recovery']] as const){
 const rules={kingCapture,selfCapture},mode:UsiRuleMode=kingCapture==='all'?'mobile-king-all':oldMode,flags=mask|(kingCapture==='all'?4:0);
 const cases:{name:string;game:ReturnType<typeof createGame>}[]=[];
 const put=(p:Position,sq:number,kind:Kind,side:'sente'|'gote'='sente',promoted=false)=>p.board[sq]={kind,side,promoted};
 const blank=()=>{const p:Position={board:Array(81).fill(null),hands:{sente:emptyHand(),gote:emptyHand()},turn:'sente',rules};put(p,0,'K','gote');put(p,40,'K');return p;};
 for(const kind of ['P','L','N','S','G','B','R'] as const)for(const promoted of kind==='G'?[false]:[false,true]){
  const p=blank();put(p,31,kind,'sente',promoted);cases.push({name:'king-recover-'+kind+'-'+promoted,game:createGame(rules,p)});
 }
 for(const double of [false,true]){const p=blank();p.board[40]=null;put(p,76,'K');put(p,75,'G');put(p,4,'R','gote');if(double)put(p,36,'B','gote');assert(isInCheck(p,'sente'));cases.push({name:'check-escape-'+double,game:createGame(rules,p)});}
 {const p=blank();put(p,31,'G');put(p,4,'R','gote');assert(!legalMoves(p).map(moveToUsi).includes('5e5d'));cases.push({name:'unsafe-king-recovery',game:createGame(rules,p)});}
 {const p=blank();p.board[0]=null;p.board[40]=null;put(p,4,'K','gote');put(p,76,'K');put(p,3,'L','gote');put(p,5,'L','gote');put(p,12,'P','gote');put(p,14,'P','gote');put(p,22,'G');p.hands.sente.P=1;
  const canEscape=kingCapture==='all'&&(mask&2)!==0;assert.equal(legalMoves(p).map(moveToUsi).includes('P*5b'),canEscape);cases.push({name:'pawn-drop-recovery-escape',game:createGame(rules,p)});
  if(canEscape){let g=play(createGame(rules,p),{drop:'P',to:13});cases.push({name:'defend-pawn-drop-by-recovery',game:g});g=play(g,moveFromUsi('5a6a'));assert.equal(g.position.hands.gote.L,1);cases.push({name:'after-king-recovery-escape',game:g});}
 }
 let g=createGame(rules);for(let n=0;n<50&&!g.result;n++){cases.push({name:'random-'+n,game:g});const moves=legalMoves(g.position),rec=moves.filter(m=>'from'in m&&g.position.board[m.to]?.side===g.position.turn),kings=rec.filter(m=>'from'in m&&g.position.board[m.from]?.kind==='K');const pool=kings.length&&random()<.5?kings:rec.length&&random()<.4?rec:moves;g=play(g,pool[Math.floor(random()*pool.length)]!);}
 const input=cases.map(c=>gameToUsiPosition(c.game,mode)).concat(['search','quit']).join('\n')+'\n';
 const output=execFileSync(adb,['-s',serial,'shell','LD_LIBRARY_PATH='+remote+' '+remote+'/meguru_cli '+remote+'/hao '+flags+' 150'],{input,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:50*1024*1024});
 const probes=output.split(/\r?\n/).filter(l=>l.startsWith('MOBILE_PROBE ')).map(l=>JSON.parse(l.slice(13)));assert.equal(probes.length,cases.length,output.slice(-2000));let transitions=0,kingRecoveries=0;
 probes.forEach((p,i)=>{const {game,name}=cases[i]!;assert.ok(p.valid,'native invariant '+name);assert.equal(p.kingRecovery,kingCapture==='all');assert.equal(p.recoveryMask,mask);assert.equal(p.inCheck,isInCheck(game.position,game.position.turn));assert.deepEqual(p.children.map((c:any)=>c.move).sort(),legalMoves(game.position).map(moveToUsi).sort(),name);for(const c of p.children){const m=moveFromUsi(c.move);assert.ok(c.valid,name);assert.equal(c.sfen,toSfen(applyUnchecked(game.position,m),game.log.length+2,mode),name+' '+c.move);if(c.recovery&&'from'in m&&game.position.board[m.from]?.kind==='K')kingRecoveries++;transitions++;}});
 const search=JSON.parse(output.split(/\r?\n/).find(l=>l.startsWith('MOBILE_RESULT '))!.slice(14));assert(legalMoves(createGame(rules).position).map(moveToUsi).includes(search.bestmove));
 results.push({rules,flags,positions:cases.length,transitions,kingRecoveries,search});console.log(JSON.stringify(results.at(-1)));
}
const report={createdAt:new Date().toISOString(),passed:true,platform:'Android x86_64 emulator',results};writeFileSync('reports/king-recovery-native.json',JSON.stringify(report,null,2));
