#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################



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
