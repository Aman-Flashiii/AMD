#ifndef GPU_SIEVE_HOST_H
#define GPU_SIEVE_HOST_H

#include "../utils/opencl_utils.h"
#include <vector>
#include <cstdint>

class GPUSieve {
public:
    GPUSieve(cl_context ctx, cl_device_id dev, cl_command_queue q);
    ~GPUSieve();

    // Run sieve on [start, start+range) and return candidate numbers (not yet MR-tested)
    std::vector<uint64_t> run_sieve(uint64_t start, uint64_t range);

private:
    cl_context context_;
    cl_device_id device_;
    cl_command_queue queue_;
    cl_program program_;
    cl_kernel kernel_sieve_, kernel_init_, kernel_extract_;
    std::vector<uint32_t> small_primes_;
    void init_small_primes();
};

#endif