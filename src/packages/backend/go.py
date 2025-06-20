#!/usr/bin/env python3
import subprocess
from concurrent.futures import ThreadPoolExecutor

batch = 1
max_workers = 40
commands = [f"node all.cjs {i} {i+batch} {batch}" for i in range(3000, 28000, batch)]

def run_command(cmd):
    return subprocess.run(cmd, shell=True)

with ThreadPoolExecutor(max_workers=max_workers) as executor:
    futures = [executor.submit(run_command, cmd) for cmd in commands]

    # Optionally wait for all to finish
    for future in futures:
        future.result()
