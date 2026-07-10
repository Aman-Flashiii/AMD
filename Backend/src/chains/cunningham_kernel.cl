#include "../config/engine_config.h"
#include "../primality/miller_rabin_kernel.cl"  // includes is_prime_mr

// Cunningham chain kernel with modular filters
__kernel void cunningham_chain_kernel(
    __global const ulong* d_primes,
    ulong num_primes,
    __global ulong* d_chain_start,
    __global uint* d_chain_len,
    __global uint* d_chain_count,
    uint min_len
) {
    uint gid = get_global_id(0);
    if (gid >= num_primes) return;
    ulong p = d_primes[gid];

    // ---- Type 1: p, 2p+1, 4p+3, ... ----
    // Modular filter: if p % 3 == 1, then 2p+1 is divisible by 3 → skip
    if (p % 3 == 1) goto type2;
    uint len = 1;
    ulong cur = p;
    while (1) {
        ulong next = 2 * cur + 1;
        if (next < cur) break;
        if (!is_prime_mr(next)) break;
        cur = next;
        len++;
    }
    if (len >= min_len) {
        uint pos = atomic_inc(d_chain_count);
        d_chain_start[pos] = p;
        d_chain_len[pos] = len; // type 1 (bit 31 = 0)
    }

type2:
    // ---- Type 2: p, 2p-1, 4p-3, ... ----
    // Filter: if p % 3 == 2, then 2p-1 divisible by 3
    if (p % 3 == 2) return;
    len = 1;
    cur = p;
    while (1) {
        ulong next = 2 * cur - 1;
        if (next > cur) break;
        if (!is_prime_mr(next)) break;
        cur = next;
        len++;
    }
    if (len >= min_len) {
        uint pos = atomic_inc(d_chain_count);
        d_chain_start[pos] = p;
        d_chain_len[pos] = len | 0x80000000; // type 2 (bit 31 set)
    }
}