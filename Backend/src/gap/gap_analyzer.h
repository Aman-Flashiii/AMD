#ifndef GAP_ANALYZER_H
#define GAP_ANALYZER_H

#include <vector>
#include <cstdint>
#include <mutex>

struct GapRecord {
    uint64_t gap;
    uint64_t prime_before;
    uint64_t prime_after;
};

class GapAnalyzer {
public:
    GapAnalyzer();
    void process_primes(const std::vector<uint64_t>& primes);
    GapRecord get_largest_gap() const;
    std::vector<uint32_t> get_histogram() const; // histogram for gaps up to 256
    void reset();

private:
    uint64_t last_prime_;
    GapRecord max_gap_;
    std::vector<uint32_t> histogram_; // 256 bins
    mutable std::mutex mtx_;
};

#endif