import {createGame, legalMoves, moveLabel, opposite, play, resign, withMoveLimit, validMoveLimit,
  DEFAULT_MOVE_LIMIT, SIDE_LABEL, type Game, type Result, type Rules, type Side} from './engine';
import {DEFAULT_SETTINGS, type Settings} from './persistence';
import {playerFor, withPlayers, type Players, type PlayerSettings} from './match-settings';
import {DEFAULT_CPU_LEVEL, validCpuLevel} from './cpu-levels';
import {HANDICAPS, HANDICAP_KINDS, type Handicap} from './handicap';

export const MAX_SHARED_RECORD_LENGTH = 200_000;
const MAX_PLIES = 5000;
const recoveryNames = {both:'両者回収可', none:'回収なし', sente:'先手だけ回収可', gote:'後手だけ回収可'} as const;
const kingNames = {enemy:'相手のみ', all:'味方も取れる', none:'取れない'} as const;
const reasonNames: Record<Result['reason'], string> = {mate:'詰み', 'no-moves':'指せる手なし', repetition:'千日手', 'perpetual-check':'連続王手', resign:'投了', 'move-limit':'手数上限'};
export const sharedResult = (result: Result|null) => result
  ? `${result.winner ? SIDE_LABEL[result.winner]+'の勝ち' : '引き分け'} · ${reasonNames[result.reason]}` : '途中終了';
const playerName = (player: PlayerSettings) => player.kind === 'human' ? '人間' : `CPU Lv.${player.level}`;

/** The human-readable share text is also the portable replay format. */
export function formatSharedRecord(game: Game, settings: Settings, startedAt: string|null = null): string {
  const rules = game.position.rules;
  return [
    '生贄将棋', `棋譜形式:${rules.handicap?2:1}`, `対局日時:${startedAt ?? '不明'}`,
    ...(rules.handicap?[`手合割:${HANDICAPS[rules.handicap.kind].label} · 上手:${SIDE_LABEL[rules.handicap.side]}`]:[]),
    `先手 ${playerName(playerFor(settings,'sente'))} ／ 後手 ${playerName(playerFor(settings,'gote'))}`,
    `${recoveryNames[rules.selfCapture ?? 'both']} · 玉:${kingNames[rules.kingCapture]}`,
    `手数上限:${rules.moveLimit ?? DEFAULT_MOVE_LIMIT}`,
    ...game.log.map((record, index) => `${index+1} ${record.label}`),
    `結果:${sharedResult(game.result)}`,
  ].join('\n');
}

export type ImportedRecord = {
  game: Game; settings: Settings; startedAt: string|null;
  warnings: string[]; needsResignationSide: boolean;
};
const compact = (s: string) => s.normalize('NFKC').replace(/\s/g, '');
const recoveryValues: Record<string, NonNullable<Rules['selfCapture']>> = {
  '両者回収可':'both', '両者が回収できる':'both', '回収なし':'none', '通常ルール(回収なし)':'none',
  '先手だけ回収可':'sente', '先手だけ回収できる':'sente', '後手だけ回収可':'gote', '後手だけ回収できる':'gote',
};
const kingValues: Record<string, Rules['kingCapture']> = {
  '相手のみ':'enemy', '味方も取れる':'all', '取れない':'none',
  '玉は味方の駒を回収できません。相手の駒は取れます。':'enemy',
  '玉も味方の駒を回収できます。相手の駒も取れます。':'all',
  '玉は空きマスにだけ移動できます。相手の駒も取れません。':'none',
};
const parsePlayer = (s: string): PlayerSettings => {
  if (s === '人間') return {kind:'human', level:DEFAULT_CPU_LEVEL};
  const match = /^CPU Lv\.(\d+)$/.exec(s);
  const level = Number(match?.[1]);
  if (!validCpuLevel(level)) throw Error('CPUレベルは1〜10で指定してください。');
  return {kind:'cpu', level};
};

