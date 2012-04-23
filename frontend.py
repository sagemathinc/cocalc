"""
Workspace Server Frontend
"""

import json, os, posixpath, signal, shutil, sys, tempfile, time

from flask import Flask, request, safe_join, send_from_directory, jsonify
app = Flask(__name__)

app_port = None # must be set before running
subprocess_port = None

from misc import get, post, ConnectionError, all_files, is_temp_directory

import model as db

from sqlalchemy.orm import exc as orm_exc

def launch_backend_session(port, id=id, output_url='output'):
    """
    Launch a backend session listening on the given port, and return
    its UNIX process id and absolute path.
    """
    if output_url == 'output':
        assert app_port is not None, "you must initialize app_port"        
        output_url = "http://localhost:%s/submit_output/%s"%(app_port, id)
    command = ' '.join(['python',
                        os.path.abspath('backend.py'),
                        str(port), 
                        'http://localhost:%s/ready/%s'%(app_port, id),
                        output_url])

    assert subprocess_port is not None, "you must initialize subprocess_port"
    mesg = json.loads(get('http://localhost:%s/popen'%subprocess_port,
                   {'command':command}))
    pid = mesg['pid']
    execpath = mesg['execpath']
    return pid, execpath

def close_subprocess(pid):
    """
    Send kill signal to the process with given pid.

    EXAMPLES::

    """
    assert subprocess_port is not None, "you must initialize subprocess_port"
    url = 'http://localhost:%s/close/%s'%(subprocess_port, pid)
    return json.loads(get(url))

@app.route('/killall')
def killall():
    S = db.session()
    try:
        sessions = S.query(db.Session)
    except orm_exc.NoResultFound:
        # easy case -- no sessions to cleanup; maybe database schema not even made
        return jsonify({'status':'ok', 'killed':[]})
    except Exception, mesg:
        return jsonify({'status':'error', 'mesg':'db-error: %s'%mesg})

    killed = []
    for session in sessions:
        try:
            close_subprocess(session.pid)
        except Exception, mesg:
            return jsonify({'status':'error', 'mesg':'subprocess-error: %s'%mesg})
        finally:
            S.delete(session)
            S.commit()
            killed.append(session.id)

    return jsonify({'status':'ok', 'killed':killed})

    
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
        assert app_port is not None, "you must initialize app_port"
        port = app_port + 1
    else:
        last_session = S.query(db.Session).order_by(db.Session.id.desc())[0]
        id = last_session.id + 1
        port = int(last_session.url.split(':')[-1]) + 1
    pid, path = launch_backend_session(port=port, id=id)
    if pid == -1:
        msg = {'status':'error', 'data':'failed to create new session'}
    else:
        session = db.Session(id, pid, path, 'http://localhost:%s'%port)
        S.add(session)
        S.commit()
        msg = {'status':'ok', 'id':int(id)}
    return jsonify(msg)

