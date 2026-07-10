// gpu_sieve_kernel.cl - Wheel-based segmented sieve (mod 30)
#include "../config/engine_config.h"

// Wheel residues
__constant uint wheel_res[8] = WHEEL_RESIDUES;

__kernel void wheel_sieve_kernel(
    __global uchar* d_is_prime,       // per-residue flags (1 = candidate)
    ulong start,                      // multiple of 30
    ulong num_wheels,
    __global const ulong* d_small_primes,
    uint num_small_primes
) {
    uint gid = get_global_id(0);
    if (gid >= num_small_primes) return;
    ulong p = d_small_primes[gid];
    ulong end = start + num_wheels * WHEEL_SIZE - 1;
    if (p * p > end) return;

    // For each residue class
    for (uint r = 0; r < WHEEL_COUNT; r++) {
        ulong base_res = wheel_res[r];
        // Find first multiple of p in this residue class
        ulong first = ((start + base_res + p - 1) / p) * p;
        // Adjust to ensure it matches the residue
        while ((first - start) % WHEEL_SIZE != base_res) first += p;
        if (first < start) first += p;
        // Mark multiples
        for (ulong mult = first; mult <= end; mult += p * WHEEL_SIZE) {
            ulong block = (mult - start) / WHEEL_SIZE;
            ulong idx = block * WHEEL_COUNT + r;
            d_is_prime[idx] = 0;
        }
    }
}

// Helper kernel to initialize sieve to 1
__kernel void init_sieve_kernel(__global uchar* d_is_prime, ulong size) {
    uint gid = get_global_id(0);
    if (gid < size) d_is_prime[gid] = 1;
}

// Extract candidates from sieve into a compact list
__kernel void extract_candidates_kernel(
    __global const uchar* d_is_prime,
    ulong start,
    ulong num_wheels,
    __global ulong* d_candidates,
    __global ulong* d_count
) {
    uint gid = get_global_id(0);
    if (gid >= num_wheels * WHEEL_COUNT) return;
    if (d_is_prime[gid]) {
        ulong block = gid / WHEEL_COUNT;
        uint res_idx = gid % WHEEL_COUNT;
        ulong num = start + block * WHEEL_SIZE + wheel_res[res_idx];
        if (num > 2) {
            uint pos = atomic_inc(d_count);
            d_candidates[pos] = num;
        }
    }
}