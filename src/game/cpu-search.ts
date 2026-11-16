/** Independent variant-aware search. See docs/ENGINE_REFERENCES.md. */
import { applyUnchecked, attackedSquares, isInCheck, legalMoveIterator, legalMoves, opposite, positionKey, sameMove, type HandKind, type Kind, type Move, type Position, type Side } from './engine';
import { chooseCpuMove as legacy } from './cpu-legacy';

export type Difficulty = 'easy' | 'normal' | 'strong';
export const DIFFICULTY_LABELS = { easy: '入門', normal: '標準', strong: '強め' };
export const LIMITS = {
  normal: { maxDepth: 5, maxNodes: 8000, timeMs: 700 },
  strong: { maxDepth: 7, maxNodes: 32000, timeMs: 2400 },
};
type PastPosition = { key: string; mover: Side | null; check: boolean };
export type CpuOptions = {
  difficulty?: Difficulty; maxDepth?: number; maxNodes?: number; timeMs?: number;
  random?: () => number; noise?: number; beamWidth?: number; variety?:number;
  onUpdate?: (result:SearchResult)=>void;
  history?: readonly PastPosition[]; shouldStop?: () => boolean;
};
export type SearchResult = { move: Move | null; score: number; depth: number; nodes: number; elapsedMs: number; stopped: boolean; bestScore?:number; alternatives?:{move:Move;score:number}[] };
const VALUE: Record<Kind, number> = { P: 100, L: 280, N: 300, S: 420, G: 500, B: 760, R: 920, K: 0 };
const MATE = 100000, INF = 1000000;
const STOP = Symbol('search stopped');
const now = () => globalThis.performance?.now() ?? Date.now();
const worth = (kind: Kind, promoted: boolean) => promoted ? kind === 'B' ? 960 : kind === 'R' ? 1120 : 500 : VALUE[kind];
const distance = (a: number, b: number) => Math.max(Math.abs(Math.floor(a / 9) - Math.floor(b / 9)), Math.abs(a % 9 - b % 9));

export function evaluatePosition(p: Position): number {
  const controls = { sente: new Int16Array(81), gote: new Int16Array(81) };
  const cheapest = { sente: new Int16Array(81).fill(30000), gote: new Int16Array(81).fill(30000) };
  const kings = { sente: -1, gote: -1 }, scores = { sente: 0, gote: 0 };
  let totalMaterial = 0;
  for (let i = 0; i < 81; i++) {
    const piece = p.board[i];
    if (!piece) continue;
    if (piece.kind === 'K') kings[piece.side] = i;
    const value = worth(piece.kind, piece.promoted);
    totalMaterial += value;
    const forward = piece.side === 'sente' ? 8 - Math.floor(i / 9) : Math.floor(i / 9);
    scores[piece.side] += value;
    if (piece.kind !== 'K') scores[piece.side] += (piece.kind === 'P' ? 4 : 2) * forward + (4 - Math.abs(i % 9 - 4)) * 2;
    if (piece.kind === 'K' && p.rules.kingCapture === 'none') continue;
    const attacks = attackedSquares(p, i);
    for (const square of attacks) {
      controls[piece.side][square]!++;
      cheapest[piece.side][square] = Math.min(cheapest[piece.side][square]!, piece.kind === 'K' ? 20000 : value);
    }
    if (piece.kind === 'R' || piece.kind === 'B' || piece.kind === 'L') scores[piece.side] += attacks.filter(s => !p.board[s] || p.board[s]!.side !== piece.side).length * 3;
  }
  for (const side of ['sente', 'gote'] as const) {
    for (const kind of Object.keys(p.hands[side]) as HandKind[]) {
      totalMaterial += p.hands[side][kind] * VALUE[kind];
      scores[side] += p.hands[side][kind] * (VALUE[kind] + (kind === 'P' ? 8 : 10));
    }
    const king = kings[side];
    if (king < 0) return p.turn === side ? -MATE : MATE;
    const enemy = opposite(side);
    for (let i = 0; i < 81; i++) {
      const piece = p.board[i];
      if (piece?.side === side && piece.kind !== 'K') {
        const value = worth(piece.kind, piece.promoted);
        if (controls[enemy][i]! > 0) {
          if (!controls[side][i]) scores[side] -= value * 0.4;
          else scores[side] -= Math.max(0, value - cheapest[enemy][i]!) * 0.12;
        }
        const d = distance(i, king);
        if ((piece.kind === 'G' || piece.kind === 'S' || piece.promoted) && d <= 2) scores[side] += d === 1 ? 22 : 9;
      }
      if (distance(i, king) <= 1) {
        scores[side] -= Math.min(3, controls[enemy][i]!) * (i === king ? 35 : 12);
        if (!p.board[i] && controls[enemy][i] === 0) scores[side] += 4;
      }
    }
  }
  if (totalMaterial > 5000) for (const side of ['sente', 'gote'] as const) {
    const advance = side === 'sente' ? 8 - Math.floor(kings[side] / 9) : Math.floor(kings[side] / 9);
    scores[side] -= advance * advance * 5;
  }
  return Math.round(scores[p.turn] - scores[opposite(p.turn)]) + 6;
}

