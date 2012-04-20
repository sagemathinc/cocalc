"""
Backend Spawner

Responsible for launching, interupting and killing backend processes.

This is a not-too-scalable web server.  It is the parent process of
all the child Python compute processes.  It must be served as a
*single process*, though it could be multithreaded.  
"""

import os, shutil, signal, subprocess, sys, tempfile, threading, time

from flask import Flask, jsonify, request
app = Flask(__name__)

from misc import is_temp_directory, get, ConnectionError

# process id's of all the sessions
pids = {}
# execpaths of all the sessions
execpaths = {}

@app.route('/spawn')
def spawn():
    """
    EXAMPLES::

        >>> r = Runner(5000, idle=1)
        >>> data={'port':5001, 'ready_url':'http://localhost:5010/ready', 'output_url':'http://localhost:5010/output', 'session_id':0}
        >>> import json
        >>> mesg = json.loads(get('http://localhost:5000/spawn', data)); mesg
        {u'status': u'ok', u'pid': ..., u'execpath': u'...tmp...'}
        >>> json.loads(get('http://localhost:5000/sigkill/%s'%mesg['pid']))
        {u'status': u'ok'}
        >>> del r
    """
    if request.method == 'GET':
        params = ['port', 'id', 'ready_url', 'output_url']
        return spawn_process(*[request.args.get(n,'') for n in params])

def spawn_process(port, id, ready_url, output_url):
    """
    Spawn a new backend process with given id that listens for
    work at http://localhost:port and reports on the results of work
    to output_url, and reports that it is ready with all work to
    ready_url.  This process is a subprocess of this webserver.
    Returns a JSON message with the pid, execpath and status.

    EXAMPLES::

    
    
    """
    if id in pids:
        signal_session(id, signal.SIGKILL)
        rmtree_session(id)
        del pids[id]
    execpath = tempfile.mkdtemp()
    args = ['python', 'backend.py',
            port, ready_url, output_url, execpath]
    pid = subprocess.Popen(args).pid
    pids[id] = pid
    execpaths[id] = execpath
    return jsonify({'status':'ok', 'pid':pid, 'execpath':execpath})

def signal_session(id, sig):
    if id not in pids:
        return
    try:
        os.kill(pids[id], sig)
    except OSError, err:
        pass

def delete_session(id):
    if id not in execpaths:
        return
    path = execpaths[id]
    if not is_temp_directory(path):
        raise RuntimeError("worrisome path = '%s' appears to not be a temp directory"%path)
    if os.path.exists(path):
        shutil.rmtree(path)
    del execpaths[id]
    
@app.route('/sigkill/<int:id>')
def sigkill(id):
    signal_session(id, signal.SIGKILL)
    delete_session(id)
    return jsonify({'status':'ok'})

@app.route('/sigint/<int:id>')
def sigint():
    signal_session(id, signal.SIGINT)
    return jsonify({'status':'ok'})

# Todo -- factor out; use same code for frontend.py, and maybe for
# backends too.

class Runner(object):
    def __init__(self, port, idle=None, debug=False):
        """
        Run the backend spawner as a subprocess, wait for http server
        to start.

        INPUT:

        - ``port`` -- port to listen on
        - ``idle`` -- kill subprocess if no CPU activity for this many seconds
        - ``debug`` -- (default: False) whether or not to start server in
          debug mode

        EXAMPLES::

            >>> r = Runner(5000)
            >>> del r
            >>> r = Runner(5000, idle=0.2)
            >>> import time; time.sleep(0.3)
            >>> r.p.returncode
            -9
            >>> r = Runner(5000, idle=1, debug=True)
        """
        # spawn subprocess
        self.p = subprocess.Popen(('python %s.py %s %s'%(__name__, port, debug)).split())
        # wait for http server to start
        while True:
            try:
                get('http://localhost:%s'%port)
                break
            except ConnectionError:
                time.sleep(0.05)
        if idle:
            # Start a thread that will check whether the subprocess has been
            # idle for idle number of seconds.  If so, kill the subprocess.
            self._sub_cputime = sum(os.times()[2:4])
            self._idle = idle
            threading.Timer(self._idle, lambda : self._check_idle()).start()

    def _check_idle(self):
        new_cputime = sum(os.times()[2:4])
        if new_cputime == self._sub_cputime:
            self.__del__()
            return  # don't check anymore
        # record new times
        self._sub_cputime = new_cputime
        # call again after self._idle seconds
        threading.Timer(self._idle, lambda : self._check_idle()).start()

    def __del__(self):
        if not self.p.returncode:
            self.p.kill()
            self.p.wait()
        

if __name__ == '__main__':
    if len(sys.argv) == 1:
        print "Usage: %s port [debug]"%sys.argv[0]
        sys.exit(1)
    port = int(sys.argv[1])
    debug = len(sys.argv) >= 3 and eval(sys.argv[2])
    try:
        app.run(port=port, debug=debug)
    finally:
        for id in pids.keys():
            signal_session(id, signal.SIGKILL)
            delete_session(id)    
