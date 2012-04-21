"""
HTTP-based popen -- responsible for launching, interupting and killing
processes.

This is a not-too-scalable HTTP server.  It must be served as a
*single process*, though it could be multithreaded, since it is the
parent of several children processes.  There is nothing special about
the subprocesses that are popen'd having anything to do with Python.
"""

import os, shutil, signal, subprocess, sys, tempfile, threading, time

from misc import is_temp_directory, get, ConnectionError

class Process(object):
    def __init__(self, proc, execpath):
        self.proc = proc
        self.execpath = execpath

# This dictionary will contain all of the processes that we popen.
processes = {}

from flask import Flask, jsonify, request
app = Flask(__name__)

@app.route('/popen')
def popen():
    """
    Open a new subprocess.  The GET parameter is:

    INPUT:

    - ``command`` -- command to run
    
    EXAMPLES::

        >>> r = Runner(5000, idle=1)
        >>> s = get('http://localhost:5000/popen', {'command':'python'}); print s
        {
          "status": "ok", 
          "pid": ..., 
          "execpath": "...tmp..."
        }
        >>> import json; mesg = json.loads(s); mesg
        {u'status': u'ok', u'pid': ..., u'execpath': u'...tmp...'}
        >>> json.loads(get('http://localhost:5000/delete/%s'%mesg['pid']))
        {u'status': u'ok'}
        >>> del r
    """
    if request.method == 'GET':
        return jsonify(popen_process(request.args.get('command')))
    return jsonify({'status':'error'})

def popen_process(command):
    """
    Open a new process as a subprocess of this HTTP server.  Returns a
    JSON message with the pid, execpath and status.

    INPUT:

    - ``command`` -- integer; port that session will listen on

    EXAMPLES::

        >>> p0 = popen_process('python'); p0
        {'status': 'ok', 'pid': ..., 'execpath': '...tmp...'}
        >>> p1 = popen_process('python'); p1
        {'status': 'ok', 'pid': ..., 'execpath': '...tmp...'}
        >>> delete_process(p0['pid']); delete_process(p1['pid'])
    """
    execpath = tempfile.mkdtemp()
    proc = subprocess.Popen(command.split(), cwd=execpath)
    processes[proc.pid] = Process(proc, execpath)
    return {'status':'ok', 'pid':proc.pid, 'execpath':execpath}

def send_signal(pid, sig):
    """
    Send signal to the session with given pid.

    EXAMPLES::

        >>> p = popen_process('python')
        >>> send_signal(p['pid'], signal.SIGINT)
        >>> delete_all_processes()
    """
    if pid not in processes:
        return
    try:
        processes[pid].proc.send_signal(sig)
    except OSError, err:
        pass

def delete_execpath(pid):
    """
    Delete the execpath for the process with given pid.
    
    EXAMPLES::

        >>> p = popen_process('python')
        >>> os.path.isdir(p['execpath'])
        True
        >>> delete_execpath(p['pid'])
        >>> os.path.isdir(p['execpath'])
        False
        >>> delete_all_processes()
    """
    if pid not in processes:
        return
    path = processes[pid].execpath
    if os.path.exists(path):
        shutil.rmtree(path)

def delete_process(pid):
    """
    Send kill signal to process with given pid, and delete execpath.

    EXAMPLES::


        >>> p = popen_process('python')
        >>> os.path.isdir(p['execpath'])
        True
        >>> delete_process(p['pid'])
        >>> os.path.isdir(p['execpath'])
        False
        >>> processes[p['pid']].proc.wait()
        -9
        >>> processes[p['pid']].proc.returncode
        -9
    """
    send_signal(pid, signal.SIGKILL)
    delete_execpath(pid)
    # TODO: is this going to hang the web server? do we need a timeout.
    processes[pid].proc.wait()
    
def delete_all_processes():
    """
    Delete all subprocesses, waiting for them to exit and completely
    cleanup.

    EXAMPLES::

        >>> p0 = popen_process('python')
        >>> p1 = popen_process('python')
        >>> delete_all_processes()
        >>> os.path.isdir(p0['execpath']), os.path.isdir(p1['execpath'])
        (False, False)
        >>> processes[p0['pid']].proc.returncode, processes[p1['pid']].proc.returncode
        (-9, -9)
    """
    for pid in processes:
        delete_process(pid)
    
@app.route('/delete/<int:pid>')
def delete(pid):
    """
    Delete the session with given id. This kills the session process,
    and deletes the files in its execpath.

    EXAMPLES::

        >>> r = Runner(5000, idle=1)
        >>> import json
        >>> s = json.loads(get('http://localhost:5000/popen', {'command':'python'}))
        >>> os.path.isdir(s['execpath'])
        True
        >>> json.loads(get('http://localhost:5000/delete/%s'%s['pid']))
        {u'status': u'ok'}
        >>> os.path.isdir(s['execpath'])
        False
    """
    delete_process(pid)
    # todo -- error if not process with given pid
    return jsonify({'status':'ok'})

@app.route('/sigint/<int:pid>')
def sigint(pid):
    """
    Send one interrupt signal to the given session.

    EXAMPLES::
    
        >>> r = Runner(5000, idle=1)
        >>> import json
        >>> s = json.loads(get('http://localhost:5000/popen', {'command':'python'}))

    There's no easy way to test for sure that the sigint really happened::
    
        >>> json.loads(get('http://localhost:5000/sigint/%s'%s['pid']))
        {u'status': u'ok'}
    """
    send_signal(pid, signal.SIGINT)
    # todo -- error if not process with given pid    
    return jsonify({'status':'ok'})

@app.route('/exitcode/<int:pid>')
def exitcode(pid):
    """
    EXAMPLES::

        >>> r = Runner(5000, idle=1)
        >>> import json
        >>> s = json.loads(get('http://localhost:5000/popen', {'command':'python'}))
        >>> pid = s['pid']
        >>> json.loads(get('http://localhost:5000/exitcode/%s'%pid))
        {u'status': u'ok', u'exitcode': None}
        >>> json.loads(get('http://localhost:5000/delete/%s'%pid))
        {u'status': u'ok'}
        >>> json.loads(get('http://localhost:5000/exitcode/%s'%pid))
        {u'status': u'ok', u'exitcode': -9}
    """
    if pid not in processes:
        return jsonify({'status':'error', 'mesg':'no session with given pid'})
    else:
        return jsonify({'status':'ok', 'exitcode':processes[pid].proc.returncode})

# Todo -- factor out; use same code for frontend.py, and maybe for
# backends too.

class Runner(object):
    def __init__(self, port, idle=None, debug=False):
        """
        Run as a subprocess, wait for http server to start.

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
            0
            >>> r = Runner(5000, idle=1)
        """
        # open a subprocess
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
            try:
                os.kill(self.p.pid, signal.SIGINT)
            except OSError:
                pass
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
        delete_all_processes()