@app.route('/execute/<int:session_id>', methods=['POST'])
def execute(session_id):
    r"""
    Create a new cell with given input code, and start it executing in
    the session with given URL.

    EXAMPLES::
    
        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/killall')  # for doctesting

    We start a session and ask for execution of one cell::

        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'

        >>> misc.post('http://localhost:5000/execute/0', {'code':'print(2+3)'})
        u'{\n  "status": "ok", \n  "exec_id": 0, \n  "cell_status": "running"\n}'

    We request execution of code in a session that does not exist::

        >>> misc.post('http://localhost:5000/execute/389', {'code':'print(2+3)'})
        u'{\n  "status": "error", \n  "data": "unknown session 389"\n}'

    We try a POST request that is missing the code variable, hence
    results in an error::
    
        >>> misc.post('http://localhost:5000/execute/0', {'foo':'bar'})
        u'{\n  "status": "error", \n  "data": "must POST \'code\' variable"\n}'

        >>> z = misc.get('http://localhost:5000/killall')  # for doctesting
    """
    if request.method == 'POST' and request.form.has_key('code'):
        code = request.form['code']

        S = db.session()
        
        try:
            # get the session in which to execute this code
            session = S.query(db.Session).filter_by(id=session_id).one()
        except orm_exc.NoResultFound:
            # handle invalid session_id
            return jsonify({'status':'error', 'data':'unknown session %s'%session_id})
        
        if session.status == 'dead':
            # according to the database, we've had trouble with this session,
            # so just raise an error.  
            return jsonify({'status':'error', 'data':'session is dead'})
        
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
                # This post needs to happen in a forked off "fire and forget" thread...
                tm = time.time()
                while time.time() - tm <= 5:  # try for up to 5 seconds before declaring it dead.
                    try:
                        post(session.url, {'cells':json.dumps(cells)}, timeout=0.1)
                        break
                    except ConnectionError:
                        time.sleep(0.05)
                msg['cell_status'] = 'running'
                msg['status'] = 'ok'
            except ConnectionError:
                # The session not alive and responding as we thought
                # it would be doing, so we mark it is as such in the
                # database, and send it a kill -9 just for good measure.
                session.status = 'dead'
                msg['data'] = 'session is dead'
                msg['status'] = 'error'
                try:
                    close_subprocess(session.pid)
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
        msg = {'status':'error', 'data':"must POST 'code' variable"}
        
    return jsonify(msg)


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
        return jsonify(status='ok', cells=cells)
    
    else:

        # There is nothing waiting to compute, so tell the compute session
        # it should switch to a ready state, and listen on HTTP for more
        # work to do.
        session.status = 'ready'
        S.commit()
        return jsonify(status='done')

@app.route('/sessions/')
def sessions():
    """
    Return JSON representation of all the sessions.

    EXAMPLES::
    
    """
    S = db.session()
    v = [s.to_json() for s in S.query(db.Session).order_by(db.Session.id).all()]
    return jsonify({'status':'ok', 'sessions':v})


@app.route('/session/<int:session_id>')
def session(session_id):
    """
    Return data about session with given id.

    EXAMPLES::
    """
    S = db.session()
    v = S.query(db.Session).filter_by(id=session_id).one().to_json()
    return jsonify({'status':'ok', 'data':v})

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
    return jsonify(msg)
    
@app.route('/output_messages/<int:session_id>/<int:exec_id>/<int:number>')
def output_messages(session_id, exec_id, number):
    r"""
    Return all output messages for the cell with given session_id and
    exec_id, starting with the message labeled with the given number.

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/killall')  # for doctesting
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.post('http://localhost:5000/execute/0', {'code':'print(2+3)'})
        u'{\n  "status": "ok", \n  "exec_id": 0, \n  "cell_status": "running"\n}'
        >>> misc.get('http://localhost:5000/output_messages/0/0/0')
        u'{\n  "status": "ok", \n  "data": []\n}'
        >>> time.sleep(.4)  # should be more than enough time 
        >>> print misc.get('http://localhost:5000/output_messages/0/0/0')
        {
          "status": "ok", 
          "data": [
            {
              "output": "5\n", 
              "modified_files": null, 
              "done": false, 
              "number": 0
            }, 
            {
              "output": null, 
              "modified_files": null, 
              "done": true, 
              "number": 1
            }
          ]
        }
    """
    S = db.session()
    output_msgs = S.query(db.OutputMsg).filter_by(session_id=session_id, exec_id=exec_id).\
                  filter('number>=:number').params(number=number).\
                  order_by(db.OutputMsg.number)
    data = [{'number':m.number, 'done':m.done, 'output':m.output, 'modified_files':m.modified_files}
              for m in output_msgs]
    return jsonify({'status':'ok', 'data':data})

