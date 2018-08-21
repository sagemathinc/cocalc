#!/usr/bin/python

import json, os, sys

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

    for name in [
            'secret_token', 'local_hub/local_hub.port', 'local_hub/raw.port',
            'console_server/console_server.port',
            'sage_server/sage_server.port'
    ]:
        to_int = 'port' in name
        read(name.split('/')[-1], os.path.join(SMC, name), to_int=to_int)

    print json.dumps(status)


if __name__ == "__main__":
    main()
