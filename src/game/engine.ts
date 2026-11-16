/** Pure rules engine. Squares run left-to-right (9→1), top-to-bottom (一→九). */
import {HANDICAPS, validHandicap, type Handicap} from './handicap';
export type Side = 'sente' | 'gote';
export type Kind = 'P' | 'L' | 'N' | 'S' | 'G' | 'B' | 'R' | 'K';
export type HandKind = Exclude<Kind, 'K'>;
export type Piece = { kind: Kind; side: Side; promoted: boolean };
export type Hand = Record<HandKind, number>;
export type Rules = { kingCapture: 'enemy' | 'none' | 'all'; selfCapture?: Side | 'both' | 'none'; moveLimit?: number; handicap?:Handicap };
export type Position = {
  board: (Piece | null)[];
  hands: Record<Side, Hand>;
  turn: Side;
  rules: Rules;
};
export type Move = { from: number; to: number; promote: boolean } | { drop: HandKind; to: number };
export type Result = { winner: Side | null; reason: 'mate' | 'no-moves' | 'repetition' | 'perpetual-check' | 'resign' | 'move-limit' };
export type MoveRecord = { move: Move; side: Side; label: string; selfCapture: boolean };
type Trail = { position: Position; key: string; mover: Side | null; check: boolean };
export type Game = { position: Position; log: MoveRecord[]; trail: Trail[]; result: Result | null };

export const HAND_KINDS: HandKind[] = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
export const LABELS: Record<Kind, string> = { P: '歩', L: '香', N: '桂', S: '銀', G: '金', B: '角', R: '飛', K: '玉' };
export const PROMOTED: Partial<Record<Kind, string>> = { P: 'と', L: '杏', N: '圭', S: '全', B: '馬', R: '龍' };
export const SIDE_LABEL: Record<Side, string> = { sente: '先手', gote: '後手' };
export const DEFAULT_MOVE_LIMIT=320;
export const MAX_MOVE_LIMIT=4999;
export const validMoveLimit=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=MAX_MOVE_LIMIT;
export const DEFAULT_RULES: Rules = { kingCapture: 'enemy', moveLimit: DEFAULT_MOVE_LIMIT };
export const opposite = (side: Side): Side => side === 'sente' ? 'gote' : 'sente';
export const row = (square: number) => Math.floor(square / 9);
export const col = (square: number) => square % 9;
export const pieceLabel = (piece: Piece) => piece.promoted ? PROMOTED[piece.kind] ?? LABELS[piece.kind] : LABELS[piece.kind];
export const squareLabel = (square: number) => `${9 - col(square)}${'一二三四五六七八九'[row(square)]}`;
export const emptyHand = (): Hand => ({ P: 0, L: 0, N: 0, S: 0, G: 0, B: 0, R: 0 });
export function initialPosition(rules: Rules = DEFAULT_RULES): Position {
  const board: Position['board'] = Array.from({ length: 81 }, () => null);
  const back: Kind[] = ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L'];
  for (const side of ['sente', 'gote'] as const) {
    const base = side === 'sente' ? 8 : 0;
    back.forEach((kind, c) => { board[base * 9 + c] = { kind, side, promoted: false }; });
    for (let c = 0; c < 9; c++) board[(side === 'sente' ? 6 : 2) * 9 + c] = { kind: 'P', side, promoted: false };
  }
  board[10] = { kind: 'R', side: 'gote', promoted: false };
  board[16] = { kind: 'B', side: 'gote', promoted: false };
  board[64] = { kind: 'B', side: 'sente', promoted: false };
  board[70] = { kind: 'R', side: 'sente', promoted: false };
  if(rules.handicap!==undefined){
    if(!validHandicap(rules.handicap))throw Error('駒落ちの設定が不正です。');
    for(const square of HANDICAPS[rules.handicap.kind].removed)board[rules.handicap.side==='gote'?square:80-square]=null;
  }
  return { board, hands: { sente: emptyHand(), gote: emptyHand() }, turn: rules.handicap?.side??'sente', rules: { ...rules } };
}

