#ifndef RESULT_STREAMER_H
#define RESULT_STREAMER_H

#include <string>
#include <fstream>
#include <mutex>
#include <vector>
#include <cstdint>

class ResultStreamer {
public:
    ResultStreamer(const std::string& filepath);
    ~ResultStreamer();

    void stream_prime(uint64_t prime);
    void stream_gap(uint64_t gap, uint64_t before, uint64_t after);
    void stream_chain(uint64_t start, uint32_t length, uint8_t type);
    void stream_tuple(uint64_t start, uint32_t type);
    void stream_ap(uint64_t start, uint32_t length);
    void stream_chebyshev(uint64_t count_1_mod_4, uint64_t count_3_mod_4);
    void stream_ulam_batch(const std::vector<int64_t>& xs, const std::vector<int64_t>& ys);
    void stream_stats(uint64_t total_primes, uint64_t c1, uint64_t c3, uint64_t max_gap);
    void flush();

private:
    std::string filepath_;
    std::ofstream file_;
    std::mutex mtx_;
    bool first_write_;
    void write_json(const std::string& json);
};

#endif