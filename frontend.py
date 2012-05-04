"""
Frontend server

The frontend server tracks several transient compute sessions.  The
frontend has no global in-process state, but instead uses a SQLalchemy
database.  It can scale up and be run as a multiprocess, multithreaded
WSGI application.  This scalability is important, since there could be
hundreds of simultaneous connections.  This diagram illustrates how
the frontend server object is central to everything.

[ Many ] <---------> [Frontend Server]  -----> [Subprocess servers]  
[ Many ] ...............................
[ Many ]   http
[Users ] <---------> [Frontend Server]  -----> [Subprocess servers] --> [backend]
  /|\     websockets         /|\                 (many accounts)    -->   ...
   |                          |---------------------------------------> [backend]
  \|/
[Workspace]
[Server   ]
(highly scalable, longterm, static)


THE API:
--------

Identification:
    / -- nothing useful yet

All Sessions:
    /close_all_sessions -- kill processes and delete everything about all sessions
    /sessions -- much information about all sessions

Session Management: creating, interrupting, killing and deleting:
    /new_session -- create a new session (returns id)
    /sigint/id -- send interrupt signal to session with given id
    /sigkill/id -- kill session with given id
    /close_session/id -- kill process and remove all files for session with given id

Session Information:
    /session/id -- extensive information about a given session
    /status/id -- get status of session with given id: 'ready', 'running', 'dead'
    /cells/id -- list of cells in a given session

Code Execution:
    /execute/id -- execute block of code
    /output_messages/id/cell_id/number -- incremental output produced when executing code

Files: uploading, downloading, deleting and listing:
    /files/id -- return list of all files in the given session
    /put_file/id, POST -- put a file or files into the given session
    /get_file/id/path -- get a file from the session
    /delete_file/id/path -- delete a file from the session

Backend Communication:
    /ready/id -- used by backend to report that it is done with assigned work
    /submit_output/id -- used by backend to submit the results of code execution

"""

import json, os, posixpath, random, signal, shutil, subprocess, sys, tempfile, time

from flask import Flask, request, safe_join, send_from_directory, jsonify
app = Flask(__name__)

from misc_flask import crossdomain

app_port = None # must be set before running
subprocess_port = None

from misc import get, post, ConnectionError, Timeout, all_files, is_temp_directory

import model

from sqlalchemy.orm import exc as orm_exc

def launch_backend_session(port, id=id):
    """
    Launch a backend session listening on the given port, and return
    its UNIX process id and absolute path.

    If something goes wrong, then a RuntimeError exception is raised.

    INPUT:

    - ``port`` -- positive integer
    - ``id`` -- nonnegative integer
    - ``output_url`` -- string (default: None); the url

    OUTPUT:

    - pid, execpath
    
    EXAMPLES::

        >>> import frontend
        >>> frontend.model.drop_all()
        >>> pid, execpath = frontend.launch_backend_session(5001, 0)
        Traceback (most recent call last):
        ...
        AssertionError: you must initialize app_port

    We set the app and subprocess ports in the database, so that the
    launch_backend_session command works::

        >>> frontend.app_port = 5000; frontend.subprocess_port = 4999 # TODO 
        >>> #frontend.model.set_ports(frontend=5000, subprocess_server=4999)

    Now it works::

        >>> pid, execpath = frontend.launch_backend_session(5001, 0)
        >>> isinstance(pid, int), isinstance(execpath, basestring)
        (True, True)
    """
    assert app_port is not None, "you must initialize app_port"        
    assert subprocess_port is not None, "you must initialize subprocess_port"

    # construct the command line
    command = ' '.join(['python', os.path.abspath('backend.py'), # backend script
       str(port),                                                # port that backend will listen on
       'http://localhost:%s/ready/%s'%(app_port, id),            # backend reports it is done
       "http://localhost:%s/submit_output/%s"%(app_port, id)     # backend submits results here
       ])

    # We launch the subprocess using a GET request to the subprocesses server.
    mesg = json.loads(get('http://localhost:%s/popen'%subprocess_port,
                          {'command':command}))

    # Did anything go wrong requesting to starting the subprocess?
    if mesg['status'] != 'ok':
        raise RuntimeError(mesg['mesg'])

    # NOTE: At this point the subprocess could still have failed.  All
    # we know is that a process with the given pid was started, but it
    # might have immediately died.
    
    return mesg['pid'], mesg['execpath']

def close_subprocess(pid):
    r"""
    Close and clean up the process with given pid.

    INPUT::

    - ``pid`` -- positive integer

    EXAMPLES::

        >>> import frontend, misc
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> id = json.loads(misc.get('http://localhost:5000/new_session'))['id']
        >>> misc.get('http://localhost:5000/close_session/%s'%id)   # indirect doctest
        u'{\n  "status": "ok"\n}'
    """
    assert subprocess_port is not None, "you must initialize subprocess_port"
    url = 'http://localhost:%s/close/%s'%(subprocess_port, pid)
    return json.loads(get(url))

