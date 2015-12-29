#!/usr/bin/env python3

###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014--2015, SageMathCloud Authors
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

import os
import sys
import time

if not 'SMC' in os.environ:
    os.environ['SMC'] = os.path.join(os.environ['HOME'], '.smc')
SMC = os.environ['SMC']
if not os.path.exists(SMC):
    os.makedirs(SMC)

# ensure that PATH starts with ~/bin, so user can customize what gets run
os.environ['PATH'] = "%s:%s" % (os.path.join(os.environ['HOME'], 'bin'), os.environ['PATH'])


def cmd(s):
    print(s)
    if os.system(s):
        sys.exit(1)


def create_root_link():
    root_link = os.path.join(SMC, "root")
    if not os.path.exists(root_link):
        try:
            cmd("cd '%s'; ln -s / root" % SMC)
        except:
            print("WARNING: problem making root link")


def started():
    return os.path.exists("%s/local_hub/local_hub.port" % SMC)


def main():
    create_root_link()

    # Start local hub server
    cmd("smc-local-hub start")

    i = 0
    while not started():
        time.sleep(0.1)
        i += 1
        print(i, end=' ')
        sys.stdout.flush()
        if i >= 100:
            sys.exit(1)

    # Update the ~/.snapshots path symlinks
    from .update_snapshots import update_snapshots
    update_snapshots()

if __name__ == "__main__":
    main()
