#ifndef ROCBLAS_PRIMALITY_H
#define ROCBLAS_PRIMALITY_H

#include "../utils/opencl_utils.h"
#include <vector>
#include <cstdint>

class RocBLASPrimality { // name kept for structure
public:
    RocBLASPrimality(cl_context ctx, cl_device_id dev, cl_command_queue q);
    ~RocBLASPrimality();

    // Batch test candidates; returns vector of confirmed primes
    std::vector<uint64_t> batch_test(const std::vector<uint64_t>& candidates);

private:
    cl_context context_;
    cl_device_id device_;
    cl_command_queue queue_;
    cl_program program_;
    cl_kernel kernel_;
};

#endif