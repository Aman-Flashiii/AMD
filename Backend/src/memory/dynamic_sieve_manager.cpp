#include "dynamic_sieve_manager.h"
#include "../config/engine_config.h"
#include <algorithm>

DynamicSieveManager::DynamicSieveManager()
    : current_batch_size_(DEFAULT_BATCH_SIZE), memory_safety_factor_(0.8) {}

uint64_t DynamicSieveManager::determine_optimal_range(uint64_t requested_range, size_t free_memory) {
    // Each number uses 1 bit, but we store 1 byte per residue for simplicity.
    // Actually, we store 1 byte per candidate (sieve array) and also output arrays.
    // Approx memory: sieve_size = range/30 * 8 bytes.
    size_t mem_per_element = 1; // bytes
    size_t max_elements = (size_t)((free_memory * memory_safety_factor_) / mem_per_element);
    // Also account for candidate list and other buffers.
    max_elements /= 2;
    uint64_t optimal = std::min(requested_range, (uint64_t)max_elements);
    // Round to multiple of 30
    optimal = (optimal / 30) * 30;
    if (optimal < 30) optimal = 30;
    current_batch_size_ = optimal;
    return optimal;
}

uint64_t DynamicSieveManager::get_current_batch_size() const {
    return current_batch_size_;
}