def send_signal(id, sig):
    r"""
    Send signal sig to session with given id.

    EXAMPLES::
    
        >>> import frontend, misc, signal, time
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/killall')
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'})
        u'{\n  "status": "ok", \n  "exec_id": 0, \n  "cell_status": "running"\n}'
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "running"\n}'
        >>> misc.get('http://localhost:5000/sigint/0')  # indirect doctest
        u'{\n  "status": "ok"\n}'

    Wait a moment for the sigint to actually impact that process, then
    check new status::
    
        >>> time.sleep(.2)
        >>> misc.get('http://localhost:5000/status/0')        
        u'{\n  "status": "ok", \n  "session_status": "ready"\n}'
    """
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=id).one()
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    else:
        try:
            if sig == signal.SIGKILL:
                session.status = 'dead'
                S.commit()
            assert subprocess_port is not None, "you must initialize subprocess_port"
            url = 'http://localhost:%s/send_signal/%s/%s'%(
                subprocess_port, session.pid, sig)
            msg = json.loads(get(url))
        except OSError, err:
            msg = {'status':'error', 'data':str(err)}
    return jsonify(msg)

@app.route('/sigint/<int:id>')
def sigint(id):
    r"""
    Send an interrupt signal to the given session.

    INPUT:

    - ``id`` -- integer

    EXAMPLES::

    We open two sessions, infinite loop both, interrupt session 1,
    confirm it is interrupted but that session 0 isn't, then interrupt
    session 0::

        >>> import frontend, misc, signal
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/killall')
        >>> a = misc.get('http://localhost:5000/new_session')
        >>> a = misc.get('http://localhost:5000/new_session')
        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'})
        >>> a = misc.post('http://localhost:5000/execute/1', {'code':'while 1: True'})
        >>> misc.get('http://localhost:5000/sigint/1')
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/status/0')        
        u'{\n  "status": "ok", \n  "session_status": "running"\n}'

    Wait a moment for the sigint to actually impact that process, then
    check new status::
    
        >>> time.sleep(.2)
        >>> misc.get('http://localhost:5000/status/1')
        u'{\n  "status": "ok", \n  "session_status": "ready"\n}'
        >>> misc.get('http://localhost:5000/sigint/0')
        u'{\n  "status": "ok"\n}'
        >>> time.sleep(.2)
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "ready"\n}'

    Test interrupting a non-existent session gives an error::

        >>> misc.get('http://localhost:5000/sigint/2')
        u'{\n  "status": "error", \n  "data": "unknown session 2"\n}'

    Test that returned JSON is valid::

        >>> print json.loads(misc.get('http://localhost:5000/status/0'))
        {u'status': u'ok', u'session_status': u'ready'}
    """
    return send_signal(id, signal.SIGINT)

@app.route('/sigkill/<int:id>')
def sigkill(id):
    r"""
    Send a kill signal to the given session.

    INPUT:

    - ``id`` -- integer

    EXAMPLES::
    
        >>> import frontend, misc, signal
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/killall')
        >>> a = misc.get('http://localhost:5000/new_session')
        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'})
        >>> misc.get('http://localhost:5000/sigkill/0')
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "dead"\n}'

    Test that killing a non-existent session gives an error::
    
        >>> misc.get('http://localhost:5000/sigkill/1')
        u'{\n  "status": "error", \n  "data": "unknown session 1"\n}'
    """
    return send_signal(id, signal.SIGKILL)

@app.route('/close_session/<int:id>')
def close_session(id):
    """
    Kill and delete from the database the session with the given id.
    Also, clear up its allocated directory.

    INPUT:

    - ``id`` -- integer
    
    """
    # get the session object
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=id).one()
    except orm_exc.NoResultFound:
        # error message if try to delete session that doesn't exist
        msg = {'status':'error', 'data':'unknown session %s'%id}
        return jsonify(msg)
    try:
        close_subprocess(session.pid)
    finally:
        # All cells and output messages linked to this session should
        # automatically be deleted by a cascade:
        S.delete(session)
        S.commit()
    return jsonify({'status':'ok'})