const gold = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, 0]];
const king = [...gold, [1, -1], [1, 1]];
function vectors(piece: Piece): { steps: number[][]; rays: number[][] } {
  if (piece.promoted && ['P', 'L', 'N', 'S'].includes(piece.kind)) return { steps: gold, rays: [] };
  switch (piece.kind) {
    case 'P': return { steps: [[-1, 0]], rays: [] };
    case 'L': return { steps: [], rays: [[-1, 0]] };
    case 'N': return { steps: [[-2, -1], [-2, 1]], rays: [] };
    case 'S': return { steps: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]], rays: [] };
    case 'G': return { steps: gold, rays: [] };
    case 'K': return { steps: king, rays: [] };
    case 'B': return { steps: piece.promoted ? [[-1, 0], [1, 0], [0, -1], [0, 1]] : [], rays: [[-1, -1], [-1, 1], [1, -1], [1, 1]] };
    case 'R': return { steps: piece.promoted ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [], rays: [[-1, 0], [1, 0], [0, -1], [0, 1]] };
  }
}

/** Geometric attacks include the first occupied square. Kings may never be adjacent. */
function destinations(position: Position, from: number): number[] {
  const piece = position.board[from];
  if (!piece) return [];
  const direction = piece.side === 'sente' ? 1 : -1;
  const { steps, rays } = vectors(piece);
  const squares: number[] = [];
  const trace = (vector: number[], sliding: boolean) => {
    const dr = vector[0]! * direction, dc = vector[1]! * direction;
    let r = row(from) + dr, c = col(from) + dc;
    while (r >= 0 && r < 9 && c >= 0 && c < 9) {
      const to = r * 9 + c;
      squares.push(to);
      if (position.board[to] || !sliding) break;
      r += dr; c += dc;
    }
  };
  steps.forEach(v => trace(v, false));
  rays.forEach(v => trace(v, true));
  return squares;
}

/** Geometric control, including the first blocker; not necessarily a legal move. */
export const attackedSquares = destinations;

export function isInCheck(position: Position, side: Side): boolean {
  const square = position.board.findIndex(p => p?.side === side && p.kind === 'K');
  if (square === -1) return true;
  const kr = row(square), kc = col(square);
  for (let from = 0; from < 81; from++) {
    const p = position.board[from];
    if (!p || p.side === side) continue;
    const direction = p.side === 'sente' ? 1 : -1;
    const dr = (kr - row(from)) * direction, dc = (kc - col(from)) * direction;
    const ar = Math.abs(dr), ac = Math.abs(dc);
    let ray = false;
    if (p.kind === 'K') { if (ar <= 1 && ac <= 1) return true; continue; }
    if (p.kind === 'G' || (p.promoted && ['P', 'L', 'N', 'S'].includes(p.kind))) {
      if ((dr === -1 && ac <= 1) || (dr === 0 && ac === 1) || (dr === 1 && dc === 0)) return true;
    } else if (p.kind === 'P') { if (dr === -1 && dc === 0) return true; }
    else if (p.kind === 'N') { if (dr === -2 && ac === 1) return true; }
    else if (p.kind === 'S') { if ((dr === -1 && ac <= 1) || (dr === 1 && ac === 1)) return true; }
    else if (p.kind === 'L') ray = dr < 0 && dc === 0;
    else if (p.kind === 'B') {
      if (p.promoted && ar + ac === 1) return true;
      ray = ar === ac;
    } else if (p.kind === 'R') {
      if (p.promoted && ar === 1 && ac === 1) return true;
      ray = dr === 0 || dc === 0;
    }
    if (!ray) continue;
    const step = Math.sign(kr - row(from)) * 9 + Math.sign(kc - col(from));
    let blocked = false;
    for (let between = from + step; between !== square; between += step) {
      if (position.board[between]) { blocked = true; break; }
    }
    if (!blocked) return true;
  }
  return false;
}

