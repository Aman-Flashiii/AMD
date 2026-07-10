#!/bin/bash
cd build
./prime_engine &
cd ..
python3 dashboard/app.py