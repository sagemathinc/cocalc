"""
Backend Spawner

# TODO: rename to something like process_manager

Responsible for launching, interupting and killing backend processes.

This is a not-too-scalable web server.  It is the parent process of
all the child Python compute processes.  It must be served as a
*single process*, though it could be multithreaded.  
"""

import os, shutil, signal, subprocess, sys, tempfile, threading, time

from flask import Flask, jsonify, request
app = Flask(__name__)

from misc import is_temp_directory, get, ConnectionError

class Session(object):
    def __init__(self, proc, execpath):
        self.proc = proc
        self.execpath = execpath

# all the Session objects managed by this backend_spawner.py
sessions = {}

@app.route('/spawn')
def spawn():
    """
    EXAMPLES::

        >>> r = Runner(5000, idle=1)
        >>> data={'port':5001, 'ready_url':'http://localhost:5010/ready', 'output_url':'http://localhost:5010/output', 'id':0}
        >>> s = get('http://localhost:5000/spawn', data); print s
        {
          "status": "ok", 
          "pid": ..., 
          "execpath": "...tmp..."
        }
        >>> import json; mesg = json.loads(s); mesg
        {u'status': u'ok', u'pid': ..., u'execpath': u'...tmp...'}
        >>> json.loads(get('http://localhost:5000/delete/0'))
        {u'status': u'ok'}
        >>> del r
    """
    if request.method == 'GET':
        params = ['port', 'id', 'ready_url', 'output_url']
        return jsonify(spawn_process(*[request.args.get(n) for n in params]))
    return jsonify({'status':'error'})

def spawn_process(port, id, ready_url, output_url):
    """
    Spawn a new backend process with given id that listens for work at
    http://localhost:port and reports on the results of work to
    output_url, and reports that it is ready with all work to
    ready_url.  This backend process is a subprocess of this
    webserver.  Returns a JSON message with the pid, execpath and
    status.

    INPUT:

    - ``port`` -- integer; port that session will listen on
    - ``id`` -- integer; id of session to spawn
    - ``ready_url`` -- string; url that session calls to report that
      it is ready for new work
    - ``ready_url`` -- string; url that session calls to report output
      of computations

    EXAMPLES::

        >>> spawn_process(5001, 0, 'http://localhost:5010/ready', 'http://localhost:5010/output')
        {'status': 'ok', 'pid': ..., 'execpath': '...tmp...'}
        >>> spawn_process(5002, 1, 'http://localhost:5010/ready', 'http://localhost:5010/output')
        {'status': 'ok', 'pid': ..., 'execpath': '...tmp...'}
        >>> delete_session(0)
        >>> delete_session(1)        
    """
    id = int(id)
    if id in sessions:
        delete_session(id)
    execpath = tempfile.mkdtemp()
    args = ['python', 'backend.py',
            str(port), ready_url, output_url, execpath]
    proc = subprocess.Popen(args)
    sessions[id] = Session(proc, execpath)
    return {'status':'ok', 'pid':proc.pid, 'execpath':execpath, 'id':id}

def signal_session(id, sig):
    """
    Send signal to the session with given id.

    EXAMPLES::

        >>> p = spawn_process(5001, 0, 'http://localhost:5010/ready', 'http://localhost:5010/output')
        >>> signal_session(0, signal.SIGINT)
        >>> delete_sessions()
    """
    if id not in sessions:
        return
    try:
        sessions[id].proc.send_signal(sig)
    except OSError, err:
        pass

def delete_session_files(id):
    """
    Delete all files associated with the session with given id.
    
    EXAMPLES::

        >>> p = spawn_process(5001, 0, 'http://localhost:5010/ready', 'http://localhost:5010/output')
        >>> os.path.isdir(p['execpath'])
        True
        >>> delete_session_files(0)
        >>> os.path.isdir(p['execpath'])
        False
        >>> delete_sessions()
    """
    if id not in sessions:
        return
    path = sessions[id].execpath
    if not is_temp_directory(path):
        raise RuntimeError("worrisome path = '%s' appears to not be a temp directory"%path)
    if os.path.exists(path):
        shutil.rmtree(path)