@app.route('/close_all_sessions')
@crossdomain('*')
def close_all_sessions():
    r"""
    Kill and clean up all sessions associated to this frontend server.
    
    EXAMPLES::

        >>> import frontend, misc
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 1\n}'
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 2\n}'
        >>> misc.get('http://localhost:5000/close_all_sessions')
        u'{\n  "status": "ok", \n  "closed": [\n    0, \n    1, \n    2\n  ]\n}'
        >>> misc.get('http://localhost:5000/close_all_sessions')
        u'{\n  "status": "ok", \n  "closed": []\n}'
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "error", \n  "data": "unknown session 0"\n}'
    """
    S = model.session()
    try:
        sessions = S.query(model.Session)
    except orm_exc.NoResultFound:
        # easy case -- no sessions to cleanup; maybe database schema not even made
        return jsonify({'status':'ok', 'closed':[]})
    except Exception, mesg:
        return jsonify({'status':'error', 'mesg':'db-error: %s'%mesg})

    closed = []
    for session in sessions:
        try:
            close_subprocess(session.pid)
        except Exception, mesg:
            return jsonify({'status':'error', 'mesg':'subprocess-error: %s'%mesg})
        finally:
            S.delete(session)
            S.commit()
            closed.append(session.id)

    return jsonify({'status':'ok', 'closed':closed})

    
@app.route('/')
def root():
    """
    The root URL provides no useful information.  It's here mainly so
    we can tell that the server is running.

    EXAMPLES::

        >>> import frontend, misc
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> misc.get('http://localhost:5000')   # indirect test
        u'Frontend Server'
    """
    return "Frontend Server"

@app.route('/new_session')
@crossdomain('*')
def new_session():
    r"""
    Create a new session, and return its id number as the 'id' key of
    the JSON message.

    EXAMPLES::

        >>> import frontend, json, misc
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> json.loads(misc.get('http://localhost:5000/new_session'))
        {u'status': u'ok', u'id': 0}
    """
    S = model.session()
    MAX_TRIES=300
    for i in range(MAX_TRIES):
        try:
            if S.query(model.Session).count() == 0:
                id = 0
                if app_port is None:
                    print "you must initialize app_port!"
                    sys.exit(1)
                port = app_port + 1
            else:
                last_session = S.query(model.Session).order_by(model.Session.id.desc())[0]
                id = last_session.id + 1
                port = int(last_session.url.split(':')[-1]) + 1
            session = model.Session(id, 0, '', 'http://localhost:%s'%port, status='running')
            S.add(session)
            S.commit()
            break

        # TODO: naked excepts are unacceptable!!!!
        # TODO: this appears to not be sqlite3.IntegrityError ??  figure out what the right exception is?
        except Exception, msg:
            print msg
            # race condition -- multiple threads chose the same session id
            S.rollback()
            time.sleep(random.random()/20.)
        
    try:
        pid, path = launch_backend_session(port=port, id=id)
    except RuntimeError:
        msg = {'status':'error', 'data':'failed to create new session (port=%s, id=%s)'%(port,id)}
    else:
        session.pid = pid
        session.path = path
        S.commit()
        msg = {'status':'ok', 'id':id}
    return jsonify(msg)

