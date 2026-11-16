import { applyUnchecked, isInCheck, legalMoves, opposite, type Move, type Position, type Side } from './engine';

const values = { P: 100, L: 270, N: 290, S: 400, G: 480, B: 700, R: 850, K: 0 };
function evaluate(position: Position, side: Side): number {
  let score = 0;
  for (let i = 0; i < 81; i++) {
    const p = position.board[i];
    if (!p) continue;
    const rank = Math.floor(i / 9);
    const advance = p.side === 'sente' ? 8 - rank : rank;
    const promotion = p.promoted ? (['R', 'B'].includes(p.kind) ? 180 : 280) : 0;
    const activity = p.kind === 'K' ? 0 : advance * 3 + (4 - Math.abs(i % 9 - 4)) * 2;
    score += (p.side === side ? 1 : -1) * (values[p.kind] + promotion + activity);
  }
  for (const owner of ['sente', 'gote'] as const) {
    for (const [kind, count] of Object.entries(position.hands[owner])) {
      // Pieces in hand are flexible, but should not encourage endless self-captures.
      score += (owner === side ? 1 : -1) * count * values[kind as keyof typeof values] * 0.96;
    }
  }
  if (isInCheck(position, opposite(side))) score += 22;
  if (isInCheck(position, side)) score -= 22;
  return score;
}

export type CpuOptions = { random?: () => number; noise?: number; beamWidth?: number };

function canonicalOrder(move: Move, side: Side): number {
  const square = (n: number) => side === 'sente' ? n : 80 - n;
  return 'from' in move ? (square(move.from) * 81 + square(move.to)) * 2 + (move.promote ? 0 : 1)
    : 14000 + 'RBGSNLP'.indexOf(move.drop) * 81 + square(move.to);
}

/** Small 2-ply beam search. Seedable tie-breaking makes self-play reproducible. */
export function chooseCpuMove(position: Position, options: CpuOptions = {}): Move | null {
  const side = position.turn;
  const random = options.random ?? Math.random;
  const noise = options.noise ?? 6;
  const candidates = legalMoves(position).map(move => {
    const next = applyUnchecked(position, move);
    const selfCapture = 'from' in move && position.board[move.to]?.side === side;
    return { move, next, score: evaluate(next, side) - (selfCapture ? 8 : 0), index: canonicalOrder(move, side) };
  }).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, options.beamWidth ?? 14);
  let best: Move | null = null, bestScore = -Infinity;
  for (const candidate of candidates) {
    const replies = legalMoves(candidate.next);
    if (!replies.length) return candidate.move;
    let worst = Infinity;
    for (const reply of replies) worst = Math.min(worst, evaluate(applyUnchecked(candidate.next, reply), side));
    const score = worst * 0.88 + candidate.score * 0.12 + (random() - 0.5) * noise;
    if (score > bestScore) { bestScore = score; best = candidate.move; }
  }
  return best;
}
