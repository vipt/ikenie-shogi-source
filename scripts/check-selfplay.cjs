const fs = require('node:fs');
const files = fs.readdirSync('reports');
const prefix = 'self-play-strong-100.json';
const results = files.filter(f => f.startsWith(prefix + '.part-')).flatMap(f => JSON.parse(fs.readFileSync('reports/' + f, 'utf8')));
const live = files.filter(f => f.startsWith(prefix + '.progress-')).map(f => JSON.parse(fs.readFileSync('reports/' + f, 'utf8'))).filter(p => !results.some(r => r.id === p.id));
console.log(JSON.stringify({ completed: results.length, sente: results.filter(r => r.winner === 'sente').length, gote: results.filter(r => r.winner === 'gote').length, draws: results.filter(r => !r.winner).length, recoveries: results.reduce((s, r) => s + r.recoveries, 0), active: live.map(p => ({ game: p.id + 1, plies: p.plies, minutes: +(p.elapsedMs / 60000).toFixed(1) })) }));
