"""
Workspace Server Frontend
"""

import json, os, signal, subprocess, sys, tempfile, time, urllib2

from flask import Flask, request
app = Flask(__name__)

app_port = 5000 # default

from misc import get, post

import model as db

from sqlalchemy.orm import exc as orm_exc

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
            'backend.py',
            url, 
            'http://localhost:%s/ready/%s'%(app_port, id),
            output_url,
            execpath]
    pid = subprocess.Popen(args).pid
    t = time.time()
    return pid, execpath

def cleanup_sessions():
    try:
        S = db.session()
        sessions = S.query(db.Session).all()
    except:
        # TODO: use meta information again.
        # no sessions in db
        return
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
    
@app.route('/')
def root():
    return "Sage Workspaces Server"

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
    if request.method == 'POST' and request.form.has_key('code'):
        code = request.form['code']

        S = db.session()
        # todo: handle invalid session_id
        session = S.query(db.Session).filter_by(id=session_id).one()
        if session.status == 'dead':
            return json.dumps({'data':'session is dead', 'status':'error'})
        
        # store code in database.
        cell = db.Cell(session.next_exec_id, session.id, code)
        session.cells.append(cell)
        # increment id for next code execution
        session.next_exec_id += 1
        S.commit()
        msg = {'exec_id':cell.exec_id}
        if session.status == 'ready':
            try:
                session.last_active_exec_id = cell.exec_id
                session.status = 'running'
                cells = [{'code':cell.code, 'exec_id':cell.exec_id}]
                # TODO: this timeout scares the shit out of me. 
                post(session.url, {'cells':json.dumps(cells)}, timeout=5)
                msg['cell_status'] = 'running'
                msg['status'] = 'ok'
            except urllib2.URLError:
                # session not alive and responding as we thought it would be doing
                session.status = 'dead'
                msg['data'] = 'session is dead'
                msg['status'] = 'error'
            finally:
                S.commit()
        elif session.status == 'running':
            # do nothing -- the calculation is enqueued in the database
            # and will get run when the running session tells  us it is
            # no longer running.
            msg['status'] = 'ok'
            msg['cell_status'] = 'enqueued'
        else:
            # This should never ever happen -- it would only
            # result from database corruption or a bug.
            raise RuntimeError, "invalid session status (='%s')"%session.status
    else:
        msg['status'] = 'error'
        msg['data'] = 'must POST code variable'
        
    return json.dumps(msg)


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
        
        for cell in S.query(db.Cell).filter(
                        db.Cell.exec_id >= session.last_active_exec_id + 1).filter(
                        db.Cell.session_id == session.id).order_by(db.Cell.exec_id):

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
def all_sessions():
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
    

@app.route('/cells/<int:session_id>')
def cells(session_id):
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=session_id).one()
        msg = {'status':'ok',
               'data':[{'exec_id':cell.exec_id, 'code':cell.code,
                'output':[{'done':o.done, 'output':o.output,
                           'modified_files':o.modified_files} for o in cell.output]}
                       for cell in session.cells]
               }
    except orm_exc.NoResultFound:
        msg = {'status':'error',
               'data':'unknown session %s'%session_id}
    return json.dumps(msg)
    
@app.route('/output_messages/<int:session_id>/<int:exec_id>/<int:number>')
def output_messages(session_id, exec_id, number):
    """
    Return all output messages of at least the number for the cell
    with given session_id and exec_id.
    """
    S = db.session()
    output_msgs = S.query(db.OutputMsg).filter_by(session_id=session_id, exec_id=exec_id).\
                  filter('number>=:number').params(number=number).\
                  order_by(db.OutputMsg.number)
    data = [{'number':number, 'done':m.done, 'output':m.output, 'modified_files':m.modified_files}
              for m in output_msgs]
    return json.dumps({'status':'ok', 'data':data})

@app.route('/sigint/<int:id>')
def signal_interrupt(id):
    # todo: add error handling
    S = db.session()
    session = S.query(db.Session).filter_by(id=id).one()
    os.kill(session.pid, signal.SIGINT)
    return 'ok'

@app.route('/sigkill/<int:id>')
def signal_kill(id):
    # todo: add error handling
    S = db.session()
    session = S.query(db.Session).filter_by(id=id).one()
    os.kill(session.pid, signal.SIGKILL)
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
        try:
            S = db.session()
            m = request.form
            exec_id = m['exec_id']
            cell = S.query(db.Cell).filter_by(exec_id=exec_id, session_id=id).one()
            msg = db.OutputMsg(number=len(cell.output), exec_id=exec_id, session_id=id)
            if 'done' in m:
                msg.done = False if m['done'] == u'False' else True
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

def run(port=5000):
    port = int(port)
    
    global app_port
    app_port = int(port)
    
    db.create()
    cleanup_sessions()
    try:
        app.run(port=port, debug=True)
    finally:
        cleanup_sessions()



class Runner(object):
    """
    EXAMPLES::
    
        >>> Runner(5000)
        Workspace Frontend Runner on port 5000
    """
    def __init__(self, port):
        """
        EXAMPLES::

            >>> r = Runner(5001)
            >>> type(r)
            <class 'frontend.Runner'>
            >>> r._port
            5001
            >>> r._server
            <subprocess.Popen object at 0x...>
        """
        self._port = port
        self._server = subprocess.Popen("python %s.py %s"%(__name__, port), shell=True)
        while True:
            # Next wait to see if it is listening.
            try:
                get('http://localhost:%s/'%port)
            except urllib2.URLError:
                time.sleep(0.1)
                # Ensure that the process is actually running, to
                # avoid an infinite loop trying to get from a URL
                # that will never come alive. 
                try:
                    os.kill(self._server.pid, 0)
                except OSError:
                    raise RuntimeError, "unable to start frontend"
            else:
                # It is listening - done!
                break

    def __repr__(self):
        """
        EXAMPLES::

            >>> Runner(5002).__repr__()
            'Workspace Frontend Runner on port 5002'
        """
        return "Workspace Frontend Runner on port %s"%self._port
        
    def __del__(self):
        try:
            self.kill()
        except:
            pass

    def kill(self):
        """
        Terminate the server subprocess.
        
        EXAMPLES:

            >>> r = Runner(5000)
            >>> r.kill()
        """
        cleanup_sessions()
        if hasattr(self, '_server'):
            for i in range(10):
                try:
                    os.kill(self._server.pid, signal.SIGTERM)
                except:
                    pass
                try:
                    os.kill(self._server.pid, signal.SIGKILL)
                except:
                    pass
            # TODO -- do better
            time.sleep(1)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print "Usage: %s port"%sys.argv[0]
        sys.exit(1)
    run(sys.argv[1])

