#include "../src/primality/rocblas_primality.h"
#include "../src/utils/opencl_utils.h"
#include <iostream>
#include <vector>
#include <cassert>

int main() {
    // Init OpenCL
    cl_platform_id platform; clGetPlatformIDs(1, &platform, nullptr);
    cl_device_id device; clGetDeviceIDs(platform, CL_DEVICE_TYPE_CPU, 1, &device, nullptr);
    cl_context context = clCreateContext(nullptr, 1, &device, nullptr, nullptr, nullptr);
    cl_command_queue queue = clCreateCommandQueue(context, device, 0, nullptr);

    RocBLASPrimality primality(context, device, queue);

    std::vector<uint64_t> test_numbers = {2, 3, 5, 7, 11, 13, 17, 19, 23, 1000000007, 1000000009, 4, 6, 8, 9, 100};
    auto primes = primality.batch_test(test_numbers);

    std::cout << "Primes found: ";
    for (auto p : primes) std::cout << p << " ";
    std::cout << std::endl;

    return 0;
}