const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'artifacts/engines/king-recovery-book-v1');
const m=JSON.parse(fs.readFileSync(path.join(dir,'book-manifest.json'))),db=fs.readFileSync(path.join(dir,'book/user_book1.db'));
if(crypto.createHash('sha256').update(db).digest('hex')!==m.sha256||!m.verifiedMoves||m.rules.kingCapture!=='all'||m.rules.selfCapture!=='both')throw Error('King book audit mismatch');
fs.writeFileSync(path.join(root,'modules/meguru-engine/assets/king_recovery_book.db'),db);
const f=path.join(root,'modules/meguru-engine/engine-manifest.json'),manifest=JSON.parse(fs.readFileSync(f));
if(m.modelSha256!==manifest.models.hao.sha)throw Error('King book model mismatch');
manifest.kingRecoveryBook={file:'king_recovery_book.db',version:1,sha256:m.sha256,modelSha256:m.modelSha256,rules:m.rules,positions:m.positions,moves:m.moveCount,selection:{...m.selection,considerBookMoveCount:true}};manifest.rule='king enemy/all; rule flags bits 0/1 recovery sides, bit 2 king recovery; distinct books for flags=3 and flags=7';
fs.writeFileSync(f,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({positions:m.positions,moves:m.moveCount,kingRecoveryMoves:m.kingRecoveryMoves,roots:m.rootMoves.map(v=>v.label)}));