@app.route('/status/<int:id>')
def status(id):
    """
    Return the status of the given session as a JSON message:

       {'status':'ok', 'session_status':'ready'}

    INPUT:

    - ``id`` -- integer
       
    """
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=id).one()
        msg = {'status':'ok', 'session_status':session.status}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    return jsonify(msg)

def file_path(id, path):
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=id).one()
        path = posixpath.normpath(path)
        if '..' in path or os.path.isabs(path):
            raise ValueError("insecure path '%s'"%path)
        return safe_join(session.path, path)
    except orm_exc.NoResultFound:
        raise ValueError('unknown session %s'%id)

@app.route('/files/<int:id>')
def files(id):
    r"""
    Return list of all files in the session with given id.

    INPUT:
    - ``id`` -- nonnegative integer

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/killall')  # for doctesting

    First we get back an error, since session 0 doesn't exist yet::
    
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "error", \n  "data": "unknown session 0"\n}'

    Create session 0 and get back empty list of files::
    
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "ok", \n  "data": []\n}'


    Create a file (via a computation) and check the list::

        >>> misc.post('http://localhost:5000/execute/0', {'code':'open("a_file.txt","w").write("hello")'})
        u'{\n  "status": "ok", \n  "exec_id": 0, \n  "cell_status": "running"\n}'
        >>> time.sleep(1)
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "ok", \n  "data": [\n    "a_file.txt"\n  ]\n}'

    Also, note that the file we uploaded has the right contents::
    
        >>> misc.get('http://localhost:5000/get_file/0/a_file.txt')
        u'hello'

    We start a new session and make sure the file list is empty for
    that session::
    
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 1\n}'
        >>> misc.get('http://localhost:5000/files/1')
        u'{\n  "status": "ok", \n  "data": []\n}'

    We delete the file we just created and check the list of files::

        >>> misc.get('http://localhost:5000/delete_file/0/a_file.txt')
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "ok", \n  "data": []\n}'

    Next we upload two files using the put_file function, which
    automatically creates directory paths, then check that our newly
    uploaded files appear in the list of files::


        >>> misc.post('http://localhost:5000/put_file/0', files={'a/b/c/file.txt':'hawk', 'a/b/c/file2.txt':'hosoi'})
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "ok", \n  "data": [\n    "a/b/c/file.txt", \n    "a/b/c/file2.txt"\n  ]\n}'

    For completeness, we grab and delete the first file we just uploaded. 

        >>> misc.get('http://localhost:5000/get_file/0/a/b/c/file.txt')
        u'hawk'
        >>> misc.get('http://localhost:5000/delete_file/0/a/b/c/file.txt')
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "ok", \n  "data": [\n    "a/b/c/file2.txt"\n  ]\n}'

        >>> z = misc.get('http://localhost:5000/killall')  # for doctesting
    """
    S = db.session()
    try:
        session = S.query(db.Session).filter_by(id=id).one()
        msg = {'status':'ok', 'data':all_files(session.path)}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    return jsonify(msg)

    

@app.route('/put_file/<int:id>', methods=['POST'])
def put_file(id):
    """
    Place the file with given 'content' (POST variable) in the given
    'path' (POST variable) in the session with given id.
    """
    if request.method == 'POST':
        for file in request.files.itervalues():
            try:
                path = file_path(id, file.filename)
            except ValueError, msg:
                return jsonify({'status':'error', 'data':str(msg)})
            base, fname = os.path.split(path)
            if not os.path.exists(base):
                os.makedirs(base)
            file.save(path)
        return jsonify({'status':'ok'})
    else:
        return jsonify({'status':'error', 'data':"must POST file"})

