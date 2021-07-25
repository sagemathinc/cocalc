#!/usr/bin/python
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – read LICENSE.md for details

from __future__ import absolute_import, print_function
import json, os, time

REMOTE_TIMEOUT_S = 90
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


def local_status():
    for [daemon, pidfile] in [['project', 'project.pid'],
                              ['sage_server', 'sage_server/sage_server.pid']]:
        if os.path.exists(pidfile):
            try:
                pid = int(open(pidfile).read())
                os.kill(pid, 0)
                set(daemon + '.pid', pid)
            except:
                set(daemon + '.pid', False)
        else:
            set(daemon + '.pid', False)

    for name in [
            'api-server.port', 'browser-server.port', 'hub-server.port',
            'secret_token'
    ]:
        to_int = 'port' in name
        read(name.split('/')[-1], os.path.join(SMC, name), to_int=to_int)


def remote_status():
    """
    If there is a file ~/.smc/remote that is recent, then this project is assumed
    to be running "remote compute", so we stop the local hub and output the contents
    of the file ~/.smc/remote.
    """
    remote = os.path.join(SMC, "remote")
    if not os.path.exists(remote):
        return False
    if time.time() - os.path.getmtime(remote) >= REMOTE_TIMEOUT_S:
        return False
    return json.loads(open(remote).read())


def main():
    s = remote_status()
    if s:
        x = s
    else:
        local_status()
        x = status
    print(json.dumps(x))


if __name__ == "__main__":
    main()