@app.route('/execute/<int:session_id>', methods=['POST'])
@crossdomain('*')
def execute(session_id):
    r"""
    Create a new cell with given input code, and start it executing in
    the session with given URL.

    EXAMPLES::
    
        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting

    We start a session and ask for execution of one cell::

        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'

        >>> misc.post('http://localhost:5000/execute/0', {'code':'print(2+3)'})
        u'{\n  "status": "ok", \n  "cell_status": "enqueued", \n  "cell_id": 0\n}'

    We request execution of code in a session that does not exist::

        >>> misc.post('http://localhost:5000/execute/389', {'code':'print(2+3)'})
        u'{\n  "status": "error", \n  "data": "unknown session 389"\n}'

    We try a POST request that is missing the code variable, hence
    results in an error::
    
        >>> misc.post('http://localhost:5000/execute/0', {'foo':'bar'})
        u'{\n  "status": "error", \n  "data": "must POST \'code\' variable"\n}'

        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting
    """
    if request.method == 'POST' and request.form.has_key('code'):
        code = request.form['code']

        S = model.session()
        MAX_TRIES=300
        for i in range(MAX_TRIES):
            try:
                # get the session in which to execute this code
                session = S.query(model.Session).filter_by(id=session_id).one()
            except orm_exc.NoResultFound:
                # handle invalid session_id
                return jsonify({'status':'error', 'data':'unknown session %s'%session_id})

            if session.status == 'dead':
                # according to the database, we've had trouble with this session,
                # so just raise an error.  
                return jsonify({'status':'error', 'data':'session is dead'})

            # store the code to evaluate in database.
            cell = model.Cell(session.next_cell_id, session.id, code)
            session.cells.append(cell)
            # increment id for next code execution
            session.next_cell_id += 1
            try:
                S.commit()
                break   
            except:   # TODO: what is the right exception?
                # race condition -- multiple threads chose the same cell_id
                S.rollback()
                time.sleep(random.random()/20.)
                
        msg = {'cell_id':cell.cell_id}

        # if the session is in ready state, that means it has a web server
        # listening and waiting for us to send it something to evaluate.
        if session.status == 'ready':
            try:
                session.last_active_cell_id = cell.cell_id
                session.status = 'running'
                cells = [{'code':cell.code, 'cell_id':cell.cell_id}]
                post(session.url, {'cells':json.dumps(cells)}, timeout=1)
                msg['cell_status'] = 'running'
                msg['status'] = 'ok'
            except (ConnectionError, Timeout):
                # The session is not alive and responding as we
                # thought it would be doing, so we mark it is as such
                # in the database, and send tell the subprocess server
                # to clean it up (via close_subprocess).
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
    r"""
    This URL called when the backend with given id has finished all
    computations.  If there is anything new to compute, it is
    returned.

    INPUT:

    - ``id`` -- nonnegative integer

    EXAMPLES::
    
        >>> import client, frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting
        >>> a = misc.get('http://localhost:5000/new_session')
        >>> c = client.Client(5000); c.wait(0)

    First we manually call ready when there is nothing to compute::
    
        >>> misc.get('http://localhost:5000/ready/0')
        u'{\n  "status": "done"\n}'

    Next we start something that will take foreover::
    
        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'})

    We also enqueue two more computations, so when we "fake" the backend being ready,
    we'll get those computations as our new work.::
    
        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'print(2+3)'})
        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'print(8+8)'})
        >>> misc.get('http://localhost:5000/ready/0')
        u'{\n  "status": "ok", \n  "cells": [\n    {\n      "code": "print(2+3)", \n      "cell_id": 1\n    }, \n    {\n      "code": "print(8+8)", \n      "cell_id": 2\n    }\n  ]\n}'

    Having just called /ready, we get no new work::
    
        >>> misc.get('http://localhost:5000/ready/0')
        u'{\n  "status": "done"\n}'

    Trying to do a further calculation with session 0 will "anger" the frontend,
    since the backend is still actually stuck in that infinite loop, hence will
    ignore all attempts to send it a cell over HTTP.  The frontend in fact kills
    the backend in this case::
    
        >>> misc.post('http://localhost:5000/execute/0', {'code':'print(2+3)'})
        u'{\n  "status": "error", \n  "cell_id": 3, \n  "data": "session is dead"\n}'

    Note that the status of this session is now 'dead'::

        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "dead"\n}'
    """
    # The backend has finished whatever it was doing and is
    # nearly ready for more.  If there is anything left to do, tell it
    # to do all that; otherwise, tell it to wait for a new request
    # when it comes later.
    S = model.session()
    session = S.query(model.Session).filter_by(id=id).one()

    # if there is anything to compute for this session, start it going.
    if session.last_active_cell_id+1 < session.next_cell_id:
        # Iterate over every cell in this session that has not
        # yet been sent off to be computed, and make a list of their
        # code and cell_id's.
        cells = []
        for cell in S.query(model.Cell).filter(
                        model.Cell.cell_id >= session.last_active_cell_id + 1).filter(
                        model.Cell.session_id == session.id).order_by(model.Cell.cell_id):

            cells.append({'code':cell.code, 'cell_id':cell.cell_id})
            
        # Record what will be the last cell_id sent off to be computed.
        session.last_active_cell_id = cells[-1]['cell_id']
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

@app.route('/sessions')
@crossdomain(origin='*')
def sessions():
    r"""
    Return JSON representation of all the sessions.

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> print misc.get('http://localhost:5000/sessions')
        {
          "status": "ok", 
          "sessions": [
            {
              "status": "running", 
              "start_time": "...", 
              "url": "http://localhost:5001", 
              "path": "...tmp...", 
              "next_cell_id": 0, 
              "pid": ..., 
              "id": 0, 
              "last_active_cell_id": -1
            }
          ]
        }
        >>> import client; client.Client(5000).wait(0)
        >>> print misc.get('http://localhost:5000/sessions')
        {...
              "status": "ready", 
        ...}
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 1\n}'
        >>> misc.get('http://localhost:5000/sessions')
        u'{\n  "status": "ok", \n  "sessions": [\n    {\n      "status": "ready", \n      "start_time": "...", \n      "url": "http://localhost:5001", \n      "path": "...", \n      "next_cell_id": 0, \n      "pid": ..., \n      "id": 0, \n      "last_active_cell_id": -1\n    }, \n    {\n      "status": "running", \n      "start_time": "...", \n      "url": "http://localhost:5002", \n      "path": "...", \n      "next_cell_id": 0, \n      "pid": ..., \n      "id": 1, \n      "last_active_cell_id": -1\n    }\n  ]\n}'
        >>> misc.get('http://localhost:5000/sigkill/0')
        u'{\n  "status": "ok"\n}'
        >>> client.Client(5000).wait(0, status='dead')
        >>> json.loads(misc.get('http://localhost:5000/sessions'))
        {u'status': u'ok', u'sessions': [{u'status': u'dead', u'url': u'http://localhost:5001', u'start_time': u'...', u'pid': ..., u'path': u'...', u'next_cell_id': 0, u'id': 0, u'last_active_cell_id': -1}, {u'status': u'running', u'url': u'http://localhost:5002', u'start_time': u'...', u'pid': ..., u'path': u'...', u'next_cell_id': 0, u'id': 1, u'last_active_cell_id': -1}]}
    """
    S = model.session()
    v = [s.to_json() for s in S.query(model.Session).order_by(model.Session.id).all()]
    return jsonify({'status':'ok', 'sessions':v})


