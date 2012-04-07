"""
HTTP Session Service
"""

import urllib2

from flask import Flask, request
app = Flask(__name__)

from http_session import post

"""
python http_session.py 5100 http://localhost:5000/waiting/0 http://localhost:5000/debug
from http_session import ComputeSession
S = ComputeSession(5100, 'http://localhost:5000/waiting/0', 'http://localhost:5000/debug')
S.run()
"""

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

@app.route('/waiting/<int:id>')
def waiting(id):
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
    app.run(debug=True)
