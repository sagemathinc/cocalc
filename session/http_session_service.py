"""
HTTP Session Service
"""

from flask import Flask, request
app = Flask(__name__)


@app.route('/new_session')
def new_session():
    push = request.args.get('push', '')
    id = S.new_session(push)
    return id

@app.route('/execute/<int:id>', methods=['POST'])
def execute(id):
    pass

@app.route('/interrupt/<int:id>')
def interrupt(id):
    pass

@app.route('/status/<int:id>')
def status(id):
    pass

@app.route('/put/<int:id>/<path>', methods=['POST'])
def put(id, path):
    pass

@app.route('/get/<int:id>/<path>')
def get(id, path):
    pass

@app.route('/delete/<int:id>/<path>')
def delete(id, path):
    pass

@app.route('/files/<int:id>')
def files(id):
    pass


if __name__ == '__main__':
    app.run(debug=True)
