const readline = require('node:readline');
const mode = process.argv[2];
readline.createInterface({ input: process.stdin }).on('line', line => {
  if (line === 'usi') {
    if (mode === 'startup-hang') return;
    process.stdout.write('id name Fake USI\noption name Threads type spin default 1 min 1 max 2\nusi');
    setTimeout(() => process.stdout.write('ok\n'), 5);
  } else if (line === 'isready') console.log('readyok');
  else if (line.startsWith('go ')) {
    if (mode === 'crash') return process.exit(3);
    if (mode === 'hang') return;
    console.log('info depth 8 nodes 1234 score cp 42 pv 7g7f 3c3d');
    if (mode === 'multipv') {
      console.log('info depth 8 multipv 2 nodes 1250 score cp 10 pv 2g2f 8c8d');
      console.log('info depth 9 multipv 1 nodes 2000 score cp 70 pv 2g2f 8c8d');
      console.log('info depth 10 multipv 1 nodes 3000 score cp 100 lowerbound pv 7g7f 3c3d');
      console.log('info depth 10 multipv 2 nodes 3001 score cp -50 upperbound pv 2g2f 8c8d');
    }
    console.log('bestmove ' + (mode === 'illegal' ? '7g7a' : mode === 'resign' ? 'resign' : '7g7f'));
  } else if (line === 'quit') process.exit(0);
});