@app.route('/session/<int:session_id>')
@crossdomain('*')
def session(session_id):
    r"""
    Return JSON representation of data about the session with given id.

    INPUT:

    - ``session_id`` -- nonnegative integer

    EXAMPLES::

        >>> import frontend, json, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.get('http://localhost:5000/session/0')
        u'{\n  "status": "ok", \n  "data": {\n    "status": "running", \n    "start_time": "...", \n    "url": "http://localhost:5001", \n    "path": "...", \n    "next_cell_id": 0, \n    "pid": ..., \n    "id": 0, \n    "last_active_cell_id": -1\n  }\n}'

    Wait until the session starts::
    
        >>> import client; client.Client(5000).wait(0)
        >>> misc.get('http://localhost:5000/session/0')
        u'{\n  "status": "ok", \n  "data": {\n    "status": "ready", \n    "start_time": "...", \n    "url": "http://localhost:5001", \n    "path": "...", \n    "next_cell_id": 0, \n    "pid": ..., \n    "id": 0, \n    "last_active_cell_id": -1\n  }\n}'

    We query for a nonexistent session::

        >>> print misc.get('http://localhost:5000/session/1')
        {
          "status": "error", 
          "data": "unknown session 1"
        }
    """
    S = model.session()
    try:
        v = S.query(model.Session).filter_by(id=session_id).one().to_json()
        msg = {'status':'ok', 'data':v}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%session_id}
    return jsonify(msg)

@app.route('/cells/<int:session_id>')
@crossdomain('*')
def cells(session_id):
    r"""
    Return JSON representation of all cells in the session with given
    id.  This contains only the input and execution id's of each cell
    in this session.  To get the output, use /output_messages.

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting

    Asking for cells in a session that does not exist gives a reasonable error message::
    
        >>> misc.get('http://localhost:5000/cells/0')
        u'{\n  "status": "error", \n  "data": "unknown session 0"\n}'

    Create a session and get cells; there are none here, but note that
    we do not get an error as above::

        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.get('http://localhost:5000/cells/0')
        u'{\n  "status": "ok", \n  "data": []\n}'

    Next we execute a cell, so it is listed::

        >>> misc.post('http://localhost:5000/execute/0', {'code':'print(2+3)'})
        u'{\n  "status": "ok", \n  "cell_status": "enqueued", \n  "cell_id": 0\n}'
        >>> print misc.get('http://localhost:5000/cells/0')
        {
          "status": "ok", 
          "data": [
            {
              "code": "print(2+3)", 
              "cell_id": 0
            }
          ]
        }

    Note that output is not included::
    
        >>> import client; client.Client(5000).wait(0)
        >>> misc.get('http://localhost:5000/cells/0')
        u'{\n  "status": "ok", \n  "data": [\n    {\n      "code": "print(2+3)", \n      "cell_id": 0\n    }\n  ]\n}'

    We evaluate 2 more cells so /cells/0 returns three cells::

        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'print(8+8)'})
        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'print(7*13)'})
        >>> import json
        >>> print json.loads(misc.get('http://localhost:5000/cells/0'))
        {u'status': u'ok', u'data': [{u'code': u'print(2+3)', u'cell_id': 0}, {u'code': u'print(8+8)', u'cell_id': 1}, {u'code': u'print(7*13)', u'cell_id': 2}]}
    """
    S = model.session()
    try:
        session = S.query(model.Session).filter_by(id=session_id).one()
        msg = {'status':'ok', 'data':[cell.to_json() for cell in session.cells]}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%session_id}
    return jsonify(msg)
    
