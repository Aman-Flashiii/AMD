#ifndef OPENCL_UTILS_H
#define OPENCL_UTILS_H

#ifdef __APPLE__
#include <OpenCL/opencl.h>
#else
#include <CL/cl.h>
#endif

#include <string>
#include <vector>

bool load_program_source(const std::string& filepath, std::string& source);
cl_program build_program(cl_context context, cl_device_id device, const std::string& source);
cl_kernel create_kernel(cl_program program, const char* name);
cl_mem create_buffer(cl_context context, cl_mem_flags flags, size_t size, void* data = nullptr);
void check_cl_error(cl_int err, const char* msg);
void print_device_info(cl_device_id device);

#endif