const inCamp = (square: number, side: Side) => side === 'sente' ? row(square) <= 2 : row(square) >= 6;
function deadRank(kind: Kind, square: number, side: Side): boolean {
  const distance = side === 'sente' ? row(square) : 8 - row(square);
  return (kind === 'P' || kind === 'L') ? distance === 0 : kind === 'N' && distance <= 1;
}

function* pseudoBoardMoves(position: Position): Generator<Move> {
  for (let from = 0; from < 81; from++) {
    const piece = position.board[from];
    if (!piece || piece.side !== position.turn) continue;
    for (const to of destinations(position, from)) {
      const target = position.board[to];
      if (target?.kind === 'K') continue;
      // Optional per-side restriction used by asymmetric-rule experiments.
      if (target?.side === piece.side && position.rules.selfCapture &&
        position.rules.selfCapture !== 'both' && position.rules.selfCapture !== piece.side) continue;
      if (piece.kind === 'K' && target && (position.rules.kingCapture === 'none' ||
        (target.side === piece.side && position.rules.kingCapture !== 'all'))) continue;
      const canPromote = !piece.promoted && piece.kind !== 'K' && piece.kind !== 'G' &&
        (inCamp(from, piece.side) || inCamp(to, piece.side));
      if (canPromote) yield { from, to, promote: true };
      if (piece.promoted || !deadRank(piece.kind, to, piece.side)) yield { from, to, promote: false };
    }
  }
}

/** Applies a generated move; callers exposed to user input must use play(). */
export function applyUnchecked(position: Position, move: Move): Position {
  const board = position.board.slice();
  const hands = { sente: { ...position.hands.sente }, gote: { ...position.hands.gote } };
  if ('drop' in move) {
    hands[position.turn][move.drop]--;
    board[move.to] = { kind: move.drop, side: position.turn, promoted: false };
  } else {
    const piece = board[move.from]!;
    const target = board[move.to];
    if (target && target.kind !== 'K') hands[position.turn][target.kind]++;
    board[move.to] = { ...piece, promoted: piece.promoted || move.promote };
    board[move.from] = null;
  }
  return { board, hands, turn: opposite(position.turn), rules: position.rules };
}

function hasBoardEscape(position: Position): boolean {
  for (const move of pseudoBoardMoves(position)) if (!isInCheck(applyUnchecked(position, move), position.turn)) return true;
  return false;
}

export function* legalMoveIterator(position: Position): Generator<Move> {
  for (const move of pseudoBoardMoves(position)) {
    if (!isInCheck(applyUnchecked(position, move), position.turn)) yield move;
  }
  for (const kind of HAND_KINDS) {
    if (position.hands[position.turn][kind] <= 0) continue;
    for (let to = 0; to < 81; to++) {
      if (position.board[to] || deadRank(kind, to, position.turn)) continue;
      if (kind === 'P' && position.board.some((p, i) => p?.side === position.turn && p.kind === 'P' && !p.promoted && col(i) === col(to))) continue;
      const move: Move = { drop: kind, to };
      const next = applyUnchecked(position, move);
      if (isInCheck(next, position.turn)) continue;
      // A directly checking dropped pawn cannot be blocked by a drop. Test every board
      // escape, including variant self-captures, without recursively generating drops.
      const pawnAttack = to + (position.turn === 'sente' ? -9 : 9);
      if (kind === 'P' && next.board[pawnAttack]?.kind === 'K' &&
        next.board[pawnAttack]?.side === next.turn && !hasBoardEscape(next)) continue;
      yield move;
    }
  }
}

export const legalMoves = (position: Position): Move[] => [...legalMoveIterator(position)];
export const sameMove = (a: Move, b: Move) => a.to === b.to && ('drop' in a
  ? 'drop' in b && a.drop === b.drop
  : 'from' in b && a.from === b.from && a.promote === b.promote);

