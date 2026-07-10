#include "big_int_utils.h"
#include <cmath>
#include <vector>
#include <cstring>

uint64_t pow_mod_cpu(uint64_t a, uint64_t d, uint64_t mod) {
    uint64_t result = 1;
    a %= mod;
    while (d) {
        if (d & 1) result = mul_mod_cpu(result, a, mod);
        a = mul_mod_cpu(a, a, mod);
        d >>= 1;
    }
    return result;
}

std::vector<uint32_t> generate_small_primes(uint32_t limit) {
    std::vector<bool> is_prime(limit + 1, true);
    is_prime[0] = is_prime[1] = false;
    for (uint32_t i = 2; i * i <= limit; i++) {
        if (is_prime[i]) {
            for (uint32_t j = i * i; j <= limit; j += i)
                is_prime[j] = false;
        }
    }
    std::vector<uint32_t> primes;
    for (uint32_t i = 2; i <= limit; i++) {
        if (is_prime[i]) primes.push_back(i);
    }
    return primes;
}