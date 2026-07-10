#include <hip/hip_runtime.h>
#include <cstdint>

// Device function for modular multiplication
__device__ inline uint64_t mul_mod_dev(uint64_t a, uint64_t b, uint64_t mod) {
    return (__uint128_t)a * b % mod;
}

__device__ inline uint64_t pow_mod_dev(uint64_t a, uint64_t d, uint64_t mod) {
    uint64_t result = 1;
    a %= mod;
    while (d > 0) {
        if (d & 1) result = mul_mod_dev(result, a, mod);
        a = mul_mod_dev(a, a, mod);
        d >>= 1;
    }
    return result;
}

// Kernel: Batch Miller-Rabin test on an array of candidates
extern "C" __global__ 
void miller_rabin_batch_kernel(
    const uint64_t* d_candidates,
    uint8_t* d_results,          // 1 = prime, 0 = composite
    uint64_t num_candidates,
    const uint64_t* d_bases,
    uint32_t num_bases
) {
    uint64_t idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= num_candidates) return;
    
    uint64_t n = d_candidates[idx];
    
    // Small primes quick check
    if (n < 2) { d_results[idx] = 0; return; }
    if (n % 2 == 0) { d_results[idx] = (n == 2); return; }
    
    // Write n-1 as d * 2^s
    uint64_t d = n - 1;
    uint32_t s = 0;
    while (d % 2 == 0) {
        d >>= 1;
        s++;
    }
    
    bool is_prime = true;
    for (uint32_t i = 0; i < num_bases && is_prime; i++) {
        uint64_t a = d_bases[i] % n;
        if (a == 0) continue; // base is multiple of n
        
        uint64_t x = pow_mod_dev(a, d, n);
        if (x == 1 || x == n - 1) continue;
        
        bool composite = true;
        for (uint32_t r = 1; r < s; r++) {
            x = mul_mod_dev(x, x, n);
            if (x == n - 1) {
                composite = false;
                break;
            }
        }
        if (composite) {
            is_prime = false;
        }
    }
    
    d_results[idx] = is_prime ? 1 : 0;
}