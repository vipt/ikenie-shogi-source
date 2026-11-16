#pragma once
// Android defaults to a small worker stack. Deep NNUE searches need the
// upstream NativeThread wrapper, which explicitly reserves 8 MiB.
#if defined(__ANDROID__) && !defined(USE_PTHREADS)
#define USE_PTHREADS 1
#endif
#ifndef IS_64BIT
#define IS_64BIT
#endif
#if defined(__aarch64__) || defined(__arm64__)
#ifndef USE_NEON
#define USE_NEON 1
#endif
#elif defined(__x86_64__) || defined(_M_X64)
#ifndef USE_SSE2
#define USE_SSE2
#endif
#else
#define NO_SSE
#endif

