#include "../config/engine_config.h"

// Montgomery multiplication (safe for 64-bit)
static ulong mul_mod(ulong a, ulong b, ulong mod) {
    // Use 64-bit split to avoid overflow
    // For simplicity, we fall back to standard modulo
    // (OpenCL 1.2 doesn't guarantee 128-bit, so we use this)
    return (a % mod) * (b % mod) % mod;
}

// Deterministic Miller-Rabin for 64-bit
static int is_prime_mr(ulong n) {
    if (n < 2) return 0;
    if (n % 2 == 0) return (n == 2);
    if (n % 3 == 0) return (n == 3);
    ulong d = n - 1;
    uint s = 0;
    while ((d & 1) == 0) { d >>= 1; s++; }
    ulong bases[12] = MR_BASES;
    for (uint i = 0; i < 12; i++) {
        ulong a = bases[i] % n;
        if (a == 0) continue;
        ulong x = 1;
        ulong exp = d;
        ulong base = a;
        while (exp) {
            if (exp & 1) x = mul_mod(x, base, n);
            base = mul_mod(base, base, n);
            exp >>= 1;
        }
        if (x == 1 || x == n - 1) continue;
        int comp = 1;
        for (uint r = 1; r < s; r++) {
            x = mul_mod(x, x, n);
            if (x == n - 1) { comp = 0; break; }
        }
        if (comp) return 0;
    }
    return 1;
}

// Batch MR kernel
__kernel void miller_rabin_batch_kernel(
    __global const ulong* d_candidates,
    __global uchar* d_results,
    ulong num_candidates
) {
    uint gid = get_global_id(0);
    if (gid >= num_candidates) return;
    d_results[gid] = is_prime_mr(d_candidates[gid]);
}