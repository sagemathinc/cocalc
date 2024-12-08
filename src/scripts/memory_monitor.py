#!/usr/bin/env python3

import psutil
import time
import os

GB = 1024 * 1024 * 1024  # 1 GB in bytes
free = int(os.popen('free -g').read().splitlines()[1].split()[1])
THRESHOLD = (free - 3) * GB

while True:
    print(
        f"checking for processing using more than {THRESHOLD / GB:.2f} GB RAM")
    for proc in psutil.process_iter(['pid', 'memory_info']):
        try:
            if proc.memory_info().rss > THRESHOLD:
                print(
                    f"Killing process {proc.pid} using {proc.memory_info().rss / GB:.2f} GB RAM"
                )
                psutil.Process(proc.pid).kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied,
                psutil.ZombieProcess):
            pass
    print("sleeping 3 seconds")
    time.sleep(3)  # Check every 5 seconds
