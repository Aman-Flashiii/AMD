#include <iostream>
#include <chrono>
#include <signal.h>
#include <vector>
#include <thread>

#include "config/engine_config.h"
#include "utils/opencl_utils.h"
#include "sieve/gpu_sieve_host.h"
#include "primality/rocblas_primality.h"
#include "chains/cunningham_host.h"
#include "gap/gap_analyzer.h"
#include "memory/dynamic_sieve_manager.h"
#include "streaming/result_streamer.h"

volatile sig_atomic_t running = 1;
void signal_handler(int) { running = 0; }

int main() {
    signal(SIGINT, signal_handler);
    std::cout << "🚀 OpenCL Prime Engine (Optimized) - Running on Intel/AMD/NVIDIA\n";

    // Init OpenCL
    cl_int err;
    cl_platform_id platform;
    clGetPlatformIDs(1, &platform, nullptr);
    cl_device_id device;
    clGetDeviceIDs(platform, CL_DEVICE_TYPE_GPU, 1, &device, nullptr);
    print_device_info(device);

    cl_context context = clCreateContext(nullptr, 1, &device, nullptr, nullptr, &err);
    check_cl_error(err, "clCreateContext");
    cl_command_queue queue = clCreateCommandQueue(context, device, 0, &err);
    check_cl_error(err, "clCreateCommandQueue");

    // Instantiate engines
    GPUSieve sieve(context, device, queue);
    RocBLASPrimality primality(context, device, queue);
    CunninghamFinder chain_finder(context, device, queue);
    GapAnalyzer gap_analyzer;
    DynamicSieveManager mem_manager;

    ResultStreamer streamer(STREAM_OUTPUT_FILE);

    uint64_t start = START_RANGE;
    uint64_t range = mem_manager.determine_optimal_range(DEFAULT_BATCH_SIZE, 4ULL * 1024 * 1024 * 1024); // 4GB mock
    uint64_t total_primes = 0;
    uint64_t max_gap_global = 0;
    uint64_t c1 = 0, c3 = 0;

    while (running) {
        auto batch_start = std::chrono::high_resolution_clock::now();

        // 1. Sieve candidates
        auto candidates = sieve.run_sieve(start, range);
        if (candidates.empty()) { start += range; continue; }

        // 2. Miller-Rabin batch
        auto primes = primality.batch_test(candidates);
        total_primes += primes.size();

        // 3. Gap analysis
        gap_analyzer.process_primes(primes);
        auto max_gap = gap_analyzer.get_largest_gap();
        if (max_gap.gap > max_gap_global) {
            max_gap_global = max_gap.gap;
            streamer.stream_gap(max_gap.gap, max_gap.prime_before, max_gap.prime_after);
        }

        // 4. Cunningham chains
        auto chains = chain_finder.find_chains(primes, MIN_CHAIN_LENGTH);
        for (auto &c : chains) {
            streamer.stream_chain(c.start, c.length, c.type);
        }

        // 5. Chebyshev count (simplified: count 1 mod 4 and 3 mod 4 on CPU)
        for (auto p : primes) {
            if (p % 4 == 1) c1++;
            else if (p % 4 == 3) c3++;
        }

        // 6. Stats streaming
        streamer.stream_stats(total_primes, c1, c3, max_gap_global);
        streamer.flush();

        auto end = std::chrono::high_resolution_clock::now();
        double elapsed = std::chrono::duration<double>(end - batch_start).count();
        std::cout << "Batch [" << start << "] found " << primes.size()
                  << " primes in " << elapsed << "s | Total: " << total_primes << "\n";

        start += range;
        // Re-adjust range based on memory
        // (For simplicity, keep constant)
    }

    return 0;
}