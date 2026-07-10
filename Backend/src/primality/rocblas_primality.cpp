#include "rocblas_primality.h"
#include <iostream>

RocBLASPrimality::RocBLASPrimality(cl_context ctx, cl_device_id dev, cl_command_queue q)
    : context_(ctx), device_(dev), queue_(q) {
    std::string src;
    load_program_source("kernels/primality/miller_rabin_kernel.cl", src);
    program_ = build_program(context_, device_, src);
    kernel_ = create_kernel(program_, "miller_rabin_batch_kernel");
}

RocBLASPrimality::~RocBLASPrimality() {
    clReleaseKernel(kernel_);
    clReleaseProgram(program_);
}

std::vector<uint64_t> RocBLASPrimality::batch_test(const std::vector<uint64_t>& candidates) {
    if (candidates.empty()) return {};
    size_t n = candidates.size();

    cl_mem d_cand = create_buffer(context_, CL_MEM_READ_ONLY, n * sizeof(uint64_t),
                                  (void*)candidates.data());
    cl_mem d_res = create_buffer(context_, CL_MEM_READ_WRITE, n * sizeof(uchar));

    clSetKernelArg(kernel_, 0, sizeof(cl_mem), &d_cand);
    clSetKernelArg(kernel_, 1, sizeof(cl_mem), &d_res);
    clSetKernelArg(kernel_, 2, sizeof(ulong), &n);

    size_t global = ((n + 255) / 256) * 256;
    clEnqueueNDRangeKernel(queue_, kernel_, 1, nullptr, &global, nullptr, 0, nullptr, nullptr);
    clFinish(queue_);

    std::vector<uchar> res(n);
    clEnqueueReadBuffer(queue_, d_res, CL_TRUE, 0, n * sizeof(uchar), res.data(), 0, nullptr, nullptr);

    std::vector<uint64_t> primes;
    for (size_t i = 0; i < n; i++) {
        if (res[i]) primes.push_back(candidates[i]);
    }

    clReleaseMemObject(d_cand);
    clReleaseMemObject(d_res);
    return primes;
}