/** Validate every ply before saving anything. Yield regularly so long imports stay cancellable. */
export async function readSharedRecord(text: string, cancelled: () => boolean = () => false): Promise<ImportedRecord> {
  if (text.length > MAX_SHARED_RECORD_LENGTH) throw Error('棋譜が長すぎます。20万文字以内の棋譜を貼り付けてください。');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.normalize('NFKC').trim()).filter(Boolean);
  if (lines.shift() !== '生贄将棋') throw Error('このアプリで共有した棋譜を、「生贄将棋」の見出しから最後まで貼り付けてください。');
  let version: number|undefined, recovery: Rules['selfCapture'], king: Rules['kingCapture']|undefined;
  let limit: number|undefined, players: Players|undefined, startedAt: string|null = null;
  let dateSeen = false, ending: string|undefined;
  let handicap:Handicap|undefined;
  const labels: string[] = [], warnings: string[] = [];
  const once = (exists: boolean) => { if (exists) throw Error('設定や結果が重複しています。1局分の棋譜を貼り付けてください。'); };
  for (const line of lines) {
    const numbered = /^(\d+)\s+(.+)$/.exec(line);
    if (numbered) {
      if (ending !== undefined || Number(numbered[1]) !== labels.length+1) throw Error(`${labels.length+1}手目の番号がありません。棋譜の抜けや重複を確認してください。`);
      labels.push(numbered[2]!);
      if (labels.length > MAX_PLIES) throw Error('5000手を超える棋譜は読み込めません。');
      continue;
    }
    const result = /^(?:結果:)?((?:先手の勝ち|後手の勝ち|引き分け)\s*·\s*.+|途中終了|投了|詰み|指せる手がありません|千日手|連続王手の千日手|手数上限超過)$/.exec(line);
    if (result) { once(ending !== undefined); ending = result[1]!; continue; }
    if (labels.length || ending !== undefined) throw Error('指し手または結果を読み取れません。棋譜の末尾まで正しく貼り付けてください。');
    if (line.startsWith('棋譜形式:')) {
      once(version !== undefined); version = Number(line.slice(5));
      if (version !== 1 && version !== 2) throw Error('この棋譜形式には対応していません。アプリを更新してください。');
      continue;
    }
    if(line.startsWith('手合割:')){
      once(handicap!==undefined);
      const match=/^手合割:(.+?)\s*·\s*上手:(先手|後手)$/.exec(line);
      const kind=HANDICAP_KINDS.find(k=>HANDICAPS[k].label===match?.[1]);
      if(!match||!kind)throw Error('駒落ちの種類または上手を読み取れません。');
      handicap={kind,side:match[2]==='先手'?'sente':'gote'};
      continue;
    }
    if (line.startsWith('対局日時:')) {
      once(dateSeen); dateSeen = true;
      const value = line.slice(5);
      if (value !== '不明') {
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) throw Error('対局日時が不正です。');
        startedAt = new Date(value).toISOString();
      }
      continue;
    }
    // Older archive shares used a localized date without a timezone. Do not invent one.
    if (/^\d{4}\/\d{1,2}\/\d{1,2}\s/.test(line) || line === '日付不明(更新前の対局)' || line === '日時不明') {
      once(dateSeen); dateSeen = true;
      warnings.push('旧形式の日時はタイムゾーンが不明なため、日時不明として保存します。'); continue;
    }
    const playerLine = /^先手 (人間|CPU Lv\.\d+)\s*\/\s*後手 (人間|CPU Lv\.\d+)$/.exec(line);
    if (playerLine) { once(!!players); players = {sente:parsePlayer(playerLine[1]!), gote:parsePlayer(playerLine[2]!)}; continue; }
    const ruleLine = /^(.+?)\s*·\s*玉:(.+)$/.exec(line);
    if (ruleLine) {
      once(recovery !== undefined || king !== undefined);
      if (!Object.hasOwn(recoveryValues,ruleLine[1]!.trim()) || !Object.hasOwn(kingValues,ruleLine[2]!.trim())) throw Error('回収ルールまたは玉のルールを読み取れません。');
      recovery = recoveryValues[ruleLine[1]!.trim()]; king = kingValues[ruleLine[2]!.trim()];
      if (recovery === undefined || king === undefined) throw Error('回収ルールまたは玉のルールを読み取れません。');
      continue;
    }
    if (Object.hasOwn(recoveryValues, line)) { once(recovery !== undefined); recovery = recoveryValues[line]!; continue; }
    if (Object.hasOwn(kingValues, line)) { once(king !== undefined); king = kingValues[line]!; continue; }
    const limitLine = /^手数上限:(\d+)(?:手を超えたら引き分け)?$/.exec(line);
    if (limitLine) {
      once(limit !== undefined); limit = Number(limitLine[1]);
      if (!validMoveLimit(limit)) throw Error('手数上限は1〜4999の整数で指定してください。');
      continue;
    }
    if (/^(?:やねうら王|従来CPU)(?:\s|$)/.test(line)) {
      const solo = /あなた:(先手|後手)\s*\/\s*CPU Lv\.(\d+)/.exec(line);
      const watch = /先手 Lv\.(\d+)\s*\/\s*後手 Lv\.(\d+)/.exec(line);
      once(!!players);
      if (solo) {
        const human = parsePlayer('人間'), cpu = parsePlayer('CPU Lv.'+solo[2]);
        players = solo[1] === '先手' ? {sente:human,gote:cpu} : {sente:cpu,gote:human};
      } else if (watch) players = {sente:parsePlayer('CPU Lv.'+watch[1]),gote:parsePlayer('CPU Lv.'+watch[2])};
      else players = {sente:parsePlayer('人間'),gote:parsePlayer('人間')};
      continue;
    }
    throw Error('このアプリの棋譜として読み取れない行があります。共有文を省略せず貼り付けてください。');
  }
  if (king === undefined || recovery === undefined) throw Error('玉と自駒回収のルールがありません。共有文の見出しも貼り付けてください。');
  if ((version === 1 || version === 2) && (limit === undefined || !players || !dateSeen || ending === undefined)) throw Error('棋譜の設定または結果が欠けています。全文を貼り付けてください。');
  if((version===2)!==(handicap!==undefined))throw Error('駒落ちの設定と棋譜形式が一致しません。全文を貼り付けてください。');
  if (!labels.length && !ending?.includes('投了')) throw Error('指し手がありません。');
  if (limit === undefined) {
    // Legacy archives did not include the limit. Preserve their stated ending and all plies.
    limit = ending?.includes('手数上限') ? labels.length-1 : Math.max(DEFAULT_MOVE_LIMIT, labels.length);
    if (!validMoveLimit(limit)) throw Error('この旧形式の棋譜では手数上限を復元できません。新しい形式で共有し直してください。');
    warnings.push(`旧形式には手数上限がないため、再生用の上限を${limit}手として保存します。`);
  }
  const rules: Rules = {kingCapture:king, selfCapture:recovery, moveLimit:limit,...(handicap?{handicap}:{})};
  const settings = withPlayers({...DEFAULT_SETTINGS, rules, flipped:false, book:false}, players ?? {sente:parsePlayer('人間'),gote:parsePlayer('人間')});
  // Historical saves may have acquired a lower limit after their moves were played.
  let game = createGame({kingCapture:king,selfCapture:recovery,...(handicap?{handicap}:{})});
  for (let index = 0; index < labels.length; index++) {
    if (index % 16 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (cancelled()) throw Error('読み込みを中止しました。');
    if (game.result) throw Error(`${index+1}手目は終局後の指し手です。`);
    const candidates = legalMoves(game.position).filter(move => compact(moveLabel(game.position,move)) === compact(labels[index]!));
    if (candidates.length !== 1) throw Error(`${index+1}手目を再現できません。指し手やルールが変更されていないか確認してください。`);
    game = play(game, candidates[0]!);
  }
  let needsResignationSide = false;
  const normalizedEnding = ending?.replace('指せる手がありません','指せる手なし').replace('連続王手の千日手','連続王手').replace('手数上限超過','手数上限');
  if (normalizedEnding?.includes('投了')) {
    if (game.result) throw Error('盤面の終局結果と「投了」が一致しません。');
    const winner = normalizedEnding.startsWith('先手の勝ち') ? 'sente' : normalizedEnding.startsWith('後手の勝ち') ? 'gote' : null;
    if (winner) game = resign(game,opposite(winner));
    else if (normalizedEnding === '投了') needsResignationSide = true;
    else throw Error('投了の勝敗を読み取れません。');
  }
  game = withMoveLimit(game,limit);
  if (needsResignationSide && game.result) throw Error('手数上限と「投了」が一致しません。');
  if (!needsResignationSide) {
    const actual = sharedResult(game.result);
    if (normalizedEnding !== undefined && normalizedEnding !== '途中終了' &&
        compact(normalizedEnding) !== compact(actual) && normalizedEnding !== (game.result && reasonNames[game.result.reason])) {
      throw Error('記載された勝敗・終了理由が指し手と一致しません。');
    }
    if ((!normalizedEnding || normalizedEnding === '途中終了') && game.result) throw Error('終局した棋譜ですが、結果の記載がありません。全文を貼り付けてください。');
  }
  return {game,settings,startedAt,warnings,needsResignationSide};
}

export function resolveSharedResignation(record: ImportedRecord, side: Side): ImportedRecord {
  if (!record.needsResignationSide) return record;
  return {...record, game:resign(record.game,side), needsResignationSide:false};
}
