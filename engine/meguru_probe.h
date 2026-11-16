// Meguru Shogi recovery-rule diagnostics. GPL-3.0-or-later.
// This command is only used after waiting for the search thread to finish.
#ifndef MEGURU_PROBE_H
#define MEGURU_PROBE_H
#include "movegen.h"
#include "evaluate.h"
#include "usi.h"
#include "eval/nnue/evaluate_nnue.h"
#include <sstream>
namespace YaneuraOu {
inline void meguru_probe(Position& pos) {
    const auto original = pos.sfen();
    const auto key = pos.key();
    const Value rootEval = Eval::evaluate(pos);
    Position fresh;
    StateInfo freshState;
    fresh.set(original, &freshState);
    bool valid = rootEval == Eval::evaluate(fresh) && key == fresh.key()
        && pos.state()->materialValue == Eval::material(pos);
    const auto repetition = pos.is_repetition(0);
    const char* repetitionName = repetition == REPETITION_DRAW ? "draw"
        : repetition == REPETITION_WIN ? "win" : repetition == REPETITION_LOSE ? "lose" : "none";
    std::ostringstream out;
    out << "meguru_probe {\"rule\":\"recovery-king-enemy-v1\",\"sfen\":\"" << original
        << "\",\"eval\":" << rootEval << ",\"inCheck\":" << (pos.in_check() ? "true" : "false")
        << ",\"repetition\":\"" << repetitionName << "\",\"children\":[";
    bool first = true;
    for (const auto m : MoveList<LEGAL_ALL>(pos)) {
        const bool recovery = !m.is_drop() && pos.piece_on(m.to_sq())
            && color_of(pos.piece_on(m.to_sq())) == pos.side_to_move();
        valid &= pos.pseudo_legal_s<true>(m) && pos.legal_promote(m);
        StateInfo next;
        pos.do_move(m, next);
        const Value incremental = Eval::evaluate(pos);
        fresh.set(pos.sfen(), &freshState);
        const bool childValid = incremental == Eval::evaluate(fresh)
            && pos.key() == fresh.key()
            && pos.pawn_key() == fresh.pawn_key()
            && pos.minor_piece_key() == fresh.minor_piece_key()
            && pos.state()->materialValue == Eval::material(pos)
            && pos.checkers() == fresh.checkers();
        valid &= childValid;
        if (!first) out << ",";
        first = false;
        out << "{\"move\":\"" << USIEngine::move(m) << "\",\"sfen\":\"" << pos.sfen()
            << "\",\"recovery\":" << (recovery ? "true" : "false")
            << ",\"valid\":" << (childValid ? "true" : "false") << "}";
        pos.undo_move(m);
        valid &= pos.sfen() == original && pos.key() == key && Eval::evaluate(pos) == rootEval
            && pos.state()->materialValue == Eval::material(pos);
    }
    out << "],\"valid\":" << (valid ? "true" : "false") << "}";
    sync_cout << out.str() << sync_endl;
}
inline void meguru_features(Position& pos) {
    alignas(64) Eval::NNUE::TransformedFeatureType features[512];
    alignas(64) char buffer[Eval::NNUE::Network::kBufferSize];
    Eval::NNUE::feature_transformer->Transform(pos, features, true);
    const auto raw = Eval::NNUE::network->Propagate(features, buffer)[0];
    std::ostringstream out;
    out << "meguru_features {\"raw\":" << raw << ",\"eval\":" << Eval::evaluate(pos)
        << ",\"cp\":" << USIEngine::to_cp(Eval::evaluate(pos)) << ",\"features\":[";
    for (int i = 0; i < 512; ++i) { if(i) out << ","; out << int(features[i]); }
    out << "]}";
    sync_cout << out.str() << sync_endl;
}
}
#endif
