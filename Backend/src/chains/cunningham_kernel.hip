#include <hip/hip_runtime.h>
#include <cstdint>

// Check if number is prime (using a simple 64-bit deterministic Miller-Rabin on device)
__device__ bool is_prime_dev(uint64_t n);

// Kernel: Find Cunningham chains from a list of starting primes
extern "C" __global__ 
void find_cunningham_chains_kernel(
    const uint64_t* d_primes,
    uint64_t num_primes,
    uint64_t* d_chain_starts,    // Output: starting primes of chains
    uint32_t* d_chain_lengths,   // Output: lengths
    uint32_t* d_chain_count,
    uint32_t min_chain_length
) {
    uint64_t idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx >= num_primes) return;
    
    uint64_t p = d_primes[idx];
    
    // Check Chain of First Kind: p, 2p+1, 4p+3, 8p+7, ...
    uint32_t len1 = 1;
    uint64_t current = p;
    while (true) {
        uint64_t next = 2 * current + 1;
        if (next < current) break; // Overflow
        if (!is_prime_dev(next)) break;
        current = next;
        len1++;
    }
    if (len1 >= min_chain_length) {
        uint32_t pos = atomicAdd(d_chain_count, 1);
        d_chain_starts[pos] = p;
        d_chain_lengths[pos] = len1;
    }
    
    // Check Chain of Second Kind: p, 2p-1, 4p-3, 8p-7, ...
    uint32_t len2 = 1;
    current = p;
    while (true) {
        uint64_t next = 2 * current - 1;
        if (next > current) break; // Overflow check
        if (!is_prime_dev(next)) break;
        current = next;
        len2++;
    }
    if (len2 >= min_chain_length) {
        uint32_t pos = atomicAdd(d_chain_count, 1);
        d_chain_starts[pos] = p;
        d_chain_lengths[pos] = len2 | 0x80000000; // MSB set for Type 2
    }
}

// Device primality implementation (simplified deterministic)
__device__ bool is_prime_dev(uint64_t n) {
    if (n < 2) return false;
    if (n % 2 == 0) return (n == 2);
    if (n % 3 == 0) return (n == 3);
    for (uint64_t i = 5; i * i <= n; i += 6) {
        if (n % i == 0 || n % (i + 2) == 0) return false;
    }
    return true;
}