@app.route('/output_messages/<int:session_id>/<int:cell_id>/<int:number>')
@crossdomain('*')
def output_messages(session_id, cell_id, number):
    r"""
    Return all output messages for the cell with given session_id and
    cell_id, starting with the message labeled with the given number.

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> import client; client.Client(5000).wait(0)
        >>> misc.post('http://localhost:5000/execute/0', {'code':'print(2+3)'})
        u'{\n  "status": "ok", \n  "cell_status": "running", \n  "cell_id": 0\n}'
        >>> client.Client(5000).wait(0)        
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
    S = model.session()
    output_msgs = S.query(model.OutputMsg).filter_by(session_id=session_id, cell_id=cell_id).\
                  filter('number>=:number').params(number=number).\
                  order_by(model.OutputMsg.number)
    data = [{'number':m.number, 'done':m.done, 'output':m.output, 'modified_files':m.modified_files}
              for m in output_msgs]
    return jsonify({'status':'ok', 'data':data})

def send_signal(id, sig):
    r"""
    Send signal sig to session with given id.

    EXAMPLES::
    
        >>> import frontend, misc, time
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> import client; client.Client(5000).wait(0)
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "ready"\n}'
        >>> misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'})
        u'{\n  "status": "ok", \n  "cell_status": "running", \n  "cell_id": 0\n}'
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "running"\n}'
        >>> misc.get('http://localhost:5000/sigint/0')  # indirect doctest
        u'{\n  "status": "ok"\n}'

    Wait for the SIGINT signal to stop that process, then check the
    new status::
    
        >>> import client; client.Client(5000).wait(0, timeout=5)
        >>> misc.get('http://localhost:5000/status/0')        
        u'{\n  "status": "ok", \n  "session_status": "ready"\n}'
    """
    S = model.session()
    try:
        session = S.query(model.Session).filter_by(id=id).one()
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    else:
        try:
            assert subprocess_port is not None, "you must initialize subprocess_port"
            
            if sig == signal.SIGINT:
                if session.status != 'running':
                    # do nothing
                    return jsonify({'status':'ok'})

            elif sig == signal.SIGKILL or sig == signal.SIGTERM:
                if session.status == 'dead':
                    # do nothing
                    return jsonify({'status':'ok'})
                # record that we now consider this session dead
                session.status = 'dead'
                S.commit()

            else:
                # only above signals supported
                return jsonify({'status':'error', 'data':'unsupported signal %s'%sig})
            
            # send the signal
            url = 'http://localhost:%s/send_signal/%s/%s'%(subprocess_port, session.pid, sig)
            msg = json.loads(get(url))

        except OSError, err:
            msg = {'status':'error', 'data':str(err)}
            
    return jsonify(msg)

@app.route('/sigint/<int:id>')
@crossdomain('*')
def sigint(id):
    r"""
    Send an interrupt signal to the given session.

    INPUT:

    - ``id`` -- integer

    EXAMPLES::

    We open two sessions, infinite loop both, interrupt session 1,
    confirm it is interrupted but that session 0 isn't, then interrupt
    session 0::

        >>> import frontend, misc
        >>> R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 1\n}'
        >>> import client; client.Client(5000).wait(0, timeout=1)
        >>> import client; client.Client(5000).wait(1, timeout=1)
        >>> misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'})
        u'{\n  "status": "ok", \n  "cell_status": "running", \n  "cell_id": 0\n}'
        >>> misc.post('http://localhost:5000/execute/1', {'code':'while 1: True'})
        u'{\n  "status": "ok", \n  "cell_status": "running", \n  "cell_id": 0\n}'
        
        >>> misc.get('http://localhost:5000/sigint/1')
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/status/0')        
        u'{\n  "status": "ok", \n  "session_status": "running"\n}'

    Wait for the SIGINT signal to stop that process, then check the
    new status::

        >>> import client; client.Client(5000).wait(1, timeout=1)
        >>> misc.get('http://localhost:5000/status/1')
        u'{\n  "status": "ok", \n  "session_status": "ready"\n}'
        >>> misc.get('http://localhost:5000/sigint/0')
        u'{\n  "status": "ok"\n}'
        >>> import client; client.Client(5000).wait(0, timeout=1)        
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
@crossdomain('*')
def sigkill(id):
    r"""
    Send a kill signal to the given session.

    INPUT:

    - ``id`` -- integer

    EXAMPLES::
    
        >>> import frontend, misc
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
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
@crossdomain('*')
def close_session(id):
    r"""
    Close the session with given id.

    This removes everything related to the session from the
    database and removes the working temp directory.

    INPUT:

    - ``id`` -- integer

    EXAMPLES::

        >>> import frontend, misc
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> a = misc.get('http://localhost:5000/new_session')
        >>> misc.get('http://localhost:5000/close_session/0')
        u'{\n  "status": "ok"\n}'

    After closing the session, it is completely gone, so we get an
    error when asking for its status::
    
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "error", \n  "data": "unknown session 0"\n}'

    Closing an unknown session is also an error::

        >>> misc.get('http://localhost:5000/close_session/1')
        u'{\n  "status": "error", \n  "data": "unknown session 1"\n}'
    """
    # get the session object
    S = model.session()
    try:
        session = S.query(model.Session).filter_by(id=id).one()
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
@crossdomain('*')
def status(id):
    r"""
    Return the status of the given session as a JSON message:

       {'status':'ok', 'session_status':'ready'}

    Note the return JSON has a field status as usual, and the
    session's status is in a different field 'session_status'.

    The possible status values are: 'ready', 'running', 'dead'

    INPUT:

    - ``id`` -- integer

    EXAMPLES::

    We illustrate each status value::
    
        >>> import frontend, misc, client
        >>> c = client.Client(5000)
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> a = misc.get('http://localhost:5000/new_session')

    First, the 'ready' status::

        >>> c.wait(0)
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "ready"\n}'

    Next the 'running' status::
    
        >>> a = misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'})
        >>> c.wait(0, status='running')
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "running"\n}'

    Next the 'dead' status::

        >>> a = misc.get('http://localhost:5000/sigkill/0')  # indirect doctest
        >>> c.wait(0, status='dead')        
        >>> misc.get('http://localhost:5000/status/0')
        u'{\n  "status": "ok", \n  "session_status": "dead"\n}'
    """
    S = model.session()
    try:
        session = S.query(model.Session).filter_by(id=id).one()
        msg = {'status':'ok', 'session_status':session.status}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    return jsonify(msg)

def file_path(id, path):
    """
    Return absolute (hopefully safe) path to the file with given path
    inside the temporary execution directory corresponding to the
    session with given id.
    
    INPUT:

    - ``id`` -- nonnegative integer
    - ``path`` -- string

    OUTPUT:

    - string

    EXAMPLES::

        >>> import frontend, misc
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> a = misc.get('http://localhost:5000/new_session')
        >>> frontend.file_path(0, 'a/b/xyz.txt')
        u'/.../a/b/xyz.txt'
        >>> frontend.file_path(0, '../a/b/xyz.txt')
        Traceback (most recent call last):
        ...
        ValueError: insecure path '../a/b/xyz.txt'
    """
    id = int(id)
    S = model.session()
    try:
        session = S.query(model.Session).filter_by(id=id).one()
        path = posixpath.normpath(path)
        if '..' in path or os.path.isabs(path):
            raise ValueError("insecure path '%s'"%path)
        return safe_join(session.path, path)
    except orm_exc.NoResultFound:
        raise ValueError('unknown session %s'%id)

@app.route('/files/<int:id>')
@crossdomain('*')
def files(id):
    r"""
    Return list of all files in the session with given id.

    INPUT:
    - ``id`` -- nonnegative integer

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting
        >>> import client; c = client.Client(5000)

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
        u'{\n  "status": "ok", \n  "cell_status": "enqueued", \n  "cell_id": 0\n}'
        >>> c.wait(0)
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

        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting
    """
    S = model.session()
    try:
        session = S.query(model.Session).filter_by(id=id).one()
        msg = {'status':'ok', 'data':all_files(session.path)}
    except orm_exc.NoResultFound:
        msg = {'status':'error', 'data':'unknown session %s'%id}
    return jsonify(msg)

    

@app.route('/put_file/<int:id>', methods=['POST'])
@crossdomain('*')
def put_file(id):
    r"""
    Place the file with given 'content' (POST variable) in the given
    'path' (POST variable) in the session with given id.

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')   # for doctesting
        >>> a=misc.get('http://localhost:5000/new_session') # session 0
        >>> a=misc.get('http://localhost:5000/new_session') # session 1

    Put two files in session 0::
    
        >>> misc.post('http://localhost:5000/put_file/0', files={'foo/bar/sphere.txt':'sphere', 'a/b/c/d/e/box.txt':'box'})
        u'{\n  "status": "ok"\n}'

    Confirm that they are there::

        >>> print misc.get('http://localhost:5000/files/0')
        {
          "status": "ok", 
          "data": [
            "a/b/c/d/e/box.txt", 
            "foo/bar/sphere.txt"
          ]
        }
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "ok", \n  "data": [\n    "a/b/c/d/e/box.txt", \n    "foo/bar/sphere.txt"\n  ]\n}'

    Edge case -- 0 files::
    
        >>> misc.post('http://localhost:5000/put_file/0', files={})
        u'{\n  "status": "ok"\n}'

    Put a file in session 1::

        >>> misc.post('http://localhost:5000/put_file/1', files={'foo/bar/sphere2.txt':'sphere2'})
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/files/1')
        u'{\n  "status": "ok", \n  "data": [\n    "foo/bar/sphere2.txt"\n  ]\n}'
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
@crossdomain('*')
def get_file(id, path):
    r"""
    Return contents of the file in the given path in the session with
    given id.  The output is *not* a JSON message, but the actual
    contents of the file, or -- in case of an error -- a 404 Not Found
    message.

    INPUT:

    - ``id`` -- nonnegative integer
    - ``path`` -- string

    OUTPUT:

    - file

    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting

    Try to get a file in a nonexistent session::

        >>> misc.get('http://localhost:5000/get_file/0/file.txt')
        u'...404 Not Found...'

    Try to get a file that does not exist (but the session does exist)::
    
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.get('http://localhost:5000/get_file/0/file.txt')
        u'...404 Not Found...'

    Upload a file, then get it, which works::
        
        >>> misc.post('http://localhost:5000/put_file/0', files={'a/b/cfile.txt':'contents of file'})
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/get_file/0/a/b/cfile.txt')
        u'contents of file'
    """
    try:
        path = file_path(id, path)
    except ValueError, msg:
        return send_from_directory('/','') # invalid file -- gives right error (ugly/hackish?)
    base, fname = os.path.split(path)
    return send_from_directory(base, fname, as_attachment=True)

