import test from 'node:test';
import assert from 'node:assert/strict';
import {trainWeights,assessWeights,wilson,supportedImprovement,type Outcome} from '../scripts/lib/opening-results';
const games=(reversed=false)=>['a','b'].flatMap(root=>Array.from({length:32},(_,replicate)=>({root,replicate,result:{winner:((root==='a')!==(reversed&&replicate>=16)?'sente':'gote') as 'sente'|'gote'}})));
test('opening policy learns only from training games and retains every root',()=>{assert.deepEqual(trainWeights(['a','b'],games()),{a:6,b:1});assert.deepEqual(trainWeights(['a','b'],games(true)),{a:6,b:1});assert.throws(()=>trainWeights(['a','b'],games().slice(1)));});
test('independent validation rejects reversed or equal outcomes',()=>{const weights=trainWeights(['a','b'],games());assert(assessWeights(['a','b'],games(),weights).adopt);assert(!assessWeights(['a','b'],games(true),weights).adopt);const draws:Outcome[]=games().map(g=>({...g,result:{winner:null}}));const r=assessWeights(['a','b'],draws,weights);assert.equal(r.difference,0);assert(!r.adopt);assert.throws(()=>assessWeights(['a','b'],games().slice(0,-1),weights));});
test('win-rate intervals remain bounded for zero and all wins',()=>{assert.equal(wilson(0,0),null);assert(wilson(0,32)![0]!>=0);assert(wilson(32,32)![1]!<=1);assert(Math.abs(wilson(16,32)![0]!+wilson(16,32)![1]!-1)<1e-12);});

test('floating point residue at zero cannot approve a book policy',()=>{assert(!supportedImprovement(.0375,6.94e-18));assert(!supportedImprovement(.02,0));assert(supportedImprovement(.02,.004));});
