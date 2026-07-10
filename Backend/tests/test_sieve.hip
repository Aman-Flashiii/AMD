/**
 * test_sieve.hip
 * Unit test for GPU segmented sieve against CPU reference.
 */

#include <iostream>
#include <vector>
#include <cmath>
#include "../src/sieve/gpu_sieve_host.h"

// CPU Sieve of Eratosthenes for reference
std::vector<uint64_t> sieve_cpu(uint64_t start, uint64_t end) {
    if (end < start) return {};
    uint64_t range = end - start + 1;
    std::vector<bool> is_prime(range, true);
    
    uint64_t limit = (uint64_t)std::sqrt(end);
    std::vector<bool> small_sieve(limit + 1, true);
    small_sieve[0] = small_sieve[1] = false;
    for (uint64_t i = 2; i * i <= limit; i++) {
        if (small_sieve[i]) {
            for (uint64_t j = i * i; j <= limit; j += i)
                small_sieve[j] = false;
        }
    }
    std::vector<uint64_t> small_primes;
    for (uint64_t i = 2; i <= limit; i++) {
        if (small_sieve[i]) small_primes.push_back(i);
    }

    for (uint64_t p : small_primes) {
        uint64_t first = std::max(p * p, ((start + p - 1) / p) * p);
        for (uint64_t j = first; j <= end; j += p) {
            is_prime[j - start] = false;
        }
    }

    std::vector<uint64_t> primes;
    for (uint64_t i = 0; i < range; i++) {
        if (is_prime[i] && (start + i) >= 2) {
            primes.push_back(start + i);
        }
    }
    return primes;
}

int main() {
    std::cout << "🧪 Testing GPU Sieve vs CPU Sieve...\n";
    
    // Test ranges
    std::vector<std::pair<uint64_t, uint64_t>> ranges = {
        {10, 100},
        {100, 200},
        {1000, 1100},
        {1000000, 1000100}, // Small range near 1M
        {1000000000000ULL, 1000000000100ULL} // 1 Trillion
    };

    GPUSieve gpu_sieve;

    for (auto &range : ranges) {
        uint64_t start = range.first;
        uint64_t end = range.second;
        uint64_t range_size = (end - start) / 2 + 1; // odd numbers only

        std::cout << "\nRange: [" << start << ", " << end << "] (size: " << range_size << " odds)" << std::endl;

        // GPU Sieve
        auto gpu_primes = gpu_sieve.run_sieve(start, range_size);

        // CPU Sieve
        auto cpu_primes = sieve_cpu(start, end);

        // Compare
        bool pass = (gpu_primes.size() == cpu_primes.size());
        if (pass) {
            for (size_t i = 0; i < gpu_primes.size(); i++) {
                if (gpu_primes[i] != cpu_primes[i]) {
                    pass = false;
                    break;
                }
            }
        }

        if (pass) {
            std::cout << "✅ PASS: Found " << gpu_primes.size() << " primes (matches CPU)\n";
        } else {
            std::cout << "❌ FAIL: GPU found " << gpu_primes.size() 
                      << ", CPU found " << cpu_primes.size() << std::endl;
            // Print first few mismatches
            size_t min_sz = std::min(gpu_primes.size(), cpu_primes.size());
            for (size_t i = 0; i < min_sz && i < 10; i++) {
                if (gpu_primes[i] != cpu_primes[i]) {
                    std::cout << "  Mismatch at index " << i << ": GPU=" 
                              << gpu_primes[i] << " CPU=" << cpu_primes[i] << std::endl;
                }
            }
            return 1;
        }
    }

    std::cout << "\n🎉 All sieve tests passed!\n";
    return 0;
}