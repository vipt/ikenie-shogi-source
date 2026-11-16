#pragma once
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
const char* meguru_analyze(const char* position, const char* eval_dir, const char* book_dir,
                          int mask, int book, int movetime_ms, const char* game_id, int64_t request_id);
const char* meguru_analyze_limited(const char* position, const char* eval_dir, const char* book_dir,
                          int mask, int book, int movetime_ms, const char* game_id, int64_t request_id, int move_limit);
const char* meguru_analyze_configured(const char* position, const char* eval_dir, const char* book_dir,
                          int mask, int book, int movetime_ms, const char* game_id, int64_t request_id, int move_limit, int max_depth);
const char* meguru_inspect(const char* position, const char* eval_dir, int mask);
const char* meguru_progress(int64_t request_id);
void meguru_cancel(int64_t request_id);
#ifdef __cplusplus
}
#endif
