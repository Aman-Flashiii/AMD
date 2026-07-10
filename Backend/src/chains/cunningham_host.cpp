#include "cunningham_host.h"
#include "../config/engine_config.h"
#include <iostream>

CunninghamFinder::CunninghamFinder(cl_context ctx, cl_device_id dev, cl_command_queue q)
    : context_(ctx), device_(dev), queue_(q) {
    std::string src;
    load_program_source("kernels/chains/cunningham_kernel.cl", src);
    program_ = build_program(context_, device_, src);
    kernel_ = create_kernel(program_, "cunningham_chain_kernel");
}

CunninghamFinder::~CunninghamFinder() {
    clReleaseKernel(kernel_);
    clReleaseProgram(program_);
}

std::vector<ChainRecord> CunninghamFinder::find_chains(const std::vector<uint64_t>& primes,
                                                       uint32_t min_len) {
    if (primes.empty()) return {};
    size_t n = primes.size();

    cl_mem d_primes = create_buffer(context_, CL_MEM_READ_ONLY, n * sizeof(uint64_t),
                                    (void*)primes.data());
    cl_mem d_starts = create_buffer(context_, CL_MEM_READ_WRITE, n * sizeof(uint64_t));
    cl_mem d_lens = create_buffer(context_, CL_MEM_READ_WRITE, n * sizeof(uint32_t));
    cl_mem d_count = create_buffer(context_, CL_MEM_READ_WRITE, sizeof(uint32_t));

    uint32_t zero = 0;
    clEnqueueWriteBuffer(queue_, d_count, CL_TRUE, 0, sizeof(uint32_t), &zero, 0, nullptr, nullptr);

    clSetKernelArg(kernel_, 0, sizeof(cl_mem), &d_primes);
    clSetKernelArg(kernel_, 1, sizeof(ulong), &n);
    clSetKernelArg(kernel_, 2, sizeof(cl_mem), &d_starts);
    clSetKernelArg(kernel_, 3, sizeof(cl_mem), &d_lens);
    clSetKernelArg(kernel_, 4, sizeof(cl_mem), &d_count);
    clSetKernelArg(kernel_, 5, sizeof(uint32_t), &min_len);

    size_t global = ((n + 255) / 256) * 256;
    clEnqueueNDRangeKernel(queue_, kernel_, 1, nullptr, &global, nullptr, 0, nullptr, nullptr);
    clFinish(queue_);

    uint32_t count;
    clEnqueueReadBuffer(queue_, d_count, CL_TRUE, 0, sizeof(uint32_t), &count, 0, nullptr, nullptr);

    std::vector<ChainRecord> records;
    if (count > 0) {
        std::vector<uint64_t> starts(count);
        std::vector<uint32_t> lens(count);
        clEnqueueReadBuffer(queue_, d_starts, CL_TRUE, 0, count * sizeof(uint64_t), starts.data(), 0, nullptr, nullptr);
        clEnqueueReadBuffer(queue_, d_lens, CL_TRUE, 0, count * sizeof(uint32_t), lens.data(), 0, nullptr, nullptr);
        for (uint32_t i = 0; i < count; i++) {
            ChainRecord rec;
            rec.start = starts[i];
            uint32_t len = lens[i];
            if (len & 0x80000000) {
                rec.type = 2;
                rec.length = len & 0x7FFFFFFF;
            } else {
                rec.type = 1;
                rec.length = len;
            }
            records.push_back(rec);
        }
    }

    clReleaseMemObject(d_primes);
    clReleaseMemObject(d_starts);
    clReleaseMemObject(d_lens);
    clReleaseMemObject(d_count);

    return records;
}