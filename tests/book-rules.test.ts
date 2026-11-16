import test from 'node:test';
import assert from 'node:assert/strict';
import {bookVariant,bookSupported} from '../src/game/book-rules';
import {createGame,play} from '../src/game/engine';
import {DEFAULT_SETTINGS,deserialize,serialize,newGameSettings} from '../src/game/persistence';
import {updateRecovery} from '../src/game/match-settings';
test('book selection distinguishes king rules and rejects every incomplete recovery mask',()=>{
 for(const kingCapture of ['enemy','all','none'] as const)for(const selfCapture of [undefined,'both','none','sente','gote'] as const){const expected=(!selfCapture||selfCapture==='both')&&kingCapture!=='none';assert.equal(bookSupported({kingCapture,selfCapture}),expected);assert.equal(bookVariant({kingCapture,selfCapture}),expected?(kingCapture==='all'?'king-recovery':'recovery'):null);}
});
test('king recovery book survives save and new-game normalization with actual king recovery',()=>{
 const settings={...DEFAULT_SETTINGS,book:true,rules:{kingCapture:'all' as const,selfCapture:'both' as const,moveLimit:320}};
 const game=play(createGame(settings.rules),{from:76,to:75,promote:false});assert.equal(game.log[0]!.selfCapture,true);
 const loaded=deserialize(serialize(game,settings));assert.deepEqual(loaded.game,game);assert(loaded.settings.book);assert(newGameSettings(loaded.settings).book);assert.equal(bookVariant(loaded.game.position.rules),'king-recovery');
 const off=updateRecovery(settings,'gote',false);assert.equal(off.book,false);assert.equal(updateRecovery(off,'gote',true).book,false);assert.equal(updateRecovery(settings,'gote',true).book,true);
});
