// Local derivative of YaneuraOu V9.00. All generated C++ changes are GPL-3.0-or-later.
// Rebuild from the pinned official archive; never patch the stock engine in place.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.join(root, '.tools/engines/meguru-v1/source');
function edit(file, changes) {
  const filePath = path.join(source, file);
  let text = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  for (const [from, to, all = false] of changes) {
    const count = text.split(from).length - 1;
    if (!count || (!all && count !== 1)) throw new Error(file + ': patch mismatch: ' + from.slice(0, 80) + ' (' + count + ')');
    text = all ? text.split(from).join(to) : text.replace(from, to);
  }
  fs.writeFileSync(filePath, text);
}
edit('position.cpp', [
  ['if (pieces(us) & to)\n\t\t\treturn false;',
   'if (type_of(piece_on(to)) == KING || ((pieces(us) & to) && type_of(pc) == KING))\n\t\t\treturn false;'],
  ['materialDiff += Eval::CapturePieceValue[captured];',
   '// Recovery keeps ownership; only demotion changes material.\n            materialDiff += color_of(captured) == Us\n                ? Eval::PieceValue[raw_type_of(captured)] - Eval::PieceValue[captured]\n                : Eval::CapturePieceValue[captured];'],
  ['int swap = PieceValue[piece_on(to)] - threshold;',
   '// SEE must not count recovery as gaining an enemy piece.\n    const Piece target = piece_on(to);\n    const int gain = target && color_of(target) == sideToMove\n        ? (PieceValue[raw_type_of(target)] - PieceValue[target]) / 2\n        : PieceValue[target];\n    int swap = gain - threshold;'],
  ['if (type_of(piece_on(from)) == KING)\n\t\t\treturn !effected_to(~us, m.to_sq(), from);',
   'if (type_of(piece_on(from)) == KING)\n            return !(pieces(us) & m.to_sq()) && !effected_to(~us, m.to_sq(), from);'],
]);
edit('position.h', [
  ['return !m.is_drop() && piece_on(m.to_sq()) != NO_PIECE;',
   '// Search capture stages contain enemy captures only; recovery is a quiet move.\n    return !m.is_drop() && enemy_piece_on(m.to_sq()) != NO_PIECE;'],
  ['Piece captured_piece() const { return st->capturedPiece; }',
   'Piece captured_piece() const { return st->capturedPiece; }\n    Piece enemy_captured_piece() const {\n        return st->capturedPiece && color_of(st->capturedPiece) == sideToMove ? st->capturedPiece : NO_PIECE;\n    }\n    Piece enemy_piece_on(Square sq) const {\n        const Piece pc = piece_on(sq);\n        return pc && color_of(pc) != sideToMove ? pc : NO_PIECE;\n    }'],
]);
edit('movegen.cpp', [
  ['// --- 駒打ち\n\t// →　オーダリング性能改善',
   '// Recover friendly non-king pieces in the quiet stage. Kings never recover.\n' +
   '    // Keep ordinary capture generation disjoint from these moves.\n' +
   '    if (Type == QUIETS || Type == QUIETS_PRO_MINUS || Type == NON_EVASIONS) {\n' +
   '        const Bitboard own = pos.pieces(Us) & ~pos.pieces(KING);\n' +
   '        mlist = GeneratePieceMoves<NON_EVASIONS, PAWN, Us, All>()(pos, mlist, own);\n' +
   '        mlist = GeneratePieceMoves<NON_EVASIONS, LANCE, Us, All>()(pos, mlist, own);\n' +
   '        mlist = GeneratePieceMoves<NON_EVASIONS, KNIGHT, Us, All>()(pos, mlist, own);\n' +
   '        mlist = GeneratePieceMoves<NON_EVASIONS, SILVER, Us, All>()(pos, mlist, own);\n' +
   '        mlist = GeneratePieceMoves<NON_EVASIONS, GPM_BR, Us, All>()(pos, mlist, own);\n' +
   '        mlist = GeneratePieceMoves<NON_EVASIONS, GPM_GHD, Us, All>()(pos, mlist, own);\n' +
   '    }\n\n\t// --- 駒打ち\n\t// →　オーダリング性能改善'],
]);
edit('movegen.h', [['constexpr int MAX_MOVES = 600;', 'constexpr int MAX_MOVES = 2048; // Extra recovery moves; do not assume the standard-shogi bound.']]);
edit('engine/yaneuraou-engine/yaneuraou-search.cpp', [
  ['Mate::mate_1ply(pos)', 'Move::none() /* standard-rule mate shortcut disabled */', true],
  ['pos.captured_piece()', 'pos.enemy_captured_piece()', true],
  ['pos.piece_on(move.to_sq())', 'pos.enemy_piece_on(move.to_sq())', true],
  ['pos.piece_on(bestMove.to_sq())', 'pos.enemy_piece_on(bestMove.to_sq())', true],
]);
edit('eval/evaluate_bona_piece.cpp', [
  ['(Value)CapturePieceValue[pos.piece_on(move.to_sq())]',
   '(Value)(pos.piece_on(move.to_sq()) && color_of(pos.piece_on(move.to_sq())) == pos.side_to_move()\n' +
   '            ? PieceValue[raw_type_of(pos.piece_on(move.to_sq()))] - PieceValue[pos.piece_on(move.to_sq())]\n' +
   '            : CapturePieceValue[pos.piece_on(move.to_sq())])'],
]);
edit('config.h', [
  ['#endif // if !defined(CONFIG_H_INCLUDED)',
   '// Recovery build: do not use standard-rule mate shortcuts or evaluation hash while validating NNUE differences.\n' +
   '#undef USE_MATE_1PLY\n#undef USE_MATE_SOLVER\n#undef USE_MATE_DFPN\n#undef USE_EVAL_HASH\n' +
   '#ifdef LONG_EFFECT_LIBRARY\n#error Recovery build requires the bitboard-only move updater\n#endif\n\n' +
   '#endif // if !defined(CONFIG_H_INCLUDED)'],
]);
edit('usi.cpp', [
  ['#include "engine.h"', '#include "engine.h"\n#include "meguru_probe.h"'],
  ['else if (token == "moves")\n        moves();',
   'else if (token == "moves")\n        moves();\n' +
   "    else if (token == \"meguru_features\") {\n        engine.wait_for_search_finished();\n        meguru_features(engine.get_position());\n    }\n" +
   '    else if (token == "meguru_probe") {\n' +
   '        engine.wait_for_search_finished();\n        meguru_probe(engine.get_position());\n    }'],
]);
fs.copyFileSync(path.join(root, 'engine/meguru_probe.h'), path.join(source, 'meguru_probe.h'));
const sources = ['position.cpp','position.h','movegen.cpp','movegen.h','config.h','usi.cpp',
 'engine/yaneuraou-engine/yaneuraou-search.cpp','eval/evaluate_bona_piece.cpp','meguru_probe.h'];
const hashes = Object.fromEntries(sources.map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(source,f))).digest('hex')]));
fs.writeFileSync(path.join(root, '.tools/engines/meguru-v1/source-hashes.json'), JSON.stringify(hashes,null,2)+'\n');
console.log('Applied recovery rule patch to isolated source: ' + sources.length + ' files');

