"""
Backend Spawner

Responsible for launching and killing Python processes.

This is a not-too-scalable web server.  It is the parent process of
all the child Python compute processes.  It must be served as a single
process, though it can be multithreaded.
"""

import signal, subprocess, sys

from flask import Flask, jsonify
app = Flask(__name__)

@app.route('/spawn')
def spawn():
    if request.method == 'GET':
        params = ['port', 'session_id', 'finished_url', 'output_url']
        return spawn_process(*[request.args.get(n,'') for n in params])

def spawn_process(port, session_id, finished_url, output_url):
    """
    Spawn a new backend process with given session_id that listens for
    work at http://localhost:port and reports on the results of work
    to output_url, and reports that it is finished with all work to
    finished_url.  This process is a subprocess of this webserver.
    Returns a JSON message with the pid, execpath and status.
    """
    execpath = tempfile.mkdtemp()
    args = ['python', 'backend.py',
            port, finished_url, output_url, execpath]
    pid = subprocess.Popen(args).pid
    t = time.time()
    return jsonify({'status':'ok', 'pid':pid, 'execpath':execpath})
    
@app.route('/kill')
def sigkill():
    return jsonify({'status':'ok'})

@app.route('/interrupt')
def sigint():
    return jsonify({'status':'ok'})

def run(port):
    app.run(port=port)

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print "Usage: %s PORT"%sys.argv[0]
        sys.exit(1)
    port = int(sys.argv[1])
    run(port)
    
