"""
Subprocess server

The subprocess server launches, signals, and cleans up after
subprocesses.

This is a not-too-scalable HTTP server.  It must be served as a
*single process*, though it could be multithreaded, since it is the
parent of several children processes.  There is nothing special about
the subprocesses that are popen'd having anything to do with Python.
"""

import os, shutil, signal, subprocess, sys, tempfile, time

from misc import is_temp_directory, get, ConnectionError

class Process(object):
    """
    A subprocess of the server, which is represented by a
    subprocess.Popen object and an execpath.
    """
    def __init__(self, proc, execpath):
        """
        INPUT:

        - ``proc`` -- subprocess.Popen
        - ``execpath`` -- string
        
        EXAMPLES::

            sage: p = Process(subprocess.Popen('pwd'), os.path.abspath(os.curdir))
            /Users/wstein/Dropbox/sage/sagews/site
            sage: p.proc
            <subprocess.Popen object at 0x...>
            sage: p.execpath == os.path.abspath(os.curdir)
            True
        """
        self.proc = proc
        self.execpath = execpath

# processes is a dictionary that contains all of the subprocesses that
# we popen:
processes = {}


#############################################################
# Basic functionality -- opening and deleting processes 
#############################################################

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
        >>> close_process(p0['pid']); close_process(p1['pid'])
    """
    execpath = tempfile.mkdtemp()
    if sys.platform == 'win32':
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        creationflags = 0
    proc = subprocess.Popen(command.split(), cwd=execpath, 
                creationflags=creationflags)
    processes[proc.pid] = Process(proc, execpath)
    return {'status':'ok', 'pid':proc.pid, 'execpath':execpath}

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
        >>> close_all_processes()
    """
    if pid not in processes:
        # nothing to do 
        raise IndexError, "no known process with pid %s"%pid

    path = processes[pid].execpath
    if os.path.exists(path):
        try:
            shutil.rmtree(path)
        except OSError:
            pass

def close_process(pid):
    """
    Send kill signal to process with given pid, and delete execpath.

    EXAMPLES::

        >>> p = popen_process('python')
        >>> os.path.isdir(p['execpath'])
        True
        >>> close_process(p['pid'])
        >>> os.path.isdir(p['execpath'])
        False
        >>> w = processes[p['pid']].proc.wait()    # output OS dependent
        >>> processes[p['pid']].proc.returncode is not None
        True
    """
    if pid not in processes:
        # nothing to do 
        raise IndexError, "no known process with pid %s"%pid
    
    delete_execpath(pid)
    
    p = processes[pid].proc
    if p.returncode is None:
        try:
            p.terminate()
            # TODO: is this going to hang the web server? do we need a timeout.
            p.wait() 
        except Exception, msg:
            # Maybe process already dead (sometimes happens on windows)
            print msg
    
def close_all_processes():
    """
    Close all subprocesses, waiting for them to exit and completely
    cleanup.

    EXAMPLES::

        >>> p0 = popen_process('python')
        >>> p1 = popen_process('python')
        >>> close_all_processes()
        >>> os.path.isdir(p0['execpath']), os.path.isdir(p1['execpath'])
        (False, False)
        >>> processes[p0['pid']].proc.returncode is not None, processes[p1['pid']].proc.returncode is not None
        (True, True)
    """
    for pid in processes:
        close_process(pid)
        

#############################################################
# Define the HTTP routes
#############################################################

# the HTTP server is served using flask:
from flask import Flask, jsonify, request
app = Flask(__name__)

@app.route('/popen')
def popen():
    """
    Open a new subprocess.  The GET parameter is:

    INPUT:

    - ``command`` -- command to run
    
    EXAMPLES::

        >>> r = Daemon(5100)
        >>> s = get('http://localhost:5100/popen', {'command':'python'}); print s
        {
          "status": "ok", 
          "pid": ..., 
          "execpath": "...tmp..."
        }
        >>> import json; mesg = json.loads(s); mesg
        {u'status': u'ok', u'pid': ..., u'execpath': u'...tmp...'}
        >>> json.loads(get('http://localhost:5100/close/%s'%mesg['pid']))
        {u'status': u'ok'}
        >>> del r
    """
    if request.method == 'GET':
        try:
            return jsonify(popen_process(request.args.get('command')))
        except Exception, msg:
            return jsonify({'status':'error', 'mesg':str(msg)})
            
    return jsonify({'status':'error', 'mesg':'must use GET with "command" arg'})

    
@app.route('/close/<int:pid>')
def close(pid):
    """
    Close the session with given pid, killing the session process and
    deleting the files in its execpath.

    EXAMPLES::

        >>> r = Daemon(5100)
        >>> import json
        >>> s = json.loads(get('http://localhost:5100/popen', {'command':'python'})); s
        {u'status': u'ok', u'pid': ..., u'execpath': u'...tmp...'}
        >>> os.path.isdir(s['execpath'])
        True
        >>> time.sleep(1)
        >>> print get('http://localhost:5100/close/%s'%s['pid'], timeout=10)
        {
          "status": "ok"
        }
        >>> os.path.isdir(s['execpath'])
        False
    """
    try:
        close_process(pid)
    except Exception, mesg:
        return jsonify({'status':'error', 'mesg':str(mesg)})
    return jsonify({'status':'ok'})

@app.route('/send_signal/<int:pid>/<int:sig>')
def send_signal(pid, sig):
    """
    Send sig signal to the process with pid.

    INPUT:

    - ``pid`` -- integer
    - ``sig`` -- integer
      
    EXAMPLES::
    
        >>> r = Daemon(5100)
        >>> import json
        >>> s = json.loads(get('http://localhost:5100/popen', {'command':'python'}))
        >>> url = 'http://localhost:5100/send_signal/%s/%s'%(s['pid'], signal.SIGINT); url
        'http://localhost:5100/send_signal/.../2'
        >>> print get(url)
        {
          "status": "ok"
        }
    """
    if pid not in processes:
        return jsonify({'status':'error', 'mesg':'no such process'})
    
    if sys.platform == 'win32' and sig == signal.SIGINT:
        sig = signal.CTRL_C_EVENT
        
    try:
        processes[pid].proc.send_signal(sig)
        return jsonify({'status':'ok'})
    except Exception, err:
        return jsonify({'status':'error', 'mesg':str(err)})

@app.route('/exitcode/<int:pid>')
def exitcode(pid):
    """
    EXAMPLES::

        >>> r = Daemon(5100)
        >>> import json
        >>> s = json.loads(get('http://localhost:5100/popen', {'command':'python'}))
        >>> pid = s['pid']
        >>> json.loads(get('http://localhost:5100/exitcode/%s'%pid))
        {u'status': u'ok', u'exitcode': None}
        >>> json.loads(get('http://localhost:5100/close/%s'%pid))
        {u'status': u'ok'}
        >>> a = json.loads(get('http://localhost:5100/exitcode/%s'%pid)); a   # exitcode is OS dependent
        {u'status': u'ok', u'exitcode': ...}
        >>> # TODO: a['exitcode'] is not None
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

            >>> r = Daemon(5100)
            >>> open(r._pidfile).read()
            '...'
            >>> del r
        """
        if pidfile is None:
            self._pidfile = '%s-%s.pid'%(__name__, port)
        else:
            self._pidfile = pidfile
        if os.path.exists(self._pidfile):
            max_tries = 10
            while True:
                max_tries -= 1
                if max_tries == 0:
                    break # TODO: here we should just check that it is a zombie
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
        close_all_processes()