@app.route('/delete_file/<int:id>/<path:path>')
@crossdomain('*')
def delete_file(id, path):
    r"""
    Delete the file with given path in the session with given id.

    INPUT:

    - ``id`` -- nonnegative integer
    - ``path`` -- string

    OUTPUT:

    - file
    
    EXAMPLES::

        >>> import frontend, misc; R = frontend.Daemon(5000)
        >>> z = misc.get('http://localhost:5000/close_all_sessions')  # for doctesting

    Try to delete a file in a nonexistent session::

        >>> misc.get('http://localhost:5000/delete_file/0/file.txt')
        u'{\n  "status": "error", \n  "data": "unknown session 0"\n}'

    Try to delete a file that does not exist (but the session does exist)::
    
        >>> misc.get('http://localhost:5000/new_session')
        u'{\n  "status": "ok", \n  "id": 0\n}'
        >>> misc.get('http://localhost:5000/delete_file/0/file.txt')
        u'{\n  "status": "error", \n  "data": "no file \\"file.txt\\""\n}'

    Upload a file, then get it, which works, then delete it and see that it is gone::
        
        >>> misc.post('http://localhost:5000/put_file/0', files={'a/b/cfile.txt':'contents of file'})
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/get_file/0/a/b/cfile.txt')
        u'contents of file'
        >>> misc.get('http://localhost:5000/delete_file/0/a/b/cfile.txt')
        u'{\n  "status": "ok"\n}'
        >>> misc.get('http://localhost:5000/files/0')
        u'{\n  "status": "ok", \n  "data": []\n}'
        >>> misc.get('http://localhost:5000/get_file/0/a/b/cfile.txt')
        u'...404 Not Found...'

    Try to delete an unsafe path::

        >>> misc.get('http://localhost:5000/delete_file/0/../../passwd')
        u'{\n  "status": "error", \n  "data": "insecure path \'../../passwd\'"\n}'
    """
    try:
        fullpath = file_path(id, path)
    except ValueError, msg:
        return jsonify({'status':'error', 'data':str(msg)})
    if not os.path.exists(fullpath):
        return jsonify({'status':'error', 'data':'no file "%s"'%path})
    os.unlink(fullpath)
    return jsonify({'status':'ok'})