def delete_session(id):
    """
    Send kill signal to session and delete all associated files.

    EXAMPLES::


        >>> p = spawn_process(5001, 0, 'http://localhost:5010/ready', 'http://localhost:5010/output')
        >>> os.path.isdir(p['execpath'])
        True
        >>> delete_session(0)
        >>> os.path.isdir(p['execpath'])
        False
        >>> sessions[0].proc.wait()
        -9
        >>> sessions[0].proc.returncode
        -9
    """
    signal_session(id, signal.SIGKILL)
    delete_session_files(id)
    # TODO: is this going to hang the web server? do we need a timeout.
    sessions[id].proc.wait()
    
def delete_sessions():
    """
    Delete all sessions, waiting for subprocesses to exit and
    completely cleanup. 

    EXAMPLES::

        >>> p0 = spawn_process(5001, 0, 'http://localhost:5010/ready', 'http://localhost:5010/output')
        >>> p1 = spawn_process(5002, 1, 'http://localhost:5010/ready', 'http://localhost:5010/output')
        >>> delete_sessions()
        >>> os.path.isdir(p0['execpath']), os.path.isdir(p1['execpath'])
        (False, False)
        >>> sessions[0].proc.returncode, sessions[1].proc.returncode
        (-9, -9)
    """
    for id in sessions.keys():
        delete_session(id)
    
@app.route('/delete/<int:id>')
def delete(id):
    """
    Delete the session with given id. This kills the session process,
    and deletes the files in its execpath.

    EXAMPLES::

        >>> r = Runner(5000, idle=1)
        >>> data={'port':5001, 'ready_url':'http://localhost:5010/ready', 'output_url':'http://localhost:5010/output', 'id':0}
        >>> import json
        >>> s = json.loads(get('http://localhost:5000/spawn', data))
        >>> os.path.isdir(s['execpath'])
        True
        >>> json.loads(get('http://localhost:5000/delete/0'))
        {u'status': u'ok'}
        >>> os.path.isdir(s['execpath'])
        False
    """
    delete_session(id)
    return jsonify({'status':'ok'})

@app.route('/sigint/<int:id>')
def sigint(id):
    """
    Send one interrupt signal to the given session.

    EXAMPLES::
    
        >>> r = Runner(5000, idle=1)
        >>> data={'port':5001, 'ready_url':'http://localhost:5010/ready', 'output_url':'http://localhost:5010/output', 'id':0}
        >>> import json
        >>> s = json.loads(get('http://localhost:5000/spawn', data))

    There's no easy way to test for sure that the sigint really happened::
    
        >>> json.loads(get('http://localhost:5000/sigint/0'))
        {u'status': u'ok'}
    """
    signal_session(id, signal.SIGINT)
    return jsonify({'status':'ok'})

@app.route('/exitcode/<int:id>')
def exitcode(id):
    """
    EXAMPLES::

        >>> r = Runner(5000, idle=1)
        >>> data={'port':5001, 'ready_url':'http://localhost:5010/ready', 'output_url':'http://localhost:5010/output', 'id':0}
        >>> import json
        >>> s = get('http://localhost:5000/spawn', data)
        >>> json.loads(get('http://localhost:5000/exitcode/0'))
        {u'status': u'ok', u'exitcode': None}
        >>> json.loads(get('http://localhost:5000/delete/0'))
        {u'status': u'ok'}
        >>> json.loads(get('http://localhost:5000/exitcode/0'))
        {u'status': u'ok', u'exitcode': -9}
    """
    if id not in sessions:
        return jsonify({'status':'error', 'mesg':'no session with id'})
    else:
        return jsonify({'status':'ok', 'exitcode':sessions[id].proc.returncode})

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
            0
            >>> r = Runner(5000, idle=1)
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
        delete_sessions()
