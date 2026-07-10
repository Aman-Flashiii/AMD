#!/bin/bash
# benchmark.sh - Full performance profiling for AMD ROCm Prime Engine
# Usage: ./benchmark.sh [--start START] [--batch BATCH] [--iterations ITER] [--profile]

set -e

# Default values
START=1000000000000
BATCH=10000000
ITERATIONS=3
PROFILE=0
OUTPUT_CSV="benchmark_results.csv"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --start) START="$2"; shift 2 ;;
        --batch) BATCH="$2"; shift 2 ;;
        --iterations) ITERATIONS="$2"; shift 2 ;;
        --profile) PROFILE=1; shift ;;
        --output) OUTPUT_CSV="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo "========================================="
echo "🚀 AMD ROCm Prime Engine Benchmark"
echo "========================================="
echo "Start Range  : $START"
echo "Batch Size   : $BATCH"
echo "Iterations   : $ITERATIONS"
echo "Profiling    : $([ $PROFILE -eq 1 ] && echo "ON" || echo "OFF")"
echo "========================================="

# Ensure we are in the build directory
if [ ! -f "./prime_engine" ]; then
    echo "⚠️  prime_engine not found. Building..."
    cd ..
    mkdir -p build && cd build
    cmake .. && make -j
else
    echo "✅ Found prime_engine"
fi

# Write CSV header
echo "Iteration,Range_Start,Batch_Size,Total_Primes,Max_Gap,Chains_Found,Elapsed_Seconds,Primes_per_Second,Memory_Used_MB" > $OUTPUT_CSV

# Function to run engine with timeout and capture stats
run_benchmark() {
    local iter=$1
    local start=$2
    local batch=$3
    local profile=$4
    
    echo ""
    echo "--- Iteration $iter ---"
    
    # Start memory monitoring in background (using rocm-smi if available)
    if command -v rocm-smi &> /dev/null; then
        rocm-smi --showmeminfo vram > memory_before.txt
    fi
    
    # Run the engine with a timeout (e.g., 60 seconds per batch)
    # We use `time` to capture elapsed time
    if [ $profile -eq 1 ] && command -v rocprof &> /dev/null; then
        echo "🔬 Running with ROCm Profiler (rocprof)..."
        rocprof --stats --timestamp on ./prime_engine --start=$start --batch=$batch --timeout=60 > profile_output.txt 2>&1
        # Extract kernel stats from rocprof output
        grep -E "Kernel|Duration|Memory" profile_output.txt >> ${OUTPUT_CSV}.profile
    else
        # Run normally and capture time
        START_TIME=$(date +%s.%N)
        ./prime_engine --start=$start --batch=$batch --timeout=60 > engine_output.txt 2>&1
        END_TIME=$(date +%s.%N)
        ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
    fi
    
    # Parse engine output for stats
    TOTAL_PRIMES=$(grep -oP 'Total Primes: \K[0-9]+' engine_output.txt || echo "0")
    MAX_GAP=$(grep -oP 'NEW RECORD GAP: \K[0-9]+' engine_output.txt | tail -1 || echo "0")
    CHAINS=$(grep -oP 'Chain.*length \K[0-9]+' engine_output.txt | wc -l || echo "0")
    
    # Get memory usage
    if command -v rocm-smi &> /dev/null; then
        MEM_USED=$(rocm-smi --showmeminfo vram | grep "VRAM" | awk '{print $NF}' | head -1 || echo "N/A")
    else
        MEM_USED="N/A"
    fi
    
    # Calculate speed
    PRIMES_PER_SEC=$(echo "$TOTAL_PRIMES / $ELAPSED" | bc -l 2>/dev/null || echo "0")
    
    # Append to CSV
    echo "$iter,$start,$batch,$TOTAL_PRIMES,$MAX_GAP,$CHAINS,$ELAPSED,$PRIMES_PER_SEC,$MEM_USED" >> $OUTPUT_CSV
    
    echo "📊 Results: $TOTAL_PRIMES primes in ${ELAPSED}s | ${PRIMES_PER_SEC} primes/sec"
    echo "🏆 Max Gap: $MAX_GAP | Chains: $CHAINS"
}

# Run benchmark iterations
for ((i=1; i<=ITERATIONS; i++)); do
    run_benchmark $i $START $BATCH $PROFILE
    # Increase batch size slightly for next iteration (stress test)
    BATCH=$((BATCH * 2))
done

echo ""
echo "========================================="
echo "✅ Benchmark complete!"
echo "📁 Results saved to: $OUTPUT_CSV"
echo "========================================="
cat $OUTPUT_CSV

# Optional: Generate summary plot if Python is available
if command -v python3 &> /dev/null; then
    echo ""
    echo "Generating summary plot..."
    python3 - <<EOF
import pandas as pd
import matplotlib.pyplot as plt
df = pd.read_csv("$OUTPUT_CSV")
plt.figure(figsize=(10,5))
plt.plot(df["Batch_Size"], df["Primes_per_Second"], marker='o', label='Primes/sec')
plt.xlabel("Batch Size")
plt.ylabel("Primes per Second")
plt.title("AMD ROCm Prime Engine Scaling")
plt.grid(True)
plt.legend()
plt.savefig("benchmark_plot.png")
print("📈 Plot saved as benchmark_plot.png")
EOF
fi