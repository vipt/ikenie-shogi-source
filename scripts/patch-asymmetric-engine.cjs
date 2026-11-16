// Separate derivative of the validated recovery engine. GPL-3.0-or-later.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const base=path.join(root,'.tools/engines/meguru-v1/source');
const dest=path.join(root,'.tools/engines/meguru-asymmetric-v1/source');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'.tools/engines/meguru-v1/build-manifest.json'),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [f,h] of Object.entries(manifest.sourceHashes))if(sha(path.join(base,f))!==h)throw Error('Base source mismatch '+f);
fs.cpSync(base,dest,{recursive:true,filter:p=>!p.endsWith('.exe')});
function edit(f,from,to){
 const p=path.join(dest,f);let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
 if(s.split(from).length!==2)throw Error('Patch mismatch '+f+' '+from);
 fs.writeFileSync(p,s.replace(from,to));
}
edit('position.h','namespace YaneuraOu {',
'namespace YaneuraOu {\n// Fixed per process before positions are searched; bit 0=BLACK, bit 1=WHITE.\ninline int meguru_recovery_mask = 0;\ninline bool meguru_can_recover(Color side) { return (meguru_recovery_mask & (1 << int(side))) != 0; }\n');
edit('position.cpp','if (type_of(piece_on(to)) == KING || ((pieces(us) & to) && type_of(pc) == KING))',
'if (type_of(piece_on(to)) == KING || ((pieces(us) & to) && (type_of(pc) == KING || !meguru_can_recover(us))))');
edit('movegen.cpp','if (Type == QUIETS || Type == QUIETS_PRO_MINUS || Type == NON_EVASIONS) {',
'if (meguru_can_recover(Us) && (Type == QUIETS || Type == QUIETS_PRO_MINUS || Type == NON_EVASIONS)) {');
edit('usi.cpp','else if (token == "meguru_features") {',[
'else if (token == "meguru_rules") {',
'        engine.wait_for_search_finished();',
'        std::string value; is >> value;',
'        const int requested = value == "sente" ? 1 : value == "gote" ? 2 : -1;',
'        // Disallow rule changes after setup to avoid stale hashes.',
'        if (requested < 0 || (meguru_recovery_mask && meguru_recovery_mask != requested))',
'            sync_cout << "meguru_rules error" << sync_endl;',
'        else {',
'            meguru_recovery_mask = requested;',
'            sync_cout << "meguru_rules " << value << sync_endl;',
'        }',
'    }',
'    else if (token == "meguru_features") {'].join('\n'));
edit('meguru_probe.h','recovery-king-enemy-v1','asymmetric-king-enemy-v1');
edit('meguru_probe.h','out << "],\\"valid\\":"','out << "],\\"recoveryMask\\":" << meguru_recovery_mask << ",\\"valid\\":"');
console.log('Prepared isolated asymmetric source.');
