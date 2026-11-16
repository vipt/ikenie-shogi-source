import {validSession,type GameSession} from './session';
import {bookSupported} from './book-rules';
import {preparePlayers,type Players} from './match-settings';
import {replayStep,type RedoStep} from './history';
import { createGame, play, resign, withMoveLimit, DEFAULT_MOVE_LIMIT, validMoveLimit, type Game, type Move, type Rules, type Side } from './engine';
import type { Difficulty } from './cpu';
import {DEFAULT_CPU_LEVEL,legacyCpuLevel,validCpuLevel,type CpuLevel} from './cpu-levels';

export type Settings = { players?:Players; mode: 'cpu' | 'local' | 'watch'; rules: Rules; sound: boolean; moveSound: boolean; moveSoundVolume: number; showEvaluation: boolean; flipped: boolean; difficulty: Difficulty; cpuLevel?:CpuLevel; humanSide?:Side; watchCpuLevels?:Record<Side,CpuLevel>; cpuEngine: 'native'|'classic'; model: 'hao'|'trained'; book: boolean };
export const DEFAULT_SETTINGS: Settings = { mode: 'cpu', rules: { kingCapture: 'all', moveLimit: DEFAULT_MOVE_LIMIT }, sound: true, moveSound: true, moveSoundVolume: 75, showEvaluation: true, flipped: false, difficulty: 'strong', cpuLevel:DEFAULT_CPU_LEVEL, humanSide:'sente', cpuEngine: 'native', model: 'hao', book: false };
type SavedGame = { version: 1; settings: Settings; moves: Move[]; resigned: 'sente' | 'gote' | null; redo?:RedoStep[]; session?:GameSession };

export function serialize(game: Game, settings: Settings, redo:RedoStep[] = [],session?:GameSession): string {
  const data: SavedGame = {
    version: 1, settings, ...(redo.length?{redo}:{}), ...(session?{session}:{}), moves: game.log.map(r => r.move),
    resigned: game.result?.reason === 'resign' ? (game.result.winner === 'sente' ? 'gote' : 'sente') : null,
  };
  return JSON.stringify(data);
}

export function deserialize(raw: string): { game: Game; settings: Settings; redo?:RedoStep[];session?:GameSession } {
  const data = JSON.parse(raw) as SavedGame;
  if (!data || data.version !== 1 || !Array.isArray(data.moves) || data.moves.length > 5000 ||
    !['cpu', 'local', 'watch'].includes(data.settings?.mode) ||
    !['enemy', 'all', 'none'].includes(data.settings?.rules?.kingCapture) ||
    typeof data.settings.sound !== 'boolean' || typeof data.settings.flipped !== 'boolean' ||
    ![null, 'sente', 'gote'].includes(data.resigned)) throw new Error('保存データを読み込めませんでした。');
  if(data.session!==undefined&&!validSession(data.session))throw new Error('対局IDが不正です。');
  if (data.settings.difficulty === undefined) data.settings.difficulty = 'strong';
  if (!['easy', 'normal', 'strong'].includes(data.settings.difficulty)) throw new Error('CPUの強さ設定が不正です。');
  if(data.settings.cpuLevel===undefined)data.settings.cpuLevel=legacyCpuLevel(data.settings.difficulty);
  if(!validCpuLevel(data.settings.cpuLevel))throw new Error('CPUレベルは1〜10で指定してください。');
  if(data.settings.humanSide===undefined)data.settings.humanSide='sente';
  if(!['sente','gote'].includes(data.settings.humanSide))throw new Error('自分の手番設定が不正です。');
  const levels=data.settings.watchCpuLevels;
  if(levels!==undefined&&(!levels||typeof levels!=='object'||Array.isArray(levels)||!validCpuLevel(levels.sente)||!validCpuLevel(levels.gote)))throw new Error('先手・後手のCPUレベルは1〜10で指定してください。');
  if(data.settings.players!==undefined){
    const players=data.settings.players;
    if(!players||typeof players!=='object'||Array.isArray(players)||(['sente','gote'] as const).some(side=>{const p=players[side];return !p||typeof p!=='object'||Array.isArray(p)||!['human','cpu'].includes(p.kind)||!validCpuLevel(p.level);}))throw new Error('先手・後手の設定が不正です。');
    data.settings=preparePlayers(data.settings);
  }
  if(data.settings.moveSoundVolume===undefined)data.settings.moveSoundVolume=75;
  if(!Number.isInteger(data.settings.moveSoundVolume)||data.settings.moveSoundVolume<0||data.settings.moveSoundVolume>100)throw new Error('駒音の音量設定が不正です。');
  data.settings.moveSound ??= true; data.settings.showEvaluation ??= true;
  if(typeof data.settings.moveSound!=='boolean'||typeof data.settings.showEvaluation!=='boolean')throw new Error('表示・音の設定が不正です。');
  data.settings.cpuEngine ??= 'native'; data.settings.model ??= 'hao'; data.settings.book ??= false;
  if(!['native','classic'].includes(data.settings.cpuEngine)||!['hao','trained'].includes(data.settings.model)||typeof data.settings.book!=='boolean')throw new Error('CPU設定が不正です。');
  data.settings.cpuEngine='native';data.settings.model='hao';
  if(data.settings.rules.selfCapture!==undefined&&!['both','none','sente','gote'].includes(data.settings.rules.selfCapture))throw new Error('回収ルールが不正です。');
  if(!bookSupported(data.settings.rules))data.settings.book=false;
  if(data.settings.rules.moveLimit===undefined)data.settings.rules.moveLimit=DEFAULT_MOVE_LIMIT;
  if(!validMoveLimit(data.settings.rules.moveLimit))throw new Error('手数上限が不正です。');
  // Replay the complete historical record before applying the newly introduced limit.
  const {moveLimit,...replayRules}=data.settings.rules;
  let game = createGame(replayRules);
  for (const move of data.moves) {
    if (!move || typeof move !== 'object') throw new Error('棋譜に不正な手があります。');
    game = play(game, move);
  }
  if (data.resigned) game = resign(game, data.resigned);
  game=withMoveLimit(game,moveLimit);
  const redo=data.redo??[];
  if(!Array.isArray(redo)||redo.length>5000)throw new Error('進む手順が不正です。');
  let future=game,total=game.log.length;
  for(const step of redo){
    if(!step||!Array.isArray(step.moves)||!step.moves.length||![null,'sente','gote'].includes(step.resigned))throw new Error('進む手順が不正です。');
    total+=step.moves.length;if(total>5000)throw new Error('進む手順が長すぎます。');
    future=replayStep(future,step);
  }
  return { game, settings: data.settings, ...(redo.length?{redo}:{}),...(data.session?{session:data.session}:{}) };
}

/** New games use the fixed mobile CPU and the two currently offered king rules.
 * Historical games retain their original rules when restored. */
export function newGameSettings(settings:Settings):Settings {
 settings=preparePlayers(settings);
 const rules={...settings.rules,kingCapture:settings.rules.kingCapture==='none'?'enemy' as const:settings.rules.kingCapture};
 return {...settings,humanSide:settings.humanSide??'sente',flipped:settings.mode==='cpu'?settings.humanSide==='gote':settings.flipped,cpuEngine:'native',model:'hao',rules,book:settings.book&&bookSupported(rules)};
}
