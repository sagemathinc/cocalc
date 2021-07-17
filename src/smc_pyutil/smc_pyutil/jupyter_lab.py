#!/usr/bin/python
# -*- coding: utf-8 -*-

######################################################################
# This is a daemon-ization script for the Jupyter Lab server, for running
# it under a specific URL behind a given proxy server.  It is probably
# only of use directly in https://cocalc.com.
#
# This is written in Python, but that can be any python2 on the system; not the
# Python that the ipython command runs.
#
#
# Copyright (C) 2016, Sagemath Inc.
# 2-clause BSD:
# Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
# 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
# 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
# The views and conclusions contained in the software and documentation are those of the authors and should not be interpreted as representing official policies, either expressed or implied, of the SageMath Project.
######################################################################

from __future__ import absolute_import
from __future__ import print_function
import json, os, random, signal, sys, time


def server_setup():
    global SMC, DATA, DAEMON_FILE, mode, INFO_FILE, info, project_id, base_path, ip
    # start from home directory, since we want daemon to serve all files in that directory tree.
    os.chdir(os.environ['HOME'])

    SMC = os.environ['SMC']

    os.environ["PYTHONUSERBASE"] = os.environ['HOME'] + '/.local'

    DATA = os.path.join(SMC, 'jupyterlab')
    if not os.path.exists(DATA):
        os.makedirs(DATA)

    # When run in Daemon mode, it stores info (e.g., pid, port) in this file, in addition to printing
    # to standard out.  This avoids starting a redundant copy of the daemon, if one is already running.
    DAEMON_FILE = os.path.join(DATA, "daemon.json")

    if len(sys.argv) == 1:
        print("Usage: %s [start/stop/status] normal Jupyter lab options..." %
              sys.argv[0])
        print(
            "If start or stop is given, then runs as a daemon; otherwise, runs in the foreground."
        )
        sys.exit(1)

    mode = sys.argv[1]
    del sys.argv[1]

    INFO_FILE = os.path.join(SMC, 'info.json')
    if os.path.exists(INFO_FILE):
        info = json.loads(open(INFO_FILE).read())
        project_id = info['project_id']
        base_path = info['base_path']
        ip = info['location']['host']
        if ip == 'localhost':
            # Listening on localhost for devel purposes -- NOTE: this is a *VERY* significant security risk!
            ip = '127.0.0.1'
    else:
        project_id = ''
        base_path = '/'
        ip = '127.0.0.1'


def random_port():
    # get an available port; a race condition is possible, but very, very unlikely.
    while True:
        port = random.randint(1025, 65536)
        a = os.popen("netstat -ano|grep %s|grep LISTEN" % port).read()
        if len(a) < 5:
            return port


def command():
    if 'COCALC_JUPYTER_LAB_PORT' in os.environ:
        name = os.environ['COCALC_JUPYTER_LAB_PORT']
        port = int(name)
    else:
        # time consuming/less robust; needed for cocalc-docker.
        port = random_port()
        name = str(port)
    if project_id:
        b = os.path.join(base_path, project_id, 'port', 'jupyterlab')
        base = " --NotebookApp.base_url=%s " % (b)
    else:
        base = ''

    # --NotebookApp.iopub_data_rate_limit=<Float>
    #     Default: 0
    #     (bytes/sec) Maximum rate at which messages can be sent on iopub before they
    #     are limited.
    # --NotebookApp.iopub_msg_rate_limit=<Float>
    #     (msg/sec) Maximum rate at which messages can be sent on iopub before they
    #     are limited.
    # --NotebookApp.allow_remote_access=True
    #     is suddenly needed, at least for cocalc-docker.

    cmd = "jupyter lab --port-retries=0 --no-browser --NotebookApp.iopub_data_rate_limit=2000000 --NotebookApp.iopub_msg_rate_limit=50 --NotebookApp.mathjax_url=/cdn/mathjax/MathJax.js %s --ip=%s --port=%s --NotebookApp.token='' --NotebookApp.password='' --NotebookApp.allow_remote_access=True" % (
        base, ip, port)
    return cmd, base, port


if '--help' in ''.join(sys.argv):
    os.system("jupyter lab " + ' '.join(sys.argv))
    sys.exit(0)


def is_daemon_running():
    if not os.path.exists(DAEMON_FILE):
        return False
    try:
        s = open(DAEMON_FILE).read()
        info = json.loads(s)
        try:
            os.kill(info['pid'], 0)
            # process exists
            return info
        except OSError:
            # error if no process
            return False
    except:
        # status file corrupted, so ignore it, and
        # just fall through to the below....
        return False


def action(mode):
    sys.stdout.flush()

    if mode == 'status':
        info = is_daemon_running()
        if info:
            info['status'] = 'running'
            s = info
        else:
            s = {'status': 'stopped'}
        print(json.dumps(s))
        return

    elif mode == 'start':
        if os.path.exists(DAEMON_FILE) and time.time() - os.path.getmtime(
                DAEMON_FILE) < 60:
            # If we just tried to start then called again, wait a bit before checking
            # on process.  Note that this should never happen, since local_hub doesn't
            # call this script repeatedly.
            time.sleep(10)

        info = is_daemon_running()
        if info:
            # already running -- nothing to do
            print(json.dumps(info))
            return

        # The below approach to finding the PID is *HIDEOUS* and could in theory break.
        # It is the only way I could come up with to do this without modifying source code of ipython :-(
        # See http://mail.scipy.org/pipermail/ipython-user/2012-May/010043.html
        cmd, base, port = command()

        c = '%s 2> "%s"/jupyter-lab.err 1>"%s"/jupyter-lab.log &' % (cmd, DATA,
                                                                     DATA)
        sys.stderr.write(c + '\n')
        sys.stderr.flush()
        os.system(c)

        s = json.dumps({'base': base, 'port': port})
        open(DAEMON_FILE, 'w').write(s)

        tries = 0
        pid = 0
        #sys.stderr.write("getting pid...\n"); sys.stderr.flush()
        wait = 1
        while not pid:
            tries += 1
            #sys.stderr.write("tries... %s\n"%tries); sys.stderr.flush()
            if tries >= 20:
                print(
                    (json.dumps({"error":
                                 "Failed to find pid of subprocess."})))
                sys.exit(1)

            c = "ps -u`whoami` -o pid,cmd|grep 'jupyter-lab' |grep port={port}".format(
                port=port)  # port is to disambiguate for cc-in-cc dev use...
            for s in os.popen(c).read().splitlines():
                v = s.split()
                if len(v) < 2 or not v[1].split('/')[-1].startswith('python'):
                    continue
                p = int(v[0])
                if "port=%s" % port not in s:
                    try:
                        os.kill(
                            p, 9
                        )  # kill any other ipython notebook servers by this user
                    except:
                        pass
                else:
                    pid = p
            if not pid:
                time.sleep(wait)
                wait *= 1.2
                wait = min(wait, 10)

        s = json.dumps({'base': base, 'port': port, 'pid': pid})
        print(s)
        open(DAEMON_FILE, 'w').write(s)
        return

    elif mode == 'stop':
        info = is_daemon_running()
        if not info:
            # not running -- nothing to do
            return
        # IPython server seems rock solid about responding to kill signals and properly cleaning up.
        try:
            os.kill(info['pid'], signal.SIGTERM)
        except OSError:  # maybe already dead
            pass
        try:
            os.unlink(DAEMON_FILE)
        except:
            pass
        return

    elif mode == 'restart':
        action('stop')
        action('start')

    else:
        raise RuntimeError("unknown command '%s'" % mode)


def main():
    server_setup()
    action(mode)


if __name__ == "__main__":
    main()
