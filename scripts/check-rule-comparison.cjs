const fs = require('node:fs');
const prefix = 'asymmetric-rules-20.json';
const files = fs.readdirSync('reports');
const rows = files.filter(f => f.startsWith(prefix + '.part-')).flatMap(f => JSON.parse(fs.readFileSync('reports/' + f, 'utf8')));
const active = files.filter(f => f.startsWith(prefix + '.progress-')).map(f => JSON.parse(fs.readFileSync('reports/' + f, 'utf8'))).filter(p => !rows.some(r => r.id === p.id));
const counts = side => { const r = rows.filter(x => x.variantSide === side); return { games: r.length, variantWins: r.filter(x => x.winnerRule === 'variant').length, normalWins: r.filter(x => x.winnerRule === 'normal').length, draws: r.filter(x => !x.winner).length }; };
console.log(JSON.stringify({ completed: rows.length, variantSente: counts('sente'), variantGote: counts('gote'), active: active.map(p => ({ game: p.id + 1, variantSide: p.variantSide, plies: p.plies })) }));
