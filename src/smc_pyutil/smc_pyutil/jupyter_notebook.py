#!/usr/bin/python

######################################################################
# This is a daemon-ization script for the IPython notebook, for running
# it under a specific URL behind a given proxy server.  It is probably
# only of use directly in https://cloud.sagemath.com.
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


import json, os, random, signal, sys, time

# start from home directory, since we want daemon to serve all files in that directory tree.
os.chdir(os.environ['HOME'])

SMC = os.environ['SMC']

DATA = os.path.join(SMC, 'jupyter')
if not os.path.exists(DATA):
    os.makedirs(DATA)

# When run in Daemon mode, it stores info (e.g., pid, port) in this file, in addition to printing
# to standard out.  This avoids starting a redundant copy of the daemon, if one is already running.
DAEMON_FILE = os.path.join(DATA, "daemon.json")

if len(sys.argv) == 1:
    print "Usage: %s [start/stop/status/run] normal Jupyter notebook options..."%sys.argv[0]
    print "If start or stop is given, then runs as a daemon; otherwise, runs in the foreground."
    sys.exit(1)

mode = sys.argv[1]
del sys.argv[1]

INFO_FILE = os.path.join(SMC, 'info.json')
if os.path.exists(INFO_FILE):
    info = json.loads(open(INFO_FILE).read())
    project_id = info['project_id']
    base_url = info['base_url']
    ip = info['location']['host']
    if ip == 'localhost':
        # Listening on localhost for devel purposes -- NOTE: this is a *VERY* significant security risk!
        ip = '127.0.0.1'
else:
    project_id = ''
    base_url = ''
    ip = '127.0.0.1'

def random_port():
    # get an available port; a race condition is possible, but very, very unlikely.
    while True:
        port = random.randint(1025,65536)
        a = os.popen("netstat -ano|grep %s|grep LISTEN"%port).read()
        if len(a) < 5:
            return port

def command():
    port = random_port()  # time consuming!
    if project_id:
        b = "%s/%s/port/jupyter/"%(base_url, project_id)
        base = " --NotebookApp.base_url=%s --NotebookApp.base_kernel_url=%s "%(b, b)
    else:
        base = ''

    # 2nd argument after "start" ("start" is already eaten, see above)
    if len(sys.argv) >= 2:
        mathjax_url = sys.argv.pop(1)
    else:
        mathjax_url = "/static/mathjax/MathJax.js" # fallback

    # We always use the system-wide version on IPython, which is much easier to keep up to date.
    # Sage's often lags behind with bugs.  This also makes it easier for users to run their
    # own custom IPython.   See https://github.com/sagemathinc/smc/issues/1343
    ##ipython = "ipython"
    # SADLY, rolling this back, since Jupyter 4.3.1 doesn't load properly and
    # in practice turns out to be broken for us.  Oh well.  Reverting everything... :-(
    if os.system('which sage') == 0:
        ipython = "sage -ipython"
    else:
        ipython = "ipython"


    # --NotebookApp.iopub_data_rate_limit=<Float>
    #     Default: 0
    #     (bytes/sec) Maximum rate at which messages can be sent on iopub before they
    #     are limited.
    # --NotebookApp.iopub_msg_rate_limit=<Float>
    #     (msg/sec) Maximum rate at which messages can be sent on iopub before they
    #     are limited.

    cmd = ipython+ " notebook --port-retries=0 --no-browser --NotebookApp.iopub_data_rate_limit=2000000 --NotebookApp.iopub_msg_rate_limit=50 --NotebookApp.mathjax_url=%s %s --ip=%s --port=%s --NotebookApp.token='' --NotebookApp.password=''"%(mathjax_url, base, ip, port)
    cmd += " " + ' '.join(sys.argv[1:])
    return cmd, base, port

if '--help' in ''.join(sys.argv):
    os.system("ipython " + ' '.join(sys.argv))
    sys.exit(0)

def is_daemon_running():
    if not os.path.exists(DAEMON_FILE):
        return False
    try:
        s = open(DAEMON_FILE).read()
        info = json.loads(s)
        try:
            os.kill(info['pid'],0)
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
            s = {'status':'stopped'}
        print json.dumps(s)
        return

    elif mode == 'start':
        if os.path.exists(DAEMON_FILE) and time.time() - os.path.getmtime(DAEMON_FILE) < 60:
            # If we just tried to start then called again, wait a bit before checking
            # on process.  Note that this should never happen, since local_hub doesn't
            # call this script repeatedly.
            time.sleep(10)

        info = is_daemon_running()
        if info:
            # already running -- nothing to do
            print json.dumps(info)
            return

        # The below approach to finding the PID is *HIDEOUS* and could in theory break.
        # It is the only way I could come up with to do this without modifying source code of ipython :-(
        # See http://mail.scipy.org/pipermail/ipython-user/2012-May/010043.html
        cmd, base, port = command()

        c = '%s 2> "%s"/jupyter-notebook.err 1>"%s"/jupyter-notebook.log &'%(cmd, DATA, DATA)
        sys.stderr.write(c+'\n'); sys.stderr.flush()
        os.system(c)

        s = json.dumps({'base':base, 'port':port})
        open(DAEMON_FILE,'w').write(s)

        tries = 0
        pid = 0
        #sys.stderr.write("getting pid...\n"); sys.stderr.flush()
        wait = 1
        while not pid:
            tries += 1
            #sys.stderr.write("tries... %s\n"%tries); sys.stderr.flush()
            if tries >= 20:
                print json.dumps({"error":"Failed to find pid of subprocess."})
                sys.exit(1)

            c = "ps -u`whoami` -o pid,cmd|grep 'ipython notebook'"
            for s in os.popen(c).read().splitlines():
                v = s.split()
                if len(v) < 2 or v[1].split('/')[-1] != 'python':
                    continue
                p = int(v[0])
                if "port=%s"%port not in s:
                    try:
                        os.kill(p, 9)  # kill any other ipython notebook servers by this user
                    except:
                        pass
                else:
                    pid = p
            if not pid:
                time.sleep(wait)
                wait *= 1.2
                wait = min(wait, 10)

        s = json.dumps({'base':base, 'port':port, 'pid':pid})
        print s
        open(DAEMON_FILE,'w').write(s)
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

    elif mode == 'run':
        print cmd + '\n\n'
        print "*"*80 + '\n'
        print "  The IPython Notebook server is running at \n"
        print "      https://cloud.sagemath.com%s\n"%base
        print "  All collaborators on this project may access the notebook at the"
        print "  above SSL-encrypted URL, but nobody else can access it."
        print '\n\n' + "*"*80 + '\n\n'
        os.system(cmd + "  2>&1 | grep -v running ")

    elif mode == 'restart':
        action('stop')
        action('start')

    else:
        raise RuntimeError("unknown command '%s'"%mode)

def main():
    action(mode)