@app.route('/submit_output/<int:id>', methods=['POST'])
@crossdomain('*')
def submit_output(id):
    r"""
    The compute sessions call this function via a POST request to
    report the output that they produce.  The POST request looks like
    this

       {'cell_id':0, 'done':False, 'modified_files':'paths separated by spaces', 'output':'123'}

    The output and modified_files fields may be omitted. 

    INPUT:

    - ``id`` -- nonnegative integer
    - POST variables: cell_id, done, modified_files (optional), output (optional)

    OUTPUT:

    - JSON message with a 'status' field with value 'ok' or 'error',
      and an optional 'data' field in case of an error.

    EXAMPLES::

    We start a computation that will take forever running::

        >>> import frontend, misc, client, json
        >>> c = client.Client(5000)
        >>> R = frontend.Daemon(5000); z = misc.get('http://localhost:5000/close_all_sessions')
        >>> a = misc.get('http://localhost:5000/new_session')
        >>> c.wait(0)  
        >>> json.loads(misc.post('http://localhost:5000/execute/0', {'code':'while 1: True'}))
        {u'status': u'ok', u'cell_status': u'running', u'cell_id': 0}
        >>> c.wait(0, status='running')

    Now we "spoof" submitting some output::

        >>> json.loads(misc.post('http://localhost:5000/submit_output/0', {'cell_id':0, 'done':False, 'modified_files':'', 'output':'123'}))
        {u'status': u'ok'}

    Check that we got the output::
    
        >>> json.loads(misc.get('http://localhost:5000/output_messages/0/0/0'))
        {u'status': u'ok', u'data': [{u'output': u'123', u'modified_files': u'', u'done': False, u'number': 0}]}

    Force a correct submission by interrupting::

        >>> misc.get('http://localhost:5000/sigint/0')
        u'{\n  "status": "ok"\n}'
        >>> c.wait(0)  # wait for interrupt to happen and subprocess to finish submitting everything
        >>> json.loads(misc.get('http://localhost:5000/output_messages/0/0/1'))
        {u'status': u'ok', u'data': [{u'output': u'KeyboardInterrupt()', u'modified_files': None, u'done': False, u'number': 1}, {u'output': None, u'modified_files': None, u'done': True, u'number': 2}]}

    Next we test error conditions.

    We submit output missing the cell_id (which is the only required field)::

        >>> json.loads(misc.post('http://localhost:5000/submit_output/0', {'done':False, 'modified_files':'', 'output':'123'}))
        {u'status': u'error', u'data': u'must include cell_id as a POST variable'}

    We submit output for a cell that does not exist (the cell_id specifies the cell)::

        >>> json.loads(misc.post('http://localhost:5000/submit_output/0', {'cell_id':1, 'done':False, 'modified_files':'', 'output':'123'}))
        {u'status': u'error', u'data': u'no cell with cell_id=1 and session_id=0'}

    We submit output for a nonexistent session::

        >>> json.loads(misc.post('http://localhost:5000/submit_output/1', {'cell_id':0, 'done':False, 'modified_files':'', 'output':'123'}))
        {u'status': u'error', u'data': u'no cell with cell_id=0 and session_id=1'}

    We try to use GET instead of POST::

        >>> misc.get('http://localhost:5000/submit_output/0', {'cell_id':0, 'done':False, 'modified_files':'', 'output':'123'})
        u'...The method GET is not allowed for the requested URL...'
    """
    if request.method == 'POST':
        try:
            S = model.session()
            m = request.form
            if 'cell_id' not in m:
                return jsonify({'status':'error', 'data':'must include cell_id as a POST variable'})
            cell_id = m['cell_id']

            try:
                cell = S.query(model.Cell).filter_by(cell_id=cell_id, session_id=id).one()
            except orm_exc.NoResultFound:
                return jsonify({'status':'error', 'data':'no cell with cell_id=%s and session_id=%s'%(cell_id, id)})

            msg = model.OutputMsg(number=len(cell.output), cell_id=cell_id, session_id=id)
            if 'done' in m:
                msg.done = False if m['done'] == u'False' else True
            if 'output' in m:
                msg.output = m['output']
                socketio_send(m['output'])
            if 'modified_files' in m:
                msg.modified_files = m['modified_files']
            cell.output.append(msg)
            S.commit()
        except Exception, msg:
            return jsonify({'status':'error', 'data':'SERVER BUG: %s'%msg})  # should never happen!
        return jsonify({'status':'ok'})
    return jsonify({'status':'error', 'data':'must use POST request to submit output'})

##########################################
# WebSocket support
##########################################

ws_messages = []
def websocket_send(m):
    ws_messages.append(m)

@app.route('/ws')
def ws():
    if request.environ.get('wsgi.websocket'):
        w = request.environ['wsgi.websocket']
        n = 0
        while True:
            print w
            w.send('%s '%n);
            n += 1
            time.sleep(5)
        
        while True:
            n = len(ws_messages)
            for m in ws_messages[:n]:
                w.send(m)
            del ws_messages[:n]
            time.sleep(0.001)


import tornadio.router
import tornadio.server        

class TornadioConnection(tornadio.SocketConnection):
    # Class level variable
    clients = set()

    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        self.send("Welcome!")

    def on_message(self, message):
        for p in self.clients:
            p.send(message)

    def on_close(self):
        self.clients.remove(self)
        for p in self.clients:
            p.send("A user has left.")


