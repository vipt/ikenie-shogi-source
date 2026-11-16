import { HAND_KINDS, isInCheck, opposite, type Game, type HandKind, type Move, type Position } from './engine';

export const STANDARD_RULES = { kingCapture: 'enemy', selfCapture: 'none' } as const;

export const RECOVERY_RULES = { kingCapture: 'enemy', selfCapture: 'both' } as const;
export type UsiRuleMode = 'standard' | 'recovery' | 'asymmetric-sente' | 'asymmetric-gote' | 'mobile-king-all';

export function assertEngineRules(p: Position, mode: UsiRuleMode): void {
  if (mode === 'mobile-king-all') {
    if(p.rules.kingCapture!=='all'||!['both','none','sente','gote'].includes(p.rules.selfCapture??'both'))throw new Error('Mobile king rule mismatch');
    return;
  }
  if (mode === 'standard') return assertStandardRules(p);
  if (mode.startsWith('asymmetric-')) {
    const side=mode==='asymmetric-sente'?'sente':'gote';
    if(p.rules.kingCapture!=='enemy'||p.rules.selfCapture!==side)throw new Error('Asymmetric rule mismatch: '+mode);
    return;
  }
  if (p.rules.kingCapture !== 'enemy' || (p.rules.selfCapture !== undefined && p.rules.selfCapture !== 'both')) {
    throw new Error('Recovery engine requires both sides to recover and kingCapture=enemy.');
  }
}

export function assertStandardRules(p: Position): void {
  if (p.rules.selfCapture !== 'none' || p.rules.kingCapture !== 'enemy') {
    throw new Error('This engine supports standard shogi only (selfCapture=none, kingCapture=enemy).');
  }
}

export function toSfen(p: Position, ply = 1, mode: UsiRuleMode = 'standard'): string {
  assertEngineRules(p, mode);
  if (p.board.length !== 81 || !Number.isSafeInteger(ply) || ply < 1) throw new Error('Invalid SFEN position');
  const ranks: string[] = [];
  for (let r = 0; r < 9; r++) {
    let rank = '', empty = 0;
    for (let c = 0; c < 9; c++) {
      const piece = p.board[r * 9 + c];
      if (!piece) { empty++; continue; }
      if (empty) { rank += empty; empty = 0; }
      rank += (piece.promoted ? '+' : '') + (piece.side === 'sente' ? piece.kind : piece.kind.toLowerCase());
    }
    if (empty) rank += empty;
    ranks.push(rank);
  }
  let hand = '';
  for (const side of ['sente', 'gote'] as const) for (const kind of HAND_KINDS) {
    const count = p.hands[side][kind];
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid hand');
    if (count) hand += (count > 1 ? count : '') + (side === 'sente' ? kind : kind.toLowerCase());
  }
  return ranks.join('/') + ' ' + (p.turn === 'sente' ? 'b' : 'w') + ' ' + (hand || '-') + ' ' + ply;
}

function square(s: string): number {
  if (!/^[1-9][a-i]$/.test(s)) throw new Error('Invalid USI square: ' + s);
  return (s.charCodeAt(1) - 97) * 9 + 9 - Number(s[0]);
}
function squareText(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 80) throw new Error('Invalid square index');
  return String(9 - n % 9) + String.fromCharCode(97 + Math.floor(n / 9));
}
export function moveToUsi(m: Move): string {
  return ('drop' in m ? m.drop + '*' : squareText(m.from)) + squareText(m.to) +
    ('promote' in m && m.promote ? '+' : '');
}
export function moveFromUsi(s: string): Move {
  if (/^[PLNSGBR]\*[1-9][a-i]$/.test(s)) return { drop: s[0] as HandKind, to: square(s.slice(2)) };
  if (/^[1-9][a-i][1-9][a-i]\+?$/.test(s)) return {
    from: square(s.slice(0, 2)), to: square(s.slice(2, 4)), promote: s.endsWith('+'),
  };
  throw new Error('Invalid USI move: ' + s);
}

/** Include full history so the engine can detect repetition and perpetual check. */
export function gameToUsiPosition(game: Game, mode: UsiRuleMode = 'standard'): string {
  assertEngineRules(game.position, mode);
  const initial = game.trail[0]?.position;
  if (!initial || game.trail.length !== game.log.length + 1) throw new Error('Missing game history');
  for (const entry of game.trail) {
    const p = entry.position;
    assertEngineRules(p, mode);
    for (const side of ['sente', 'gote'] as const) {
      if (p.board.filter(piece => piece?.kind === 'K' && piece.side === side && !piece.promoted).length !== 1) {
        throw new Error('USI position must have one king per side');
      }
    }
    // The player who just moved cannot have left their king in check.
    // Invalid composed positions can crash native engines; reject before sending.
    if (isInCheck(p, opposite(p.turn))) throw new Error('Invalid USI position: previous side is in check');
  }
  return 'position sfen ' + toSfen(initial, 1, mode) +
    (game.log.length ? ' moves ' + game.log.map(entry => moveToUsi(entry.move)).join(' ') : '');
}



/** Strict SFEN reader for generated training/audit files. */
export function fromSfen(text: string, mode: UsiRuleMode = 'standard'): Position {
  const parts=text.trim().split(/\s+/);
  if(parts.length!==4 || !/^[bw]$/.test(parts[1]!) || !/^[1-9]\d*$/.test(parts[3]!))throw new Error('Invalid SFEN');
  const board:Position['board']=[];
  const ranks=parts[0]!.split('/');
  if(ranks.length!==9)throw new Error('Invalid SFEN ranks');
  for(const rank of ranks){
    let count=0,promoted=false;
    for(const c of rank){
      if(c==='+'){if(promoted)throw new Error('Invalid promotion');promoted=true;continue;}
      if(/[1-9]/.test(c)){if(promoted)throw new Error('Invalid promotion');for(let i=0;i<Number(c);i++)board.push(null);count+=Number(c);continue;}
      if(!/[plnsgbrkPLNSGBRK]/.test(c)||promoted&&/[gkGK]/.test(c))throw new Error('Invalid piece');
      board.push({kind:c.toUpperCase() as import('./engine').Kind,side:c===c.toUpperCase()?'sente':'gote',promoted});
      count++;promoted=false;
    }
    if(count!==9||promoted)throw new Error('Invalid SFEN rank width');
  }
  const empty=()=>({P:0,L:0,N:0,S:0,G:0,B:0,R:0});
  const hands={sente:empty(),gote:empty()};
  if(parts[2]!=='-'){
    const matches=[...parts[2]!.matchAll(/([1-9]\d*)?([PLNSGBRplnsgbr])/g)];
    if(matches.map(m=>m[0]).join('')!==parts[2])throw new Error('Invalid SFEN hand');
    for(const m of matches){
      const c=m[2]!,side=c===c.toUpperCase()?'sente':'gote',kind=c.toUpperCase() as HandKind,n=Number(m[1]??1);
      if(n>18||hands[side][kind])throw new Error('Invalid SFEN count');
      hands[side][kind]=n;
    }
  }
  return {board,hands,turn:parts[1]==='b'?'sente':'gote',rules:mode==='mobile-king-all'?{kingCapture:'all',selfCapture:'both'}:mode==='standard'?STANDARD_RULES:mode==='recovery'?RECOVERY_RULES:{kingCapture:'enemy',selfCapture:mode==='asymmetric-sente'?'sente':'gote'}};
}