@app.route('/get_file/<int:id>/<path:path>')
def get_file(id, path):
    """
    Return the file in the given path in the session with given id. 
    """
    try:
        path = file_path(id, path)
    except ValueError, msg:
        return send_from_directory('/','') # invalid file -- gives right error (ugly/hackish?)
    base, fname = os.path.split(path)
    return send_from_directory(base, fname, as_attachment=True)

@app.route('/delete_file/<int:id>/<path:path>')
def delete_file(id, path):
    """
    Delete the file with given path in the session with given id.
    """
    try:
        path = file_path(id, path)
    except ValueError, msg:
        return jsonify({'status':'error', 'data':str(msg)})
    os.unlink(path)
    return jsonify({'status':'ok'})

@app.route('/submit_output/<int:id>', methods=['POST'])
def submit_output(id):
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

def run(port=5000, debug=False, log=False, sub_port=4999):
    """
    Run a blocking instance of the frontend server serving on the
    given port.  If debug=True (not the default), then Flask is started
    in debug mode.

    INPUT:
    - ``port`` -- integer (default: 5000)
    - ``debug`` -- bool (default: False)
    """
    port = int(port)

    global app_port, subprocess_port
    app_port = int(port)
    subprocess_port = int(sub_port)

    if not log:
        import logging
        logger = logging.getLogger('werkzeug')
        logger.setLevel(logging.ERROR)    
    
    db.create()
    app.run(port=port, debug=debug)

class Daemon(object):
    """
    Run workspace frontend server.
    
    EXAMPLES::
    
        >>> Daemon(5000)
        Workspace Frontend Daemon on port 5000
    """
    def __init__(self, port, debug=False, pidfile=None, log=False):
        """
        EXAMPLES::

            >>> r = Daemon(5002)
            >>> type(r)
            <class 'frontend.Daemon'>
            >>> r._port
            5002
        """
        if pidfile is None:
            self._pidfile = '%s-%s.pid'%(__name__, port)
        else:
            self._pidfile = pidfile
        if os.path.exists(self._pidfile):
            pid = int(open(self._pidfile).read())
            max_tries = 10
            while True:
                max_tries -= 1
                if max_tries == 0:
                    break # TODO: here we should just check that it is a zombie
                try:
                    os.kill(pid, signal.SIGKILL)
                    time.sleep(0.05)
                except OSError:
                    # error means process is gone
                    break
        self._port = port
        cmd = "python %s.py %s %s %s"%(__name__, port, debug, log)
        import subprocess # import here to ensure only used here
        self._server = subprocess.Popen(cmd, shell=True)
        open(self._pidfile, 'w').write(str(self._server.pid))
        while True:
            # Next wait to see if it is listening.
            try:
                get('http://localhost:%s/'%port)
            except ConnectionError:
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

            >>> Daemon(5002).__repr__()
            'Workspace Frontend Daemon on port 5002'
        """
        return "Workspace Frontend Daemon on port %s"%self._port
        
    def __del__(self):
        try:
            self.kill()
        except:
            pass
        #if os.path.exists(self._pidfile):
        #    os.unlink(self._pidfile)

    def kill(self):
        """
        Terminate the server subprocess.
        
        EXAMPLES:

            >>> r = Daemon(5000)
            >>> r.kill()
        """
        if hasattr(self, '_server'):
            # TODO: instead use self._server.kill(); self._server.wait()
            for i in range(5):
                try:
                    os.kill(self._server.pid, signal.SIGKILL)
                except:
                    pass
            # TODO -- do better====
            time.sleep(1)


if __name__ == '__main__':
    if len(sys.argv) == 1:
        print "Usage: %s port [debug] [log]"%sys.argv[0]
        sys.exit(1)
    # TODO: redo to use proper py2.7 option parsing (everywhere)!
    if len(sys.argv) >= 3:
        debug = eval(sys.argv[2])
    else:
        debug = False
    if len(sys.argv) >= 4:
        log = eval(sys.argv[3])
    else:
        log = True
    run(sys.argv[1], debug=debug, log=log)

