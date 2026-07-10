#!/bin/bash
echo "Installing OpenCL dependencies for Intel/AMD/NVIDIA..."

# For Intel: intel-opencl-icd
# For AMD: rocm-opencl-runtime
# For generic: opencl-headers, ocl-icd-libopencl1

# Ubuntu/Debian
sudo apt update
sudo apt install -y opencl-headers ocl-icd-libopencl1 ocl-icd-opencl-dev

# Python deps
pip3 install flask flask-socketio plotly

echo "Installation complete."