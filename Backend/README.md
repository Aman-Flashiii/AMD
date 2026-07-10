# Prime Gap Engine (GPU-Accelerated Compute Engine)

A high-performance C++ engine that utilizes parallel GPU computing (via OpenCL and HIP/ROCm) to search for prime numbers, record prime gaps, Cunningham chains, and statistical prime metrics at scale.

---

## 🚀 Key Features

* **GPU Segmented Sieve**: Implements wheel factorization (mod 30) on the GPU to sieve out composite numbers efficiently.
* **Batch Miller-Rabin**: Conducts deterministic 64-bit primality tests for candidates on the GPU.
* **Cunningham Chains Finder**: Searches for prime sequences of Type 1 ($p_{i+1} = 2p_i + 1$) and Type 2 ($p_{i+1} = 2p_i - 1$) with length $\ge 5$.
* **Gap & Record Tracking**: Analyzes adjacent prime differences to record new maximal prime gaps.
* **Chebyshev Bias Counting**: Computes mod-4 residues of found primes on the host to track the Chebyshev race.
* **Live File Streaming**: Appends results as JSON objects to `/tmp/prime_results.json` (or OS temp directory) for consumer tailing.

---

## 🛠️ Build and Compilation

### Prerequisites
* **CMake** (v3.16+)
* **C++17 Compiler** (GCC 9+, Clang 10+, or MSVC 2019+)
* **OpenCL SDK** (AMD ROCm, NVIDIA CUDA, or Intel OneAPI runtimes)

### Compiling on Linux
```bash
mkdir -p build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)
```

### Compiling on Windows (PowerShell)
```powershell
mkdir build
cd build
cmake ..
cmake --build . --config Release
```

*Note: The build process copies the OpenCL kernels (`kernels/`) to the target build directory so that the executable can locate them relative to its running context.*

---

## ⚙️ Configuration (`src/config/engine_config.h`)

You can tune the engine's operational settings by editing `src/config/engine_config.h` before building:

* `START_RANGE`: Starting number for the prime search range (default is `1000000000000ULL` - 1 Trillion).
* `DEFAULT_BATCH_SIZE`: Candidate numbers processed per GPU kernel execution.
* `MIN_CHAIN_LENGTH`: Minimum chain length of Cunningham chains to report (default is `5`).
* `STREAM_OUTPUT_FILE`: Destination path for the live JSON results stream (default: `/tmp/prime_results.json`).

---

## 🔬 Benchmarking & Scripts

* **`install_deps.sh`**: Installs OpenCL headers, loaders, and development files on Debian/Ubuntu systems, as well as dashboard Python dependencies.
* **`benchmark.sh`**: Runs scalability benchmark iterations by scaling batch workloads. Computes performance statistics and saves results in `benchmark_results.csv`. If Python is installed, it also automatically generates a scaling graph named `benchmark_plot.png`.
* **`run_engine.sh`**: Automatically starts the compute engine and launches the dashboard.

---

## 🧪 Running Tests

The test suite checks the correctness of GPU-based primality and sieving algorithms:
* **`test_primality`**: Unit tests the Miller-Rabin batch kernel against known primes/composites.
* **`test_sieve`**: Validates the GPU Segmented Sieve implementation against a reference CPU Sieve of Eratosthenes across various ranges (including at 1 Trillion).

To build and run tests:
1. Ensure the project is built.
2. Compile and run test files using the targets defined in the build folder:
   ```bash
   # (Assuming build folder)
   ./tests/test_primality
   ```
