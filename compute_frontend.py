"""
HTTP Session Service

killemall compute_backend.py; trash frontend.sqlite3; sage compute_frontend.py 5000
"""

import json, os, subprocess, sys, tempfile, time, urllib2

from flask import Flask, request
app = Flask(__name__)

app_port = 5000 # default

from compute_backend import get, post

import compute_model as db

def launch_compute_session(url, id=id, output_url='output'):
    """
    Launch a compute server listening on the given port, and return
    its UNIX process id and absolute path.
    """
    if output_url == 'output':
        output_url = "http://localhost:%s/output/%s"%(app_port, id)
    execpath = tempfile.mkdtemp()
    # TODO: do this instead by just forking and importing the right
    # module, then running the right function.
    args = ['python',
            'compute_backend.py',
            url, 
            'http://localhost:%s/ready/%s'%(app_port, id),
            output_url,
            execpath]
    pid = subprocess.Popen(args).pid
    t = time.time()
    return pid, execpath

def cleanup_sessions():
    S = db.session()
    sessions = S.query(db.Session).all()
    for z in sessions:
        try:
            print "kill -9 %s"%z.pid
            os.kill(z.pid, 9)
            if os.path.exists(z.path):
                shutil.rmtree(z.path)
        except:
            pass
        finally:
            S.delete(z)
            S.commit()
    
@app.route('/new_session')
def new_session():
    # TODO: add ability to specify the output url
    # TODO: we are assuming for now that compute session is on
    # localhost, but it could be on another machine.
    S = db.session()
    if S.query(db.Session).count() == 0:
        id = 0
        port = app_port + 1
    else:
        last_session = S.query(db.Session).order_by(db.Session.id.desc())[0]
        id = last_session.id + 1
        port = int(last_session.url.split(':')[-1]) + 1
    url = 'http://localhost:%s'%port
    print url
    pid, path = launch_compute_session(url=url, id=id)
    if pid == -1:
        return "fail"
    session = db.Session(id, pid, path, url)
    S.add(session)
    S.commit()
    return str(id)

@app.route('/execute/<int:session_id>', methods=['POST'])
def execute(session_id):
    if request.method == 'POST':
        if request.form.has_key('code'):
            code = request.form['code']
            
            S = db.session()
            # todo: handle invalid session_id
            session = S.query(db.Session).filter_by(id=session_id).one()
            if session.status == 'dead':
                return 'dead'
            # store code in database.
            cell = db.Cell(session.next_exec_id, session.id, code)
            session.cells.append(cell)
            # increment id for next code execution
            session.next_exec_id += 1

            if session.status == 'ready':
                try:
                    session.last_active_exec_id = cell.exec_id
                    session.status = 'running'
                    print "sending code to eval to compute session %s..."%session
                    cells = [{'code':cell.code, 'exec_id':cell.exec_id}]
                    post(session.url, {'cells':json.dumps(cells)}, timeout=10)
                    return 'running'
                except urllib2.URLError:
                    # session not alive and responding as we thought it would be doing
                    session.status = 'dead'
                    return 'dead'
                finally:
                    S.commit()
            elif session.status == 'running':
                # do nothing -- the calculation is enqueued in the database
                # and will get run when the running session tells  us it is
                # no longer running.
                return 'enqueued'
            else:
                raise RuntimeError, "invalid session status (='%s')"%session.status

@app.route('/ready/<int:id>')
def ready(id):

    # The compute session has finished whatever it was doing and is
    # nearly ready for more.  If there is anything left to do, tell it
    # to do all that; otherwise, tell it to wait for a new request
    # when it comes later.
    S = db.session()
    session = S.query(db.Session).filter_by(id=id).one()

    # if there is anything to compute for this session, start it going.
    if session.last_active_exec_id+1 < session.next_exec_id:
        # send all enqueued cells
        cells = []
        for cell in S.query(db.Cell).filter(db.Cell.exec_id >= session.last_active_exec_id + 1
             ).filter(db.Cell.session_id == session.id).order_by(db.Cell.exec_id):
        #for cell in S.query(db.Cell).filter(db.Cell.exec_id >= session.last_active_exec_id + 1,
        #                                    db.Cell.session_id == session.id).order_by(db.Cell.exec_id):
            cells.append({'code':cell.code, 'exec_id':cell.exec_id})
        
        session.last_active_exec_id = cells[-1]['exec_id']
        session.status = 'running'
        S.commit()
        return json.dumps(cells)
    
    else:
        
        session.status = 'ready'
        S.commit()
        # nothing more to do
        return json.dumps([])

