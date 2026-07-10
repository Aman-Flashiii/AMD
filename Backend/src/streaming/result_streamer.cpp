#include "result_streamer.h"
#include <iostream>
#include <chrono>
#include <sstream>

ResultStreamer::ResultStreamer(const std::string& filepath)
    : filepath_(filepath), first_write_(true) {
    file_.open(filepath_, std::ios::out | std::ios::trunc);
    if (file_.is_open()) file_ << "[" << std::endl;
}

ResultStreamer::~ResultStreamer() {
    if (file_.is_open()) { file_ << "\n]" << std::endl; file_.close(); }
}

void ResultStreamer::write_json(const std::string& json) {
    std::lock_guard<std::mutex> lock(mtx_);
    if (!file_.is_open()) return;
    if (!first_write_) file_ << "," << std::endl;
    first_write_ = false;
    file_ << "  " << json;
    file_.flush();
}

void ResultStreamer::stream_prime(uint64_t prime) {
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"prime\",\"value\":" << prime << ",\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::stream_gap(uint64_t gap, uint64_t before, uint64_t after) {
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"gap\",\"gap\":" << gap << ",\"before\":" << before
       << ",\"after\":" << after << ",\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::stream_chain(uint64_t start, uint32_t length, uint8_t type) {
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"chain\",\"start\":" << start << ",\"length\":" << length
       << ",\"kind\":" << (int)type << ",\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::stream_tuple(uint64_t start, uint32_t type) {
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"tuple\",\"start\":" << start << ",\"kind\":" << type
       << ",\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::stream_ap(uint64_t start, uint32_t length) {
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"ap\",\"start\":" << start << ",\"length\":" << length
       << ",\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::stream_chebyshev(uint64_t c1, uint64_t c3) {
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"chebyshev\",\"c1\":" << c1 << ",\"c3\":" << c3
       << ",\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::stream_ulam_batch(const std::vector<int64_t>& xs, const std::vector<int64_t>& ys) {
    if (xs.empty()) return;
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"ulam_batch\",\"xs\":[";
    for (size_t i = 0; i < xs.size(); i++) {
        if (i > 0) ss << ",";
        ss << xs[i];
    }
    ss << "],\"ys\":[";
    for (size_t i = 0; i < ys.size(); i++) {
        if (i > 0) ss << ",";
        ss << ys[i];
    }
    ss << "],\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::stream_stats(uint64_t total_primes, uint64_t c1, uint64_t c3, uint64_t max_gap) {
    auto now = std::chrono::system_clock::now();
    auto ts = std::chrono::system_clock::to_time_t(now);
    std::stringstream ss;
    ss << "{\"type\":\"stats\",\"total\":" << total_primes
       << ",\"c1\":" << c1 << ",\"c3\":" << c3
       << ",\"max_gap\":" << max_gap
       << ",\"timestamp\":" << ts << "}";
    write_json(ss.str());
}

void ResultStreamer::flush() {
    if (file_.is_open()) file_.flush();
}