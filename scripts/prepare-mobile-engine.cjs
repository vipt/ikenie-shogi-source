const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),moduleRoot=path.join(root,'modules/meguru-engine');
const base=path.join(root,'.tools/engines/meguru-asymmetric-v1/source');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.tools/engines/meguru-asymmetric-v1/build-manifest.json'),'utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [f,h] of Object.entries(manifest.sourceHashes))if(hash(path.join(base,f))!==h)throw Error('Source mismatch '+f);
const dest=path.join(moduleRoot,'cpp/engine');fs.mkdirSync(dest,{recursive:true});
fs.cpSync(base,dest,{recursive:true,filter:p=>!p.endsWith('.exe')});
function edit(f,from,to){
 const p=path.join(dest,f),s=fs.readFileSync(p,'utf8');
 if(s.split(from).length!==2)throw Error('Mobile patch mismatch '+f+' '+from);
 fs.writeFileSync(p,s.replace(from,to));
}
edit('usi.h','class USIEngine {\npublic:','class USIEngine {\npublic:\n    bool mobile_command(const std::string& cmd) { return usi_cmdexec(cmd); }');
edit('engine.cpp','Option(4, 1, MaxThreads','Option(1, 1, MaxThreads');
edit('meguru_probe.h','inline void meguru_probe(Position& pos) {','inline std::string meguru_probe_text(Position& pos) {');
edit('meguru_probe.h','sync_cout << out.str() << sync_endl;\n}\ninline void meguru_features','return out.str().substr(13);\n}\ninline void meguru_probe(Position& pos) { sync_cout << "meguru_probe " << meguru_probe_text(pos) << sync_endl; }\ninline void meguru_features');
const make=fs.readFileSync(path.join(base,'Makefile'),'utf8');
const common=make.match(/^SOURCES  = ([\s\S]*?)\nCUDA_SOURCES/m)[1].match(/[\w/.-]+\.cpp/g);
const learning=['book/makebook.cpp','book/makebook2015.cpp','book/makebook2025.cpp','learn/learner.cpp','learn/learning_tools.cpp','learn/multi_think.cpp'];
const nnue=['eval/nnue/evaluate_nnue.cpp','eval/nnue/evaluate_nnue_learner.cpp','eval/nnue/nnue_test_command.cpp','eval/nnue/features/k.cpp','eval/nnue/features/p.cpp','eval/nnue/features/half_kp.cpp','eval/nnue/features/half_kp_vm.cpp','eval/nnue/features/half_relative_kp.cpp','eval/nnue/features/half_kpe9.cpp','eval/nnue/features/pe9.cpp','engine/yaneuraou-engine/yaneuraou-search.cpp'];
const sources=[...common,...learning,...nnue].filter(f=>f!=='main.cpp');
for(const f of sources)if(!fs.existsSync(path.join(dest,f)))throw Error('Missing '+f);
fs.writeFileSync(path.join(moduleRoot,'cpp/sources.cmake'),'set(MEGURU_ENGINE_SOURCES\n'+sources.map(f=>'  "'+'$'+'{CMAKE_CURRENT_LIST_DIR}/engine/'+f+'"').join('\n')+'\n)\n');
fs.writeFileSync(path.join(moduleRoot,'source-files.json'),JSON.stringify(sources,null,2));
const assets=path.join(moduleRoot,'assets');fs.mkdirSync(assets,{recursive:true});
const models={
 hao:{from:'.tools/engines/hao/eval/nn.bin',sha:'1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782'},
 trained:{from:'artifacts/engines/recovery-v1/eval/nn.bin',sha:'fff2b55c373bf1d3bc2fb10d99ea4161329c3eedb566fa0dfc2c13c1450a266e'}
};
for(const [name,m] of Object.entries(models)){
 if(hash(path.join(root,m.from))!==m.sha)throw Error('Model mismatch '+name);
 fs.copyFileSync(path.join(root,m.from),path.join(assets,name+'.nnue'));
}
fs.copyFileSync(path.join(root,'artifacts/engines/recovery-book-v2/book/user_book1.db'),path.join(assets,'user_book1.db'));
fs.copyFileSync(path.join(root,'engine/COPYING'),path.join(moduleRoot,'COPYING'));
fs.writeFileSync(path.join(moduleRoot,'engine-manifest.json'),JSON.stringify({version:'mobile-1',baseEngineSha256:manifest.sha256,models,bookSha256:hash(path.join(assets,'user_book1.db')),rule:'king enemy; recovery mask 0..3',sources},null,2));
console.log('Prepared '+sources.length+' C++ sources and two NNUE models.');
require('./update-mobile-book.cjs');