@app.route('/sessions/')
def all_sessins():
    # TODO -- JSON and/or proper templates
    S = db.session()
    s = '<pre>'
    for session in S.query(db.Session).order_by(db.Session.id).all():
        s += '<a href="/cells/%s">(cells)</a> '%session.id
        s += str(session) + '\n\n'
    s += '</pre>'
    return s

@app.route('/cells/')
def all_cells():
    # TODO -- JSON and/or proper templates
    S = db.session()
    s = '<pre>'
    for C in S.query(db.Cell).order_by(db.Cell.session_id, db.Cell.exec_id).all():
        s += '<a href="%s">(session %s)</a> '%(C.session_id, C.session_id)
        s += str(C) + '\n\n'
    s += '</pre>'
    return s
    

@app.route('/cells/<int:id>')
def cells(id):
    S = db.session()
    session = S.query(db.Session).filter_by(id=id).one()
    return json.dumps([{'exec_id':c.exec_id, 'code':c.code,
                'output':[{'done':o.done, 'output':o.output,
                           'modified_files':o.modified_files} for o in c.output]}
                for c in session.cells])
    
@app.route('/sigint/<int:id>')
def signal_interrupt(id):
    # todo: add error handling
    S = db.session()
    session = S.query(db.Session).filter_by(id=id).one()
    os.kill(session.pid, 2)  # 2 = INT
    return 'ok'

@app.route('/sigkill/<int:id>')
def signal_kill(id):
    # todo: add error handling
    S = db.session()
    session = S.query(db.Session).filter_by(id=id).one()
    os.kill(session.pid, 9)  # 9 = KILL
    session.status = 'dead'
    S.commit()
    return 'ok'

@app.route('/status/<int:id>')
def status(id):
    return ''

@app.route('/put/<int:id>/<path>', methods=['POST'])
def put_file(id, path):
    return ''

@app.route('/get/<int:id>/<path>')
def get_file(id, path):
    return ''

@app.route('/delete/<int:id>/<path>')
def delete_file(id, path):
    return ''

@app.route('/files/<int:id>')
def files(id):
    return ''

@app.route('/output/<int:id>', methods=['POST'])
def output(id):
    if request.method == 'POST':
        print request.form
        try:
            S = db.session()
            m = request.form
            exec_id = m['exec_id']
            print "id=%s, m=%s"%(id, m)
            cell = S.query(db.Cell).filter_by(exec_id=exec_id, session_id=id).one()
            msg = db.OutputMsg(number=len(cell.output), exec_id=exec_id, session_id=id)
            if 'done' in m:
                msg.done = m['done']
            if 'output' in m:
                msg.output = m['output']
            if 'modified_files' in m:
                msg.modified_files = m['modified_files']
            cell.output.append(msg)
            S.commit()
        except Exception, msg:
            return str(msg)
        return 'ok'
    return 'error'


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print "Usage: %s port"%sys.argv[0]
        sys.exit(1)

    db.create()
    cleanup_sessions()
    app_port = int(sys.argv[1])
    app.run(debug=False, port=app_port)
    
    # TODO: this is wrong below with the try/except, and
    # has something to do with how flask is threaded, maybe.
    try:
        cleanup_sessions()
    except:
        pass
    
########################
class TestAPI(object):
    def __init__(self, port):
        self._port = port
        self._url = 'http://localhost:%s'%port
        
    def new_session(self):
        return get('%s/new_session'%self._url)
    
    def execute(self, session_id, code):
        return post('%s/execute/%s'%(self._url, session_id), {'code':code}, read=True)

    def sigint(self, session_id):
        return get('%s/sigint/%s'%(self._url, session_id))

    def sigkill(self, session_id):
        return get('%s/sigkill/%s'%(self._url, session_id))

    def cells(self, session_id):
        return json.loads(get('%s/cells/%s'%(self._url, session_id)))
        
