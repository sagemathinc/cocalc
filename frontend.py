"""
Workspace Server Frontend
"""

import json, os, signal, shutil, subprocess, sys, tempfile, time, urllib2

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

def reap_session(pid, path):
    try:
        print "kill -9 %s"%pid
        os.kill(pid, 9)
    except:
        pass
    if 'tmp' not in path:
        raise RuntimeError("worrisome path = '%s'"%path)
    if os.path.exists(path):
        shutil.rmtree(path)
    

def cleanup_sessions():
    S = db.session()
    try:
        sessions = S.query(db.Session)
    except orm_exc.NoResultFound:
        # easy case -- no sessions to cleanup; maybe database schema not even made
        return
    
    for z in sessions:
        try:
            reap_session(z.pid, z.path)
        finally:
            S.delete(z)
            S.commit()

    
@app.route('/')
def root():
    # TODO: template that explains the API goes here
    return "Sage Workspaces Server"

@app.route('/new_session')
def new_session():
    """
    Create a new session, and return its id number as the 'id' key of
    the JSON message.
    """
    S = db.session()
    if S.query(db.Session).count() == 0:
        id = 0
        port = app_port + 1
    else:
        last_session = S.query(db.Session).order_by(db.Session.id.desc())[0]
        id = last_session.id + 1
        port = int(last_session.url.split(':')[-1]) + 1
    url = 'http://localhost:%s'%port
    pid, path = launch_compute_session(url=url, id=id)
    if pid == -1:
        msg = {'status':'error', 'data':'failed to create new session'}
    else:
        session = db.Session(id, pid, path, url)
        S.add(session)
        S.commit()
        msg = {'status':'ok', 'id':int(id)}
    return json.dumps(msg)

@app.route('/execute/<int:session_id>', methods=['POST'])
def execute(session_id):
    """
    Create a new cell with given input code, and start it executing in
    the session with given URL.
    """
    if request.method == 'POST' and request.form.has_key('code'):
        code = request.form['code']

        S = db.session()
        
        try:
            # get the session in which to execute this code
            session = S.query(db.Session).filter_by(id=session_id).one()
        except orm_exc.NoResultFound:
            # handle invalid session_id
            return json.dumps({'status':'error', 'data':'unknown session %s'%session_id})
        
        if session.status == 'dead':
            # according to the database, we've had trouble with this session,
            # so just raise an error.  
            return json.dumps({'status':'error', 'data':'session is dead'})
        
        # store the code to evaluate in database.
        cell = db.Cell(session.next_exec_id, session.id, code)
        session.cells.append(cell)
        # increment id for next code execution
        session.next_exec_id += 1
        S.commit()
        msg = {'exec_id':cell.exec_id}

        # if the session is in ready state, that means it has a web server
        # listening and waiting for us to send it something to evaluate.
        if session.status == 'ready':
            try:
                session.last_active_exec_id = cell.exec_id
                session.status = 'running'
                cells = [{'code':cell.code, 'exec_id':cell.exec_id}]
                # TODO: this timeout maybe scares me, since it will
                # lock the server when running in single threaded mode
                # (which we should never do in production).
                post(session.url, {'cells':json.dumps(cells)}, timeout=2)
                msg['cell_status'] = 'running'
                msg['status'] = 'ok'
            except urllib2.URLError:
                # The session not alive and responding as we thought
                # it would be doing, so we mark it is as such in the
                # database, and send it a kill -9 just for good measure.
                session.status = 'dead'
                msg['data'] = 'session is dead'
                msg['status'] = 'error'
                try:
                    reap_session(session.pid, session.path)
                except OSError:
                    pass
            finally:
                S.commit()
        elif session.status == 'running':
            # The calculation is enqueued in the database and will get
            # run (along with everything else that is waiting to run)
            # when the session tells us it is no longer running.
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
        # Iterate over every cell in this session that has not
        # yet been sent off to be computed, and make a list of their
        # code and exec_id's.
        cells = []
        for cell in S.query(db.Cell).filter(
                        db.Cell.exec_id >= session.last_active_exec_id + 1).filter(
                        db.Cell.session_id == session.id).order_by(db.Cell.exec_id):

            cells.append({'code':cell.code, 'exec_id':cell.exec_id})
            
        # Record what will be the last exec_id sent off to be computed.
        session.last_active_exec_id = cells[-1]['exec_id']
        # This session is now supposed to be running, so when new cells
        # come in to be computed, we do not send them off immediately.
        session.status = 'running'
        S.commit()
        return json.dumps(cells)
    
    else:

        # There is nothing waiting to compute, so tell the compute session
        # it should switch to a ready state, and listen on HTTP for more
        # work to do.
        session.status = 'ready'
        S.commit()
        return json.dumps([])

