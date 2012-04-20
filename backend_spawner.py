"""
Backend Spawner

Responsible for launching, interupting and killing backend processes.

This is a not-too-scalable web server.  It is the parent process of
all the child Python compute processes.  It must be served as a
*single process*, though it could be multithreaded.  
"""

import os, shutil, signal, subprocess, sys, tempfile

from flask import Flask, jsonify, request
app = Flask(__name__)

from misc import is_temp_directory

# process id's of all the sessions
pids = {}
# execpaths of all the sessions
execpaths = {}

@app.route('/spawn')
def spawn():
    if request.method == 'GET':
        params = ['port', 'id', 'ready_url', 'output_url']
        print [request.args.get(n,'') for n in params]
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
    return jsonify({'status':'ok'})

@app.route('/sigint/<int:id>')
def sigint():
    signal_session(id, signal.SIGINT)
    return jsonify({'status':'ok'})

1
def run(port):
    app.run(port=port, debug=True)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print "Usage: %s PORT"%sys.argv[0]
        sys.exit(1)
    port = int(sys.argv[1])
    try:
        run(port)
    finally:
        for id in pids.keys():
            signal_session(id, signal.SIGKILL)
            delete_session(id)    
