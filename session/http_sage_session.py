"""
A Single HTTP Sage Session Service

"""

import sys

from flask import Flask, request, g
app = Flask(__name__)

globs = {}

@app.route('/', methods=['GET', 'POST'])
def execute():
    if request.method == 'POST':
        code = request.form['code']
        id   = request.form['id']        
        print status_url, push_url
        exec code in globs
        return 'done'
    else:
        return """
        <form action="" method="post">
            <p><input type=text name=id value=0>
            <p><textarea rows=5 cols=100 name=code>print("2+3")</textarea>
            <p><input type=submit value=Submit>
        </form>
        """

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print "Usage: %s status_url push_url"%sys.argv[0]
        sys.exit(1)

    status_url = sys.argv[1]
    push_url = sys.argv[2]
    
    app.run(debug=True)
        

