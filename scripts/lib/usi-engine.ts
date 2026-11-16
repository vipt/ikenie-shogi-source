import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname } from 'node:path';
import { legalMoves, sameMove, type Game, type Move } from '../../src/game/engine';
import { gameToUsiPosition, moveFromUsi, type UsiRuleMode } from './usi-format';

export type UsiConfig = {
  ruleMode?: UsiRuleMode;
  executable: string; args?: string[]; cwd?: string;
  options: Record<string, string | number | boolean>;
  startupTimeoutMs?: number; searchGraceMs?: number; requireKingRecoveryProbe?: boolean;
};
export type UsiAnalysis = {
  variations: { rank: number; move: string; score: { type: 'cp' | 'mate'; value: number; bound?: string }; depth: number; pv: string[] }[];
  bestmove: string; move: Move | null; resigned: boolean;
  depth: number; nodes: number; elapsedMs: number;
  score: { type: 'cp' | 'mate'; value: number; bound?: string } | null; pv: string[];
};
export type RecoveryProbe = {
  rule: string; recoveryMask?: number; sfen: string; eval: number; inCheck: boolean; valid: boolean; repetition: string;
  children: { move: string; sfen: string; recovery: boolean; valid: boolean }[];
};
type Waiter = {
  accept: (line: string) => boolean; lines: string[];
  resolve: (lines: string[]) => void; reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/** Node-only USI adapter. Never import into the Expo/mobile bundle. One search at a time. */
export class UsiEngine {
  private child: ChildProcessWithoutNullStreams;
  private waiter?: Waiter;
  private failure?: Error;
  private closing = false;
  private busy = false;
  private exited: Promise<void>;
  readonly transcript: string[] = [];
  name = '';

  private constructor(private config: UsiConfig) {
    this.child = spawn(config.executable, config.args ?? [], {
      cwd: config.cwd ?? dirname(config.executable), windowsHide: true, stdio: 'pipe',
    });
    const output = createInterface({ input: this.child.stdout });
    output.on('line', raw => {
      const line = raw.trim();
      this.record('< ' + line);
      const w = this.waiter;
      if (w) {
        // Retain a bounded amount of diagnostic output.
        if (w.lines.length >= 2000) w.lines.shift();
        w.lines.push(line);
        if (w.accept(line)) {
          clearTimeout(w.timer); this.waiter = undefined; w.resolve(w.lines);
        }
      }
    });
    this.child.stderr.on('data', chunk => this.record('stderr ' + String(chunk).slice(-2000)));
    this.child.stdin.on('error', error => this.fail(error));
    this.child.on('error', error => this.fail(error));
    this.exited = new Promise(resolve => {
      this.child.on('close', (code, signal) => {
        output.close();
        if (!this.closing) this.fail(new Error('USI engine exited: ' + code + ' / ' + signal));
        resolve();
      });
    });
  }

  private record(line: string) {
    this.transcript.push((line.startsWith('< meguru_probe ') || line.startsWith('< meguru_features ')) ? line.slice(0, 250) + ' [probe details omitted]' : line);
    if (this.transcript.length > 3000) this.transcript.shift();
  }
  private fail(error: Error) {
    this.failure ??= error;
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      const w = this.waiter; this.waiter = undefined; w.reject(error);
    }
  }
  private send(command: string) {
    if (/[\r\n]/.test(command)) throw new Error('USI commands must be one line');
    if (this.failure) throw this.failure;
    if (this.closing) throw new Error('USI engine is closed');
    this.record('> ' + command);
    this.child.stdin.write(command + '\n');
  }
  private request(command: string, accept: (line: string) => boolean, timeoutMs: number): Promise<string[]> {
    if (this.waiter) return Promise.reject(new Error('USI request already in progress'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error('USI timeout: ' + command));
        // Do not reuse a desynchronized or hung engine.
        this.child.kill();
      }, timeoutMs);
      this.waiter = { accept, lines: [], resolve, reject, timer };
      try { this.send(command); } catch (error) { this.fail(error as Error); }
    });
  }
  static async start(config: UsiConfig): Promise<UsiEngine> {
    if(config.ruleMode==='mobile-king-all'&&!config.requireKingRecoveryProbe)throw new Error('King recovery requires the mobile native engine; legacy USI binaries do not support it');
    const engine = new UsiEngine(config);
    try {
      const lines = await engine.request('usi', s => s === 'usiok', config.startupTimeoutMs ?? 30000);
      engine.name = lines.find(s => s.startsWith('id name '))?.slice(8) ?? 'Unknown USI engine';
      if (config.ruleMode === 'recovery' && !engine.name.includes('MeguruShogi-Recovery-1')) {
        throw new Error('Recovery rules require the patched Meguru engine');
      }
      if(config.ruleMode?.startsWith('asymmetric-')&&!engine.name.includes('MeguruShogi-Asymmetric-1'))throw new Error('Asymmetric rules require the asymmetric Meguru engine');
      const advertised = new Set(lines.flatMap(s => {
        const match = /^option name (.+) type /.exec(s); return match ? [match[1]!] : [];
      }));
      for (const [name, value] of Object.entries(config.options)) {
        if (!advertised.has(name)) throw new Error('Required USI option unavailable: ' + name);
        engine.send('setoption name ' + name + ' value ' + value);
      }
      await engine.request('isready', s => s === 'readyok', config.startupTimeoutMs ?? 30000);
      if(config.ruleMode?.startsWith('asymmetric-')) {
        const side=config.ruleMode==='asymmetric-sente'?'sente':'gote';
        await engine.request('meguru_rules '+side,s=>s==='meguru_rules '+side,config.startupTimeoutMs??30000);
      }
      if(config.ruleMode==='mobile-king-all') {
        engine.send('position startpos');
        const lines=await engine.request('meguru_probe',s=>s.startsWith('meguru_probe '),30000);
        const probe=JSON.parse(lines.at(-1)!.slice(13));
        if(!probe.valid||probe.kingRecovery!==true||probe.recoveryMask!==3)throw new Error('King-recovery research rule mismatch');
      }
      engine.newGame();
      return engine;
    } catch (error) { await engine.close(); throw error; }
  }
  setOwnBook(enabled: boolean): void {
    if (this.busy) throw new Error('Cannot change book while searching');
    this.send('setoption name USI_OwnBook value ' + enabled);
  }
  newGame(): void {
    if (this.busy) throw new Error('Cannot start a game while searching');
    this.send('usinewgame');
  }
  async analyze(game: Game, movetimeMs = 500): Promise<UsiAnalysis> {
    if (this.busy) throw new Error('USI search already in progress');
    if (!Number.isSafeInteger(movetimeMs) || movetimeMs < 1 || movetimeMs > 60000) throw new Error('Invalid movetime');
    if (game.result) throw new Error('Game already finished');
    const positionCommand = gameToUsiPosition(game, this.config.ruleMode);
    this.busy = true;
    const start = performance.now();
    try {
      this.send(positionCommand);
      const lines = await this.request('go movetime ' + movetimeMs, s => s.startsWith('bestmove '),
        movetimeMs + (this.config.searchGraceMs ?? 5000));
      const bestmove = lines.at(-1)!.split(/\s+/)[1]!;
      if (bestmove === 'win') throw new Error('Entering-king declaration is not supported by this adapter');
      const move = bestmove === 'resign' ? null : moveFromUsi(bestmove);
      if (move && !legalMoves(game.position).some(m => sameMove(m, move))) {
        throw new Error('Engine returned illegal move: ' + bestmove);
      }
      let depth = 0, nodes = 0, score: UsiAnalysis['score'] = null, pv: string[] = [];
      const variations = new Map<number, UsiAnalysis['variations'][number]>();
      const exactMoves = new Map<string, UsiAnalysis['variations'][number]>();
      for (const line of lines) {
        if (!line.startsWith('info ') || line.startsWith('info string ')) continue;
        const d = /\bdepth (\d+)/.exec(line), n = /\bnodes (\d+)/.exec(line);
        const s = /\bscore (cp|mate) (-?\d+)(?: (lowerbound|upperbound))?/.exec(line);
        const v = /\bpv (.+)/.exec(line);
        const rank = Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1);
        if (s && v && !s[3]) {
          const value = {rank,move:v[1]!.trim().split(/\s+/)[0]!,score:{type:s[1] as 'cp'|'mate',value:Number(s[2])},depth:Number(d?.[1]??0),pv:v[1]!.trim().split(/\s+/)};
          variations.set(rank,value);exactMoves.set(value.move,value);
        }
        if (rank !== 1) continue;
        if (d) depth = Number(d[1]);
        if (n) nodes = Number(n[1]);
        if (s) score = { type: s[1] as 'cp' | 'mate', value: Number(s[2]), ...(s[3] ? { bound: s[3] } : {}) };
        if (v) pv = v[1]!.trim().split(/\s+/);
      }
      const completed = exactMoves.get(bestmove);
      if (completed) {score=completed.score;depth=completed.depth;pv=completed.pv;}
      return { variations: [...variations.values()].sort((a,b)=>a.rank-b.rank), bestmove, move, resigned: bestmove === 'resign', depth, nodes,
        elapsedMs: Math.round(performance.now() - start), score, pv };
    } finally { this.busy = false; }
  }
  async features(game: Game): Promise<{raw:number;eval:number;cp:number;features:number[]}> {
    if ((!this.config.ruleMode || this.config.ruleMode === 'standard') || this.busy) throw new Error('Features require an idle recovery engine');
    const position = gameToUsiPosition(game, this.config.ruleMode);
    this.busy=true;
    try {
      this.send(position);
      const lines=await this.request('meguru_features',s=>s.startsWith('meguru_features '),30000);
      return JSON.parse(lines.at(-1)!.slice('meguru_features '.length));
    } finally {this.busy=false;}
  }
  async probe(game: Game): Promise<RecoveryProbe> {
    if (!this.config.ruleMode || this.config.ruleMode === 'standard') throw new Error('Probe requires a variant engine');
    if (this.busy) throw new Error('USI search already in progress');
    const position = gameToUsiPosition(game, this.config.ruleMode);
    this.busy = true;
    try {
      this.send(position);
      const lines = await this.request('meguru_probe', s => s.startsWith('meguru_probe '), 30000);
      return JSON.parse(lines.at(-1)!.slice('meguru_probe '.length)) as RecoveryProbe;
    } finally { this.busy = false; }
  }
  async close(): Promise<void> {
    if (this.closing) return this.exited;
    this.closing = true;
    this.fail(new Error('USI engine closed'));
    if (this.child.exitCode === null && this.child.signalCode === null) {
      this.child.stdin.end('quit\n');
      const timer = setTimeout(() => this.child.kill(), 1000);
      await this.exited;
      clearTimeout(timer);
    }
  }
}

