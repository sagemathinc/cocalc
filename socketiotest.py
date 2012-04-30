from gevent import monkey; monkey.patch_all()
from socketio.server import SocketIOServer
from flask import Flask, request, render_template

app = Flask(__name__)

@app.route('/')
def index():
    return 'top level page'

@app.route('/socket.io')
def socket_io():
    app.logger.debug("here")
    return

if __name__ == '__main__':
    import os
    SocketIOServer(('127.0.0.1', 5000), app, namespace="socket.io", policy_server=False).serve_forever()