#use the routes classmethod to build the correct resource
TornadioRouter = tornadio.get_router(TornadioConnection, {
    'enabled_protocols': [
        'websocket',
        'xhr-multipart',
        'xhr-polling',
        'flashsocket',
    ]
})

def socketio_send(m):
    s = list(TornadioConnection.clients)
    print '%s connections'%len(s)
    for c in s:
        c.send(m)

##########################################
# Starting the webserver itself.
##########################################

def run(host="127.0.0.1", port=5000, debug=False, log=False, sub_port=None,
        server='gevent'):
    """
    Run a blocking instance of the frontend server serving on the
    given port.  If debug=True (not the default), then Flask is started
    in debug mode.

    INPUT:
    - ``port`` -- integer (default: 5000)
    - ``debug`` -- bool (default: False)
    - ``log`` -- bool (default: False)
    - ``sub_port`` -- None or number
    - ``gevent`` -- if true, use the gevent server instead of the
      builtin flask debug server

    EXAMPLES::

        >>> import frontend
        >>> R = frontend.Daemon(5000)  # indirect doctest
    
    """
    if sub_port is None:
        import test
        sub_port = test.SUBPROCESS_PORT
    
    port = int(port)

    global app_port, subprocess_port
    app_port = int(port)
    subprocess_port = int(sub_port)

    if not log:
        import logging
        logger = logging.getLogger('werkzeug')
        logger.setLevel(logging.ERROR)    
    
    model.create()
    if server == 'flask':
        print "Using multithreaded flask server"
        app.run(host=host, port=port, debug=debug, threaded=True)

    elif server == 'gevent':

        print "Using websocket-enabled gevent server"
        from gevent import monkey; monkey.patch_all()
        from geventwebsocket.handler import WebSocketHandler
        from gevent.pywsgi import WSGIServer
        http_server = WSGIServer((host, port), app, handler_class=WebSocketHandler)
        http_server.serve_forever()

    elif server == 'tornado':
        print "Using websocket-enabled tornado server"
        from tornado.wsgi import WSGIContainer
        from tornado.web import Application, FallbackHandler
        from tornado.httpserver import HTTPServer
        from tornado.ioloop import IOLoop
        from tornado.websocket import WebSocketHandler
        application = Application(
            [TornadioRouter.route(),
             ("/(.*)", FallbackHandler, dict(fallback=WSGIContainer(app)))
             ],
            flash_policy_port = 843,
            flash_policy_file = '/static/socketio/flashpolicy.xml',
            socket_io_port = port)

        import logging
        logging.getLogger().setLevel(logging.DEBUG)
        tornadio.server.SocketServer(application)
        
    else:
        raise ValueError, "no known server '%s'"%server

class Daemon(object):
    """
    Run workspace frontend server.
    
    EXAMPLES::
    
        >>> Daemon(5000)
        Workspace Frontend Daemon on port 5000
    """
    def __init__(self, port, debug=False, pidfile=None, log=False, host="127.0.0.1"):
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
            try:
                os.kill(pid, 0)
                raise RuntimeError("there is already a frontend daemon running on port %s (pid=%s)"%(port, pid))
            except OSError:
                # no actual process
                pass

        self._port = port
        cmd = "python %s.py %s %s %s %s"%(__name__, port, debug, log, host)

        self._server = subprocess.Popen(cmd, shell=True)
        open(self._pidfile, 'w').write(str(self._server.pid))
        
        max_tries = 20
        while True:
            max_tries -= 1
            if max_tries == 0:
                raise RuntimeError("unable to start frontend")
            
            # TODO: here we should just check that it is a zombie
            # Next wait to see if it is listening.
            try:
                get('http://localhost:%s/'%port, timeout=10)
            except ConnectionError:
                time.sleep(0.1)
                # Ensure that the process is actually running, to
                # avoid an infinite loop trying to get from a URL
                # that will never come alive. 
                try:
                    os.kill(self._server.pid, 0)
                except OSError:
                    raise RuntimeError("unable to start frontend")
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
        """
        EXAMPLES::

            >>> import frontend, misc
            >>> R = frontend.Daemon(5002)
            >>> del R
        """
        try:
            self.kill()
        except:
            pass

    def kill(self):
        """
        Terminate the server subprocess.
        
        EXAMPLES:

            >>> r = Daemon(5000)
            >>> r.kill()
        """
        if hasattr(self, '_server'):
            self._server.kill()
            self._server.wait()
            try:
                os.kill(self._server.pid, 0)
            except OSError:
                # no such process -- safe to remove pidfile:
                if os.path.exists(self._pidfile):
                    os.unlink(self._pidfile)





##########################################
# Starting the server
##########################################

if __name__ == '__main__':
    if len(sys.argv) == 1:
        print "Usage: %s port [debug] [log]"%sys.argv[0]
        sys.exit(1)
    # TODO: redo to use proper py2.7 option parsing (everywhere)!
    port = int(sys.argv[1])
    if len(sys.argv) >= 3:
        debug = eval(sys.argv[2])
    else:
        debug = False
    if len(sys.argv) >= 4:
        log = eval(sys.argv[3])
    else:
        log = True
    if len(sys.argv) >= 5:
        host = sys.argv[4]
    else:
        host = "127.0.0.1"

    run(port=port, debug=debug, log=log, host=host, server='tornado')
        