@app.route('/sessions/')
def all_sessions():
    """
    Return JSON representation of all the sessions.
    """
    S = db.session()
    v = [s.to_json() for s in S.query(db.Session).order_by(db.Session.id).all()]
    return json.dumps({'status':'ok', 'data':v})


@app.route('/cells/<int:session_id>')
def cells(session_id):
    """
    Return JSON representation of all cells in the session with given id.
    """
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=session_id).one()
        msg = {'status':'ok', 'data':[cell.to_json() for cell in session.cells]}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%session_id}
    return json.dumps(msg)
    
@app.route('/output_messages/<int:session_id>/<int:exec_id>/<int:number>')
def output_messages(session_id, exec_id, number):
    """
    Return all output messages for the cell with given session_id and
    exec_id, starting with the message labled with the given number.
    """
    S = db.session()
    output_msgs = S.query(db.OutputMsg).filter_by(session_id=session_id, exec_id=exec_id).\
                  filter('number>=:number').params(number=number).\
                  order_by(db.OutputMsg.number)
    data = [{'number':m.number, 'done':m.done, 'output':m.output, 'modified_files':m.modified_files}
              for m in output_msgs]
    return json.dumps({'status':'ok', 'data':data})

def send_signal(id, sig):
    """
    Send signal sig to session with given id. 
    """
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=id).one()
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    else:
        try:
            os.kill(session.pid, sig)
            msg = {'status':'ok'}
        except OSError, err:
            msg = {'status':'error', 'data':str(err)}
    return json.dumps(msg)

@app.route('/sigint/<int:id>')
def signal_interrupt(id):
    """
    Send an interrupt signal to the given session.
    """
    return send_signal(id, signal.SIGINT)

@app.route('/sigkill/<int:id>')
def signal_kill(id):
    """
    Send a kill signal to the given session.
    """
    return send_signal(id, signal.SIGKILL)

@app.route('/status/<int:id>')
def status(id):
    """
    Return the status of the given session as a JSON message:

       {'status':'ok', 'session_status':'ready'}
    """
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=id).one()
        msg = {'status':'ok', 'session_status':session.status}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    return json.dumps(msg)

@app.route('/put/<int:id>/<path>', methods=['POST'])
def put_file(id, path):
    """
    Place the file with attached to the POST variable 'file' in the
    given path in the session with given id.
    """
    # TODO: implement this
    return json.dumps({'status':'error', 'data':'not implemented'})

@app.route('/get/<int:id>/<path>')
def get_file(id, path):
    """
    Return the file in the given path in the session with given id. 
    """
    # TODO: implement this
    return json.dumps({'status':'error', 'data':'not implemented'})    

@app.route('/delete/<int:id>/<path>')
def delete_file(id, path):
    """
    Delete the file with given path in the session with given id.
    """
    # TODO: implement this
    return json.dumps({'status':'error', 'data':'not implemented'})        

@app.route('/files/<int:id>')
def files(id):
    """
    Return a list of all files in the session with given id.
    """
    # TODO: implement this
    return json.dumps({'status':'error', 'data':'not implemented'})            

@app.route('/output/<int:id>', methods=['POST'])
def output(id):
    """
    The compute sessions call this function via a POST request to
    report the output that they produce.  The POST request contains a
    subset of the following fields: 'done', 'output',
    'modified_files'.
    """
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

def run(port=5000, debug=False):
    """
    Run a blocking instance of the frontend server serving on the
    given port.  If debug=True (not the default), then Flask is started
    in debug mode.

    INPUT:
    - ``port`` -- integer (default: 5000)
    - ``debug`` -- bool (default: False)
    """
    port = int(port)

    global app_port
    app_port = int(port)
    
    db.create()
    cleanup_sessions()
    try:
        app.run(port=port, debug=debug)
    finally:
        cleanup_sessions()


class Runner(object):
    """
    Running workspace frontend server.
    
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
        self._server = subprocess.Popen("python %s.py %s 1>server.log 2>server.err"%(__name__, port), shell=True)
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
            # TODO -- do better====
            time.sleep(1)


if __name__ == '__main__':
    if len(sys.argv) == 1:
        print "Usage: %s port [debug]"%sys.argv[0]
        sys.exit(1)
    if len(sys.argv) >= 3:
        debug = eval(sys.argv[2])
    else:
        debug = False
    run(sys.argv[1], debug=debug)

