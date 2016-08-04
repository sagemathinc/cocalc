#!/usr/bin/env python

import time, os

os.system("service ssh start&")

while True:
    print("sleeping...")
    time.sleep(30)

