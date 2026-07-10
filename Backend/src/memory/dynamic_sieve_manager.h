#ifndef DYNAMIC_SIEVE_MANAGER_H
#define DYNAMIC_SIEVE_MANAGER_H

#include <cstdint>

class DynamicSieveManager {
public:
    DynamicSieveManager();
    uint64_t determine_optimal_range(uint64_t requested_range, size_t free_memory);
    uint64_t get_current_batch_size() const;

private:
    uint64_t current_batch_size_;
    double memory_safety_factor_;
};

#endif