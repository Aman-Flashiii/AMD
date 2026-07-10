cmake_minimum_required(VERSION 3.16)
project(PrimeGapEngineOpenCL)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find OpenCL
find_package(OpenCL REQUIRED)
if(NOT OpenCL_FOUND)
    message(FATAL_ERROR "OpenCL not found! Install Intel/AMD/NVIDIA OpenCL runtime.")
endif()

include_directories(${OpenCL_INCLUDE_DIRS})
link_directories(${OpenCL_LIBRARY_DIRS})

# Set source files
set(SOURCES
    src/main.cpp
    src/OpenCLEngine.cpp
    src/MathHelpers.cpp
    src/DataStreamer.cpp
)

add_executable(prime_engine ${SOURCES})
target_link_libraries(prime_engine ${OpenCL_LIBRARIES} pthread)

# Copy kernels and dashboard to build folder
add_custom_command(TARGET prime_engine POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    ${CMAKE_CURRENT_SOURCE_DIR}/kernels
    ${CMAKE_CURRENT_BINARY_DIR}/kernels
)
add_custom_command(TARGET prime_engine POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    ${CMAKE_CURRENT_SOURCE_DIR}/dashboard
    ${CMAKE_CURRENT_BINARY_DIR}/dashboard
)