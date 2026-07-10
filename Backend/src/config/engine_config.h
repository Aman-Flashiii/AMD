#ifndef ENGINE_CONFIG_H
#define ENGINE_CONFIG_H

#include <cstdint>

#define START_RANGE 1000000000000ULL          // 1 Trillion
#define DEFAULT_BATCH_SIZE 1000000ULL         // 1 million numbers per batch

// Small primes for sieve (first 25 primes)
#define SMALL_PRIME_LIMIT 100

// Miller-Rabin deterministic bases for 64-bit
constexpr uint64_t MR_BASES[] = {2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37};
constexpr int MR_BASE_COUNT = 12;

// Cunningham chain minimum length to report
#define MIN_CHAIN_LENGTH 5

// Streaming output file
#define STREAM_OUTPUT_FILE "/tmp/prime_results.json"

// Wheel size and residues (mod 30)
#define WHEEL_SIZE 30
#define WHEEL_RESIDUES {1, 7, 11, 13, 17, 19, 23, 29}
#define WHEEL_COUNT 8

// Batch GCD product (first 24 primes)
#define BATCH_GCD_PROD 13082761331670030ULL

#endif