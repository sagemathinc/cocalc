"""
HTTP Session Service
"""

import subprocess, sys, time, urllib2

from flask import Flask, request
app = Flask(__name__)

app_port = 5000 # default

from http_session import post


def launch_compute_session(port, output_url='debug', timeout=5):
    """
    Launch a compute server listening on the given port, and return
    its UNIX process id and absolute path.
    """
    if output_url == 'debug':
        output_url = "http://localhost:%s/debug"%app_port
    args = ['python',
            'http_session.py', str(port), 
            'http://localhost:%s/ready/0'%app_port,
            output_url]
    pid = subprocess.Popen(args).pid
    t = time.time()
    # TODO: GET RID OF CRAP BELOW -- instead pass in a temp dir!
    while True:
        try:
            path = urllib2.urlopen('http://localhost:%s/execpath'%port).read()
            break
        except urllib2.URLError, msg:
            if time.time() - t >= timeout:
                try:
                    os.kill(pid, 9)
                except OSError:
                    pass
                return
            time.sleep(0.01)
    return pid, path



@app.route('/new_session')
def new_session():
    return ''

@app.route('/execute/<int:id>', methods=['POST'])
def execute(id):
    if request.method == 'POST':
        if request.form.has_key('code'):
            code = request.form['code']
            try:
                post('http://localhost:5100', {'code':code})
                return 'ok'
            except urllib2.URLError:
                # session not started for some reason
                return 'error - no session'
    return 'error - nothing done'

@app.route('/ready/<int:id>')
def ready(id):
    return ''

@app.route('/interrupt/<int:id>')
def interrupt(id):
    return ''

@app.route('/status/<int:id>')
def status(id):
    return ''

@app.route('/put/<int:id>/<path>', methods=['POST'])
def put(id, path):
    return ''

@app.route('/get/<int:id>/<path>')
def get(id, path):
    return ''

@app.route('/delete/<int:id>/<path>')
def delete(id, path):
    return ''

@app.route('/files/<int:id>')
def files(id):
    return ''

@app.route('/debug', methods=['POST'])
def debug():
    if request.method == 'POST':
        print request.form
    return ''


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print "Usage: %s port"%sys.argv[0]
        sys.exit(1)
    app_port = int(sys.argv[1])
    app.run(debug=True, port=app_port)
