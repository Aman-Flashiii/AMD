#ifndef BIG_INT_UTILS_H
#define BIG_INT_UTILS_H

#include <cstdint>
#include <vector>

// Modular multiplication using 128-bit intermediate to avoid overflow
inline uint64_t mul_mod(uint64_t a, uint64_t b, uint64_t mod) {
    return (__uint128_t)a * b % mod;
}

// Modular exponentiation (a^b % mod)
uint64_t pow_mod(uint64_t a, uint64_t d, uint64_t mod);

// Generate small primes up to limit on CPU (for sieve initialization)
std::vector<uint32_t> generate_small_primes(uint32_t limit);

#endif