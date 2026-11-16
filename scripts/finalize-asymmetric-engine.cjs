const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),dir='.tools/engines/meguru-asymmetric-v1';
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
const executable=dir+'/MeguruShogi-Asymmetric-1.exe';
fs.copyFileSync(path.join(root,dir,'source/YaneuraOu-by-gcc.exe'),path.join(root,executable));
const base=JSON.parse(fs.readFileSync(path.join(root,'.tools/engines/meguru-v1/build-manifest.json'),'utf8'));
const manifest={name:'MeguruShogi-Asymmetric-1',createdAt:new Date().toISOString(),rule:'asymmetric-king-enemy-v1',
 executable,sha256:hash(executable),baseEngineSha256:base.sha256,upstreamArchiveSha256:base.upstreamArchiveSha256,
 compiler:base.compiler,sourceHashes:Object.fromEntries(Object.keys(base.sourceHashes).map(f=>[f,hash(dir+'/source/'+f)])),
 inputs:Object.fromEntries(['scripts/patch-asymmetric-engine.cjs','scripts/patch-recovery-engine.cjs','engine/meguru_probe.h'].map(f=>[f,hash(f)]))};
fs.writeFileSync(path.join(root,dir,'build-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({name:manifest.name,sha256:manifest.sha256}));
