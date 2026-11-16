import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, play, resign } from '../src/game/engine';
import { DEFAULT_SETTINGS, deserialize, serialize } from '../src/game/persistence';

test('saved moves restore recovered pieces, result, and settings', () => {
  const game = resign(play(createGame(DEFAULT_SETTINGS.rules), { from: 70, to: 61, promote: false }));
  const settings = { ...DEFAULT_SETTINGS, flipped: true, mode: 'local' as const };
  assert.deepEqual(deserialize(serialize(game, settings)), { game, settings });
});
test('malformed, unsupported, and illegal stored moves are rejected', () => {
  for (const raw of ['not json', 'null', '{}', '{"version":2}', JSON.stringify({ version: 1, settings: DEFAULT_SETTINGS, moves: [null], resigned: null }), JSON.stringify({ version: 1, settings: DEFAULT_SETTINGS, moves: [{ from: 70, to: 0, promote: false }], resigned: null })]) {
    assert.throws(() => deserialize(raw));
  }
});
test('v1.0.1 saves migrate to the stronger CPU without losing the game', () => {
  const game = play(createGame(), { from: 70, to: 61, promote: false });
  const saved = JSON.parse(serialize(game, { ...DEFAULT_SETTINGS, rules: game.position.rules }));
  delete saved.settings.difficulty;
  const restored = deserialize(JSON.stringify(saved));
  assert.deepEqual(restored.game, game);
  assert.equal(restored.settings.difficulty, 'strong');
});

test('CPU spectator settings and asymmetric rules survive save and restore', () => {
  const settings = { ...DEFAULT_SETTINGS, mode: 'watch' as const, rules: { moveLimit:320, kingCapture: 'enemy' as const, selfCapture: 'sente' as const }, model: 'trained' as const };
  const game = play(createGame(settings.rules), { from: 70, to: 61, promote: false });
  assert.deepEqual(deserialize(serialize(game, settings)), {game, settings:{...settings,model:'hao'}});
});

test('older saves select the native baseline and disable incompatible books', () => {
  const saved = JSON.parse(serialize(createGame(), DEFAULT_SETTINGS));
  delete saved.settings.cpuEngine; delete saved.settings.model; delete saved.settings.book;
  const restored = deserialize(JSON.stringify(saved));
  assert.equal(restored.settings.cpuEngine, 'native'); assert.equal(restored.settings.model, 'hao'); assert.equal(restored.settings.book, false);
  saved.settings.model = 'trained'; saved.settings.book = true; saved.settings.rules.selfCapture = 'none';
  assert.equal(deserialize(JSON.stringify(saved)).settings.book, false);
  saved.settings.rules.selfCapture = 'invalid';
  assert.throws(() => deserialize(JSON.stringify(saved)));
});

test('Hao opening book survives restart without changing evaluation', () => {
  const settings = {...DEFAULT_SETTINGS, book:true};
  assert.deepEqual(deserialize(serialize(createGame(settings.rules),settings)).settings,settings);
  for(const kingCapture of ['none'] as const){
    const incompatible={...settings,rules:{kingCapture}};
    assert.equal(deserialize(serialize(createGame(incompatible.rules),incompatible)).settings.book,false);
  }
});