function moveId(move: Move, side: Side): number {
  const square = (n: number) => side === 'sente' ? n : 80 - n;
  return 'from' in move ? (square(move.from) * 81 + square(move.to)) * 2 + (move.promote ? 0 : 1)
    : 14000 + 'RBGSNLP'.indexOf(move.drop) * 81 + square(move.to);
}
const tactical = (p: Position, m: Move) => 'from' in m && (m.promote || (!!p.board[m.to] && p.board[m.to]!.side !== p.turn));
type Entry = { moves?: Move[]; hasMoves?: boolean; evaluation?: number; best?: Move };
type Context = {
  nodes: number; basePly:number; maxNodes: number; deadline: number; cancelled: () => boolean;
  cache: Map<string, Entry>; killers: Map<number, Move[]>; historyScores: Map<number, number>; path: PastPosition[];
};
function positionEntry(p: Position, ctx: Context, key: string): Entry {
  let entry = ctx.cache.get(key);
  if (!entry) { entry = {}; if (ctx.cache.size < 12000) ctx.cache.set(key, entry); }
  return entry;
}
function order(p: Position, moves: Move[], preferred: Move | undefined, ctx: Context, ply: number): Move[] {
  const enemyKing = p.board.findIndex(v => v?.kind === 'K' && v.side !== p.turn);
  return moves.map(move => {
    let priority = preferred && sameMove(move, preferred) ? 1000000 : 0;
    const id = moveId(move, p.turn);
    priority += Math.min(ctx.historyScores.get(id) ?? 0, 500);
    if ('from' in move) {
      const target = p.board[move.to], piece = p.board[move.from]!;
      if (target && target.side !== p.turn) priority += 20000 + 12 * worth(target.kind, target.promoted) - worth(piece.kind, piece.promoted);
      else if (target) priority -= 100 + (target.promoted ? 300 : 0);
      if (move.promote) priority += 3000 + worth(piece.kind, true) - VALUE[piece.kind];
      if (!target && !move.promote && ctx.killers.get(ply)?.some(m => sameMove(m, move))) priority += 2000;
    } else {
      priority += Math.max(0, 5 - distance(move.to, enemyKing)) * 12;
      if (ctx.killers.get(ply)?.some(m => sameMove(m, move))) priority += 2000;
    }
    return { move, priority, id };
  }).sort((a, b) => b.priority - a.priority || a.id - b.id).map(v => v.move);
}
function repetition(ctx: Context, key: string, turn: Side, ply: number): number | null {
  let count = 0, start = -1;
  for (let i = ctx.path.length - 1; i >= 0; i--) if (ctx.path[i]!.key === key && ++count === 4) { start = i; break; }
  if (start < 0) return null;
  for (const side of ['sente', 'gote'] as const) {
    let any = false, continuous = true;
    for (let i = start + 1; i < ctx.path.length; i++) if (ctx.path[i]!.mover === side) { any = true; if (!ctx.path[i]!.check) continuous = false; }
    if (any && continuous) return side === turn ? -MATE + ply : MATE - ply;
  }
  return 0;
}
function* node(p: Position, depth: number, alpha: number, beta: number, ply: number, qleft: number, ctx: Context): Generator<void, number> {
  if (++ctx.nodes > ctx.maxNodes || ctx.cancelled() || ((ctx.nodes & 15) === 0 && now() >= ctx.deadline)) throw STOP;
  if ((ctx.nodes & 31) === 0) yield;
  const key = positionKey(p), repeated = repetition(ctx, key, p.turn, ply);
  if (repeated !== null) return repeated;
  const entry = positionEntry(p, ctx, key);
  const check = isInCheck(p, p.turn), staticScore = () => entry.evaluation ??= evaluatePosition(p);
  const hasMoves = () => entry.hasMoves ??= entry.moves ? entry.moves.length > 0 : !legalMoveIterator(p).next().done;
  if(p.rules.moveLimit!==undefined&&ctx.basePly+ply>p.rules.moveLimit)return hasMoves()?0:-MATE+ply;
  if (ply >= 24) return hasMoves() ? staticScore() : -MATE + ply;
  let best = -INF;
  if (depth <= 0 && !check) {
    best = staticScore();
    if (qleft <= 0 || best >= beta) return hasMoves() ? best : -MATE + ply;
    alpha = Math.max(alpha, best);
  }
  let moves = entry.moves ??= legalMoves(p);
  if (!moves.length) return -MATE + ply;
  if (depth <= 0 && !check) {
    // Friendly recovery is a quiet rearrangement, not an enemy capture.
    moves = moves.filter(m => tactical(p, m));
  }
  let bestMove: Move | undefined;
  for (const move of order(p, moves, entry.best, ctx, ply)) {
    const next = applyUnchecked(p, move);
    ctx.path.push({ key: positionKey(next), mover: p.turn, check: isInCheck(next, next.turn) });
    let score: number;
    try { score = -(yield* node(next, depth - 1, -beta, -alpha, ply + 1, depth <= 0 ? qleft - 1 : qleft, ctx)); }
    finally { ctx.path.pop(); }
    if (score > best) { best = score; bestMove = move; }
    alpha = Math.max(alpha, score);
    if (alpha >= beta) {
      if (!tactical(p, move)) {
        ctx.killers.set(ply, [move, ...(ctx.killers.get(ply) ?? []).filter(m => !sameMove(m, move))].slice(0, 2));
        const id = moveId(move, p.turn);
        ctx.historyScores.set(id, (ctx.historyScores.get(id) ?? 0) + Math.max(1, depth * depth));
      }
      break;
    }
  }
  if (bestMove) entry.best = bestMove;
  return best;
}
/** Only moves/evaluations are cached: score cutoffs depend on repetition history. */
function* iterations(p: Position, options: CpuOptions, result: SearchResult, ctx: Context): Generator<void, void> {
  const root = positionEntry(p, ctx, positionKey(p));
  const rootMoves = root.moves ??= legalMoves(p);
  if (!rootMoves.length) { result.score = -MATE; return; }
  const limits = LIMITS[options.difficulty === 'normal' ? 'normal' : 'strong'];
  let moves = order(p, rootMoves, undefined, ctx, 0);
  if (options.noise) {
    const random = options.random ?? Math.random;
    // Randomize search order, never substitute an inferior final score.
    moves = moves.map(move => ({ move, n: random() })).sort((a, b) => a.n - b.n).map(v => v.move);
  }
  result.move = moves[0]!;
  const variety=Math.max(0,Math.min(50,options.variety??0));
  for (let depth = 1; depth <= (options.maxDepth ?? limits.maxDepth); depth++) {
    let alpha = -INF, best: Move | null = null;
    const scores = new Map<Move, number>();
    for (const move of moves) {
      const next = applyUnchecked(p, move);
      ctx.path.push({ key: positionKey(next), mover: p.turn, check: isInCheck(next, next.turn) });
      let score: number;
      // Widen the root window so every move within the allowed margin has an exact score.
      // The extra point excludes fail-low bounds from the eligible set.
      const floor=variety?Math.max(-INF,alpha-variety-1):alpha;
      try { score = -(yield* node(next, depth - 1, -INF, -floor, 1, 4, ctx)); }
      finally { ctx.path.pop(); }
      scores.set(move, score);
      if (score > alpha) { alpha = score; best = move; }
    }
    // A stopped iteration must not bias the answer toward early moves.
    result.move = best; result.score = alpha; result.depth = depth;
    if(variety){
      const margin=Math.abs(alpha)>=MATE-24?0:variety;
      const alternatives=moves.filter(move=>scores.get(move)!>=alpha-margin).map(move=>({move,score:scores.get(move)!})).sort((a,b)=>b.score-a.score);
      // A proven mating line keeps the strongest result, including mate distance.
      const chosen=margin===0?{move:best!,score:alpha}:alternatives[Math.min(alternatives.length-1,Math.floor(Math.max(0,(options.random??Math.random)())*alternatives.length))]!;
      result.move=chosen.move;result.score=chosen.score;result.bestScore=alpha;result.alternatives=alternatives;
    }
    options.onUpdate?.({...result,nodes:ctx.nodes});
    moves.sort((a, b) => (scores.get(b) ?? -INF) - (scores.get(a) ?? -INF));
    yield;
    if (Math.abs(alpha) >= MATE - 24) break;
  }
}
function session(p: Position, options: CpuOptions) {
  const start = now(), limits = LIMITS[options.difficulty === 'normal' ? 'normal' : 'strong'];
  const result: SearchResult = { move: null, score: 0, depth: 0, nodes: 0, elapsedMs: 0, stopped: false };
  const path = [...(options.history ?? [])], key = positionKey(p);
  if (path[path.length - 1]?.key !== key) path.push({ key, mover: null, check: isInCheck(p, p.turn) });
  const ctx: Context = { nodes: 0, basePly:Math.max(0,(options.history?.length??1)-1), maxNodes: options.maxNodes ?? limits.maxNodes, deadline: start + (options.timeMs ?? limits.timeMs), cancelled: options.shouldStop ?? (() => false), cache: new Map(), killers: new Map(), historyScores: new Map(), path };
  const generator = iterations(p, options, result, ctx);
  const step = () => { try { return generator.next().done; } catch (error) { if (error !== STOP) throw error; result.stopped = true; return true; } };
  const finish = () => ({ ...result, nodes: ctx.nodes, elapsedMs: now() - start });
  return { step, finish };
}
export function analyzePosition(p: Position, options: CpuOptions = {}): SearchResult {
  if (options.difficulty === 'easy') return { move: legacy(p, options), depth: 2, nodes: 0, score: 0, elapsedMs: 0, stopped: false };
  const search = session(p, options);
  while (!search.step()) { /* Synchronous driver for reproducible tests/benchmarks. */ }
  return search.finish();
}
export function chooseCpuMove(p: Position, options: CpuOptions = {}): Move | null { return analyzePosition(p, options).move; }
export async function analyzePositionAsync(p:Position,options:CpuOptions={}):Promise<SearchResult|null>{
  if(options.shouldStop?.())return null;
  if(options.difficulty==='easy')return {move:legacy(p,options),score:evaluatePosition(p),depth:0,nodes:0,elapsedMs:0,stopped:false};
  const search=session(p,options);let slice=now();
  while(!search.step()){
    if(now()-slice>=8){await new Promise<void>(resolve=>setTimeout(resolve,0));slice=now();}
  }
  return options.shouldStop?.()?null:search.finish();
}
export async function chooseCpuMoveAsync(p:Position,options:CpuOptions={}):Promise<Move|null>{
  return (await analyzePositionAsync(p,options))?.move??null;
}
