#ifndef CUNNINGHAM_HOST_H
#define CUNNINGHAM_HOST_H

#include "../utils/opencl_utils.h"
#include <vector>
#include <cstdint>

struct ChainRecord {
    uint64_t start;
    uint32_t length;
    uint8_t type; // 1 or 2
};

class CunninghamFinder {
public:
    CunninghamFinder(cl_context ctx, cl_device_id dev, cl_command_queue q);
    ~CunninghamFinder();

    std::vector<ChainRecord> find_chains(const std::vector<uint64_t>& primes,
                                         uint32_t min_len = MIN_CHAIN_LENGTH);

private:
    cl_context context_;
    cl_device_id device_;
    cl_command_queue queue_;
    cl_program program_;
    cl_kernel kernel_;
};

#endif