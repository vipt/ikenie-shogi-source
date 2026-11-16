const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const executable='.tools/engines/meguru-v1/MeguruShogi-Recovery-1.exe';
fs.copyFileSync(path.join(root,'.tools/engines/meguru-v1/source/YaneuraOu-by-gcc.exe'),path.join(root,executable));
const sources=['position.cpp','position.h','movegen.cpp','movegen.h','config.h','usi.cpp',
 'engine/yaneuraou-engine/yaneuraou-search.cpp','eval/evaluate_bona_piece.cpp','meguru_probe.h'];
const inputs=['scripts/patch-recovery-engine.cjs','engine/meguru_probe.h'];
const manifest={
 name:'MeguruShogi-Recovery-1', createdAt:new Date().toISOString(), rule:'recovery-king-enemy-v1',
 executable,sha256:hash(executable),
 upstreamArchiveSha256:JSON.parse(fs.readFileSync(path.join(root,'scripts/usi-engine-lock.json'),'utf8')).engine.archiveSha256,
 compiler:'w64devkit 2.11.0 / GCC 16.2.0 / x64 AVX2 / 2 jobs / no LTO',
 sourceHashes:Object.fromEntries(sources.map(f=>[f,hash('.tools/engines/meguru-v1/source/'+f)])),
 inputs:Object.fromEntries(inputs.map(f=>[f,hash(f)]))
};
fs.writeFileSync(path.join(root,'.tools/engines/meguru-v1/build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({name:manifest.name,sha256:manifest.sha256}));

