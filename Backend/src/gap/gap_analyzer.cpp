#include "gap_analyzer.h"
#include <algorithm>
#include <iostream>

GapAnalyzer::GapAnalyzer() : last_prime_(0), histogram_(256, 0) {
    max_gap_.gap = 0;
    max_gap_.prime_before = 0;
    max_gap_.prime_after = 0;
}

void GapAnalyzer::process_primes(const std::vector<uint64_t>& primes) {
    if (primes.size() < 2) {
        if (!primes.empty()) last_prime_ = primes.back();
        return;
    }

    std::lock_guard<std::mutex> lock(mtx_);

    size_t start_idx = (last_prime_ == 0) ? 1 : 0;
    if (last_prime_ == 0) last_prime_ = primes[0];

    for (size_t i = start_idx; i < primes.size(); i++) {
        uint64_t gap = primes[i] - last_prime_;
        if (gap > max_gap_.gap) {
            max_gap_.gap = gap;
            max_gap_.prime_before = last_prime_;
            max_gap_.prime_after = primes[i];
            std::cout << "[Gap] 🏆 NEW RECORD GAP: " << gap
                      << " between " << last_prime_ << " and " << primes[i] << std::endl;
        }
        // Update histogram
        if (gap < 256) histogram_[gap]++;
        last_prime_ = primes[i];
    }
}

GapRecord GapAnalyzer::get_largest_gap() const {
    std::lock_guard<std::mutex> lock(mtx_);
    return max_gap_;
}

std::vector<uint32_t> GapAnalyzer::get_histogram() const {
    std::lock_guard<std::mutex> lock(mtx_);
    return histogram_;
}

void GapAnalyzer::reset() {
    std::lock_guard<std::mutex> lock(mtx_);
    last_prime_ = 0;
    max_gap_.gap = 0;
    std::fill(histogram_.begin(), histogram_.end(), 0);
}