"""
HTTP-based popen -- responsible for launching, interupting and killing
processes.

This is a not-too-scalable HTTP server.  It must be served as a
*single process*, though it could be multithreaded, since it is the
parent of several children processes.  There is nothing special about
the subprocesses that are popen'd having anything to do with Python.
"""

import os, shutil, signal, subprocess, sys, tempfile, time

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

        >>> r = Daemon(5000)
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
    if pid not in processes:
        # nothing to do 
        return
    p = processes[pid].proc
    if p.returncode is None:
        p.kill()
        # TODO: is this going to hang the web server? do we need a timeout.
        p.wait()
        # At least on windows subprocess must finish before we can delete its files.
    delete_execpath(pid)
    
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

        >>> r = Daemon(5000)
        >>> import json
        >>> s = json.loads(get('http://localhost:5000/popen', {'command':'python'}))
        >>> os.path.isdir(s['execpath'])
        True
        >>> json.loads(get('http://localhost:5000/delete/%s'%s['pid'], timeout=10))
        {u'status': u'ok'}
        >>> os.path.isdir(s['execpath'])
        False
    """
    delete_process(pid)
    # todo -- error if not process with given pid
    return jsonify({'status':'ok'})

@app.route('/send_signal/<int:pid>/<int:sig>')
def send_signal(pid, sig):
    """
    Send sig signal to the process with pid.

    INPUT:

    - ``pid`` -- integer
    - ``sig`` -- integer
      
    EXAMPLES::
    
        >>> r = Daemon(5000)
        >>> import json
        >>> s = json.loads(get('http://localhost:5000/popen', {'command':'python'}))
        >>> url = 'http://localhost:5000/send_signal/%s/%s'%(s['pid'], signal.SIGINT); url
        'http://localhost:5000/send_signal/.../2'
        >>> print get(url)
        {
          "status": "ok"
        }
    """
    if pid not in processes:
        return jsonify({'status':'error', 'mesg':'no such process'})
    try:
        processes[pid].proc.send_signal(sig)
        return jsonify({'status':'ok'})
    except OSError, err:
        return jsonify({'status':'error', 'mesg':str(err)})

@app.route('/sigint/<int:pid>')
def sigint(pid):
    """
    Send one interrupt signal to the given session.

    EXAMPLES::
    
        >>> r = Daemon(5000)
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

        >>> r = Daemon(5000)
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

class Daemon(object):
    def __init__(self, port, debug=False, pidfile=None):
        """
        Run as a subprocess, wait for http server to start.

        INPUT:

        - ``port`` -- port to listen on
        - ``debug`` -- (default: False) whether or not to start server in
          debug mode
        - ``pidfile`` -- pid of this daemon

        EXAMPLES::

            >>> r = Daemon(5000)
            >>> open(r._pidfile).read()
            '...'
            >>> del r
        """
        if pidfile is None:
            self._pidfile = '%s.pid'%__name__
        else:
            self._pidfile = pidfile
        if os.path.exists(self._pidfile):
            while True:
                try:
                    os.kill(int(open(self._pidfile).read()), signal.SIGKILL)
                    time.sleep(0.05)
                except OSError:
                    # error means process is gone
                    break
                
        # open a subprocess
        self.p = subprocess.Popen(('python %s.py %s %s'%(__name__, port, debug)).split())
        open(self._pidfile, 'w').write(str(self.p.pid))
        # wait for http server to start
        while True:
            try:
                get('http://localhost:%s'%port)
                break
            except ConnectionError:
                time.sleep(0.05)

    def __del__(self):
        if hasattr(self, 'p') and not self.p.returncode:
            try:
                os.kill(self.p.pid, signal.SIGINT)
                self.p.wait()
            except OSError:
                pass # already dead?
        if os.path.exists(self._pidfile):
            os.unlink(self._pidfile)
        

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
