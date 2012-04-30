import sys

from flask import Flask
app = Flask(__name__)
from flask import render_template

@app.route('/')
def demo1():
    return render_template('demo1.html')

@app.route('/client')
def client():
    return render_template('client.html')


if __name__ == '__main__':
    app.run(port=int(sys.argv[1]), debug=True)
