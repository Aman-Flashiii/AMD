#include "opencl_utils.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <cstdlib>

bool load_program_source(const std::string& filepath, std::string& source) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        std::cerr << "Failed to open kernel file: " << filepath << std::endl;
        return false;
    }
    std::stringstream ss;
    ss << file.rdbuf();
    source = ss.str();
    return true;
}

cl_program build_program(cl_context context, cl_device_id device, const std::string& source) {
    const char* src = source.c_str();
    size_t len = source.length();
    cl_int err;
    cl_program prog = clCreateProgramWithSource(context, 1, &src, &len, &err);
    check_cl_error(err, "clCreateProgramWithSource");
    err = clBuildProgram(prog, 1, &device, "-cl-std=CL1.2", nullptr, nullptr);
    if (err != CL_SUCCESS) {
        size_t log_size;
        clGetProgramBuildInfo(prog, device, CL_PROGRAM_BUILD_LOG, 0, nullptr, &log_size);
        std::vector<char> log(log_size + 1);
        clGetProgramBuildInfo(prog, device, CL_PROGRAM_BUILD_LOG, log_size, log.data(), nullptr);
        std::cerr << "Build error:\n" << log.data() << std::endl;
        return nullptr;
    }
    return prog;
}

cl_kernel create_kernel(cl_program program, const char* name) {
    cl_int err;
    cl_kernel ker = clCreateKernel(program, name, &err);
    check_cl_error(err, "clCreateKernel");
    return ker;
}

cl_mem create_buffer(cl_context context, cl_mem_flags flags, size_t size, void* data) {
    cl_int err;
    cl_mem buf = clCreateBuffer(context, flags, size, data, &err);
    check_cl_error(err, "clCreateBuffer");
    return buf;
}

void check_cl_error(cl_int err, const char* msg) {
    if (err != CL_SUCCESS) {
        std::cerr << "OpenCL error (" << msg << "): " << err << std::endl;
        exit(EXIT_FAILURE);
    }
}

void print_device_info(cl_device_id device) {
    char name[256];
    clGetDeviceInfo(device, CL_DEVICE_NAME, sizeof(name), name, nullptr);
    std::cout << "[OpenCL] Running on: " << name << std::endl;
}