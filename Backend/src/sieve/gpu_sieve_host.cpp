#include "gpu_sieve_host.h"
#include "../config/engine_config.h"
#include <cmath>
#include <iostream>

GPUSieve::GPUSieve(cl_context ctx, cl_device_id dev, cl_command_queue q)
    : context_(ctx), device_(dev), queue_(q) {
    init_small_primes();

    // Build program from kernel file
    std::string src;
    load_program_source("kernels/sieve/gpu_sieve_kernel.cl", src);
    program_ = build_program(context_, device_, src);
    kernel_sieve_ = create_kernel(program_, "wheel_sieve_kernel");
    kernel_init_ = create_kernel(program_, "init_sieve_kernel");
    kernel_extract_ = create_kernel(program_, "extract_candidates_kernel");
}

GPUSieve::~GPUSieve() {
    clReleaseKernel(kernel_sieve_);
    clReleaseKernel(kernel_init_);
    clReleaseKernel(kernel_extract_);
    clReleaseProgram(program_);
}

void GPUSieve::init_small_primes() {
    // Generate small primes up to 1000 (for sieve)
    // Hardcode first few for simplicity
    small_primes_ = {2,3,5,7,11,13,17,19,23,29,31,37,41,43,47,53,59,61,67,71,73,79,83,89,97};
}

std::vector<uint64_t> GPUSieve::run_sieve(uint64_t start, uint64_t range) {
    // Align start to multiple of 30
    uint64_t adj_start = (start / WHEEL_SIZE) * WHEEL_SIZE;
    if (adj_start < WHEEL_SIZE) adj_start = WHEEL_SIZE;
    uint64_t num_wheels = (range / WHEEL_SIZE) + 2;
    size_t sieve_size = num_wheels * WHEEL_COUNT;

    // Allocate device memory
    cl_mem d_is_prime = create_buffer(context_, CL_MEM_READ_WRITE, sieve_size);
    cl_mem d_small = create_buffer(context_, CL_MEM_READ_ONLY,
                                   small_primes_.size() * sizeof(uint32_t),
                                   (void*)small_primes_.data());
    cl_mem d_candidates = create_buffer(context_, CL_MEM_READ_WRITE, sieve_size * sizeof(uint64_t));
    cl_mem d_count = create_buffer(context_, CL_MEM_READ_WRITE, sizeof(uint64_t));
    uint64_t zero = 0;
    clEnqueueWriteBuffer(queue_, d_count, CL_TRUE, 0, sizeof(uint64_t), &zero, 0, nullptr, nullptr);

    // Initialize sieve to 1
    size_t global_init = (sieve_size + 255) / 256 * 256;
    clSetKernelArg(kernel_init_, 0, sizeof(cl_mem), &d_is_prime);
    clSetKernelArg(kernel_init_, 1, sizeof(ulong), &sieve_size);
    clEnqueueNDRangeKernel(queue_, kernel_init_, 1, nullptr, &global_init, nullptr, 0, nullptr, nullptr);

    // Run sieve kernel
    uint num_small = small_primes_.size();
    clSetKernelArg(kernel_sieve_, 0, sizeof(cl_mem), &d_is_prime);
    clSetKernelArg(kernel_sieve_, 1, sizeof(ulong), &adj_start);
    clSetKernelArg(kernel_sieve_, 2, sizeof(ulong), &num_wheels);
    clSetKernelArg(kernel_sieve_, 3, sizeof(cl_mem), &d_small);
    clSetKernelArg(kernel_sieve_, 4, sizeof(uint), &num_small);
    size_t global_sieve = ((num_small + 255) / 256) * 256;
    clEnqueueNDRangeKernel(queue_, kernel_sieve_, 1, nullptr, &global_sieve, nullptr, 0, nullptr, nullptr);

    // Extract candidates
    clSetKernelArg(kernel_extract_, 0, sizeof(cl_mem), &d_is_prime);
    clSetKernelArg(kernel_extract_, 1, sizeof(ulong), &adj_start);
    clSetKernelArg(kernel_extract_, 2, sizeof(ulong), &num_wheels);
    clSetKernelArg(kernel_extract_, 3, sizeof(cl_mem), &d_candidates);
    clSetKernelArg(kernel_extract_, 4, sizeof(cl_mem), &d_count);
    size_t global_extract = ((sieve_size + 255) / 256) * 256;
    clEnqueueNDRangeKernel(queue_, kernel_extract_, 1, nullptr, &global_extract, nullptr, 0, nullptr, nullptr);
    clFinish(queue_);

    // Read candidate count
    uint64_t count;
    clEnqueueReadBuffer(queue_, d_count, CL_TRUE, 0, sizeof(uint64_t), &count, 0, nullptr, nullptr);

    // Read candidates
    std::vector<uint64_t> candidates(count);
    if (count > 0) {
        clEnqueueReadBuffer(queue_, d_candidates, CL_TRUE, 0, count * sizeof(uint64_t),
                            candidates.data(), 0, nullptr, nullptr);
    }

    // Clean up
    clReleaseMemObject(d_is_prime);
    clReleaseMemObject(d_small);
    clReleaseMemObject(d_candidates);
    clReleaseMemObject(d_count);

    return candidates;
}