export function positionKey(p: Position): string {
  const recoveryRule = p.rules.selfCapture && p.rules.selfCapture !== 'both' ? `:${p.rules.selfCapture}` : '';
  return `${p.turn}|${p.rules.kingCapture}${recoveryRule}|${p.board.map(v => v ? `${v.side[0]}${v.kind}${v.promoted ? '+' : ''}` : '.').join(',')}|` +
    (['sente', 'gote'] as const).map(side => HAND_KINDS.map(k => p.hands[side][k]).join(',')).join('|');
}

export function createGame(rules: Rules = DEFAULT_RULES, position = initialPosition(rules)): Game {
  return { position, log: [], trail: [{ position, key: positionKey(position), mover: null, check: false }], result: null };
}

export function moveLabel(position: Position, move: Move): string {
  const prefix = position.turn === 'sente' ? '▲' : '△';
  if ('drop' in move) return `${prefix}${squareLabel(move.to)}${LABELS[move.drop]}打`;
  const piece = position.board[move.from]!;
  const target = position.board[move.to];
  return `${prefix}${squareLabel(move.to)}${pieceLabel(piece)}${move.promote ? '成' : ''} (${squareLabel(move.from)})${target?.side === piece.side ? ' 回収' : ''}`;
}

export function play(game: Game, move: Move): Game {
  if (game.result) throw new Error('この対局は終了しています。');
  if (!legalMoves(game.position).some(m => sameMove(m, move))) throw new Error('その手は指せません。');
  const position = applyUnchecked(game.position, move);
  const check = isInCheck(position, position.turn);
  const key = positionKey(position);
  const trail = [...game.trail, { position, key, mover: game.position.turn, check }];
  const log = [...game.log, {
    move, side: game.position.turn, label: moveLabel(game.position, move),
    selfCapture: 'from' in move && game.position.board[move.to]?.side === game.position.turn,
  }];
  let result: Result | null = null;
  const repeated = trail.map((t, i) => t.key === key ? i : -1).filter(i => i >= 0);
  if (repeated.length >= 4) {
    const interval = trail.slice(repeated[repeated.length - 4]! + 1);
    const perpetual = (['sente', 'gote'] as const).find(side => {
      const turns = interval.filter(t => t.mover === side);
      return turns.length > 0 && turns.every(t => t.check);
    });
    result = perpetual ? { winner: opposite(perpetual), reason: 'perpetual-check' } : { winner: null, reason: 'repetition' };
  } else if (legalMoveIterator(position).next().done) {
    result = { winner: opposite(position.turn), reason: check ? 'mate' : 'no-moves' };
  }
  if(!result&&position.rules.moveLimit!==undefined&&log.length>position.rules.moveLimit)result={winner:null,reason:'move-limit'};
  return { position, trail, log, result };
}

/** Apply a limit after replaying all saved moves, preserving historical finished games. */
export function withMoveLimit(game:Game,moveLimit:number):Game{
  if(!validMoveLimit(moveLimit))throw new Error('手数上限が不正です。');
  const rules={...game.position.rules,moveLimit};
  const trail=game.trail.map(t=>({...t,position:{...t.position,rules}}));
  const result=game.result??(game.log.length>moveLimit?{winner:null,reason:'move-limit' as const}:null);
  return {...game,position:trail[trail.length-1]!.position,trail,result};
}

export function undo(game: Game, plies = 1): Game {
  const count = Math.min(Math.max(1, plies), game.log.length);
  if (!count) return game;
  const trail = game.trail.slice(0, -count);
  const log=game.log.slice(0,-count),position=trail[trail.length-1]!.position;
  return {position,trail,log,result:position.rules.moveLimit!==undefined&&log.length>position.rules.moveLimit?{winner:null,reason:'move-limit'}:null};
}

export function resign(game: Game, side = game.position.turn): Game {
  return game.result ? game : { ...game, result: { winner: opposite(side), reason: 'resign' } };
}
