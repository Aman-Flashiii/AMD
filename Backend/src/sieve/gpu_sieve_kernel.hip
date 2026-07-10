#include <hip/hip_runtime.h>
#include <cstdint>

// Kernel: Segmented Sieve of Eratosthenes (Odd numbers only)
// d_is_prime: array of bytes where each byte represents an odd number.
// Index mapping: number n -> index (n - start) / 2
extern "C" __global__ 
void parallel_sieve_kernel(
    unsigned char* d_is_prime,     // Output: 1 = prime, 0 = composite
    uint64_t start,                // Range start (must be odd)
    uint64_t range_size,           // Number of odd numbers to check
    const uint32_t* d_small_primes,// List of small primes up to sqrt(end)
    uint32_t num_small_primes
) {
    uint64_t global_id = blockIdx.x * blockDim.x + threadIdx.x;
    
    // Each thread handles marking multiples for a specific small prime
    if (global_id >= num_small_primes) return;
    
    uint32_t p = d_small_primes[global_id];
    uint64_t p_sq = (uint64_t)p * p;
    
    // Find first odd multiple of p in the range
    uint64_t first_multiple = ((start + p - 1) / p) * p;
    if (first_multiple < p_sq) first_multiple = p_sq;
    if (first_multiple % 2 == 0) first_multiple += p; // Keep it odd
    
    // Mark all odd multiples as composite
    for (uint64_t num = first_multiple; num < start + range_size * 2; num += 2 * p) {
        // Only mark if within range
        if (num < start) continue;
        uint64_t index = (num - start) / 2;
        if (index < range_size) {
            d_is_prime[index] = 0;
        }
    }
}

// Helper kernel: Initialize array to 1 (all numbers considered prime initially)
extern "C" __global__ 
void init_sieve_kernel(unsigned char* d_is_prime, uint64_t size) {
    uint64_t idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < size) {
        d_is_prime[idx] = 1;
    }
}

// Kernel: Extract primes from sieve into a compact list
extern "C" __global__ 
void extract_primes_kernel(
    const unsigned char* d_is_prime,
    uint64_t start,
    uint64_t range_size,
    uint64_t* d_primes_output,
    uint64_t* d_count
) {
    uint64_t idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < range_size) {
        if (d_is_prime[idx] == 1) {
            uint64_t prime = start + idx * 2;
            uint64_t pos = atomicAdd(d_count, 1);
            d_primes_output[pos] = prime;
        }
    }
}