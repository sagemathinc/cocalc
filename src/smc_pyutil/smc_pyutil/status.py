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

import json
import os
import sys

SMC = os.environ['SMC']
os.chdir(SMC)

status = {}


def set(prop, val):
    status[prop] = val


def read(prop, filename, strip=False, int_value=False, to_int=False):
    try:
        s = open(filename).read()
        if strip:
            s = s.strip()
        if '.port' in prop:
            try:
                s = int(s)
            except TypeError:
                pass
        if int_value:
            s = int(s.split('=')[1])
        if to_int:
            s = int(s)
        status[prop] = s
    except:
        status[prop] = False


def main():
    for daemon in ['local_hub', 'sage_server', 'console_server']:
        pidfile = os.path.join(os.path.join(SMC, daemon), '%s.pid' % daemon)
        if os.path.exists(pidfile):
            try:
                pid = int(open(pidfile).read())
                os.kill(pid, 0)
                set(daemon + '.pid', pid)
            except:
                set(daemon + '.pid', False)
        else:
            set(daemon + '.pid', False)

    for name in ['secret_token', 'local_hub/local_hub.port', 'local_hub/raw.port',
                 'console_server/console_server.port', 'sage_server/sage_server.port']:
        to_int = 'port' in name
        read(name.split('/')[-1], os.path.join(SMC, name), to_int=to_int)

    print(json.dumps(status))


if __name__ == "__main__":
    main()
