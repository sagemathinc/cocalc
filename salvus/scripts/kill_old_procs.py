#!/usr/bin/env python

# AUTHORS: William Stein and Harald Schilly

# This has never been tested, and I think that for our purposes (on compute machines) it may be a bad idea in practice.


# NOTE: needs psutil, which is a nonstandard package that is absolutely required for this script to work:   pip install psutil

import psutil, time

onedayago = time.time() - 24*60*60

def kill_old():
    for p in psutil.process_iter():
        if p.create_time < onedayago: continue
        if len(p.username) != 8 or p.username == "whoopsie":
            continue
        print "Killing", p
        p.terminate()

def monitor(interval):
    """Run kill_old, then wait interval seconds."""
    try:
        kill_old()
    except Exception, mesg:
        # We really don't want this script to die, ever!
        print "Ignoring exception raised during attempt to kill old -- ", mesg

    time.sleep(interval)

if __name__ == '__main__':
    monitor(1800)
