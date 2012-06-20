"""
Backend Server

Backend server processes run on each compute machine, preferably in a
virtual machine that is very regularly updated with the latest
security patches.  The backend launches workers that serve sessions in
a given workspace.  On a multiprocessor machine, we would have several
of these running on the same computer in order to balance the load
between them.  The backend server is a TornadoWeb application.  It:

* Sends status updates to the frontend

* HTTP server:
   - static html/css/javascript of socket.io application:
        - desktop version
        - mobile version 
   - load statistics
   
* Socket.io server that handles connections from desktop/mobile
  application

* Spawn worker processes (over ssh)

* Communication with worker processes via a non-blocking Unix Domain
  Socket with permission set so only the backend and worker can
  see the communication.  
    

"""

DATA = None

import argparse, datetime, functools, inspect, os, Queue, signal, json, socket, string, subprocess, sys, tempfile, time

from tornado import web, iostream, ioloop
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event

import misc

##########################################################
# The database
##########################################################
import backend_database as db

##########################################################
# Setup logging
##########################################################
import logging
logging.basicConfig()
log = logging.getLogger()

#############################################################
# HTTP Server handlers
#############################################################

routes = []

# authentication decorators

def auth_frontend(f):
    # TODO -- this is a place holder; need to implement.  This means
    # that we require an authenticated in some way frontend server is
    # available; maybe have to use signed cookies.
    return f

def auth_user(f):
    # TODO -- this is a place holder; need to implement.  This
    # decorator gives error unless an authenticated user is signed in.
    # If so, then some variable will be set that gives their user id,
    # which we then trust.
    return f

#############################################################
# Tornado async support; these functions will likely have to be
# factored out to another module, so can be used by the frontend.
#############################################################
import tornado.ioloop

def async_subprocess(args, callback=None, timeout=10, cwd=None):
    """
    Execute the blocking subprocess with given args (as in
    subprocess.Popen), then call the callback function with input a
    dictionary

       {'exitcode':integer_exit_code, 'timed_out':bool,
        'stdout':stdout_string, 'stderr', stderr_string},

    where timed_out is True only if the subprocess was killed
    because it exceeded timeout microseconds (wall time).

    INPUT:

    - ``args`` -- string, or a list of program arguments
    - ``callback`` -- None or function that takes 1 input
    - ``timeout`` -- float; time in seconds (default: 10 seconds)

    OUTPUT:

    - subprocess object
    """
    try:
        p = subprocess.Popen(args, close_fds=True, cwd=cwd,
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        log.debug("spawned async subprocess %s%s: %s"%(p.pid, '(cwd="%s")'%cwd if cwd else '', ' '.join(args)))
    except Exception, msg:
        callback({'stdout':'', 'stderr':str(msg), 'exitcode':1, 'time_out':False})
        return
        
    iol = ioloop.IOLoop.instance()
    mesg = {'timed_out':False}
    
    def finished(fd, events):
        iol.remove_timeout(handle)
        iol.remove_handler(fd)
        print "p.wait() = "
        print p.wait()
        print "stdout = "
        print p.stdout.read()
        print "stderr = "
        print p.stderr.read()
        mesg.update({'stdout':p.stdout.read(), 'stderr':p.stderr.read(), 'exitcode':p.wait()})
        if callback is not None:
            callback(mesg)
        
    def took_too_long():
        mesg['timed_out'] = True
        log.debug("sending SIGKILL to async subprocess %s"%p.pid)
        p.send_signal(signal.SIGKILL)
        
    iol.add_handler(p.stdout.fileno(), finished, iol.READ)
    handle = iol.add_timeout(datetime.timedelta(seconds=float(timeout)), took_too_long)
    return p

### This was used for development, and can be deleted.
class Async(tornado.web.RequestHandler):
    def get(self):
        def f(mesg):
            print mesg
        for i in range(int(self.get_argument('n',5))):
            #async_subprocess(['python', "-c", "print %s;import sys;sys.stdout.flush();import time;time.sleep(1);print 10"%i], f, timeout=.5)
            async_subprocess(['python', "-c", "print %s;import sys;sys.stdout.flush();import time;time.sleep(5);print 10"%i], f)
            
routes.extend([(r"/async", Async)])
    

##########################################################
# Managing backends
##########################################################

# Functions that take a callback option only have the callback called
# if it is not None.

class Workspace(object):
    def __init__(self, id):
        self.id = int(id)
        
    def path(self):
        return os.path.join(DATA, 'workspaces', str(self.id))

    def init_git_repo(self, callback):
        args = ['python', 'backend_blocking.py', '--init_local_repo', '--path="%s"'%self.path()]
        async_subprocess(args, callback=callback)
        
    def _do_file_command(self, file, command, callback):        
        t = tempfile.mkstemp()
        def after_git(mesg):
            os.unlink(t[1])
            if callback:
                if mesg['exitcode']:
                    callback({'status':'fail', 'mesg':mesg['stderr']})
                else:
                    callback({'status':'ok'})
                    
        os.write(t[0], file)
        os.close(t[0])
        async_subprocess(['git', command, t[1], self.path()], callback=after_git, cwd=self.path())

    def _do_command(self, args, callback):
        def after(mesg):
            if mesg['exitcode']:
                callback({'status':'fail', 'mesg':mesg['stderr']})
            else:
                callback({'status':'ok'})
        async_subprocess(args, callback=after, cwd=self.path())

    def clone(self, bundle, callback):
        """Create a workspace from the bundle."""
        self._do_file_command(bundle, 'clone', callback)

    def pull(self, bundle, callback):
        """Apply bundle."""
        self._do__file_command(bundle, 'pull', callback)

    def add(self, callback):
        """Add all files to the git repo."""
        self._do_command(['git', 'add', '.'], callback)                         

    def commit(self, log_message, callback):
        """Commit changes to the repository with the given log message."""
        self._do_command(['git', 'commit', '-a', '-m', log_message], callback)        
        
    def init(self, callback):
        """Initialize workspace on disk.  Analogue of 'git init'."""
        path = self.path()
        if os.path.exists(path):
            callback({'status':'fail', 'mesg':"workspace %s already exists"%self.id})
            return
        # initialize new empty git repo
        os.makedirs(path)
        # TODO: change permission and group on path!!
        self._do_command(['git', 'init'], callback)

    def bundle(self, rev, callback):
        """Create bundle from workspace with given id, starting at
        given revision.  For example, if rev=='master', bundle entire history.
        (This only works on non-empty repositories.)"""
        t = tempfile.mkstemp()
        def after_git(mesg):
            if mesg['exitcode']:
                callback({'status':'fail', 'mesg':mesg['stderr']})
            else:
                output_mesg = {'status':'ok', 'bundle':open(t[1]).read()}
                os.unlink(t[1])
                callback(output_mesg)
        async_subprocess(['git', 'bundle', 'create', t[1], rev, '--all'], callback=after_git, cwd=self.path())

    def rev(self, callback):
        """The callback gets called with either something like
               {'status':'ok', 'rev':'bf65195c16699550c0fc2b11fdde2e88ad48eae9'}
        or
               {'status':'fail', 'mesg':...}
        Used when a remote backend wants to push its changes to us and needs to know this
        repos current HEAD revision.  The repo must be nonempty.
        """
        def after_git(mesg):
            if mesg['exitcode']:
                callback({'status':'fail', 'mesg':mesg['stderr']})
            else:
                callback({'status':'ok', 'rev':mesg['stdout']})                
        async_subprocess(['git', 'rev-parse', 'HEAD'], callback=after_git, cwd=self.path())

    def log(self, callback):
        """
        On success, the callback called with a dictionary that looks like this:
        
            {'status':'ok', 'log':[{u'author_email': u'wstein@gmail.com', u'date': u'Thu Jun 14 10:10:17 2012 -0700', u'message': u'a log message', u'id': u'262f1fc9d85afe0db040dc5cd6e7341c3dd67877', u'author_name': u'William Stein'}, ...]}

        where the commits are in order from newest to oldest. 

        On fail, the callback is called with:
            {'status':'fail', 'mesg':'why...'}

        WARNING: Calling log on an empty repo will fail.
        """
        # See http://blog.lost-theory.org/post/how-to-parse-git-log-output/
        git_commit_fields = ['id', 'author_name', 'author_email', 'date', 'message']
        git_log_format = '%x1f'.join(['%H', '%an', '%ae', '%ad', '%s']) + '%x1e'
        def parse_log(mesg):
            if mesg['exitcode']:
                callback({'status':'fail', 'mesg':mesg['stderr']})
            else:
                # extract the log and parse it
                log = [dict(zip(git_commit_fields, line.strip('\n\x1e"').split("\x1f")))
                       for line in mesg['stdout'].splitlines()]
                callback({'status':'ok', 'log':log})
        async_subprocess(['git', 'log', '--format="%s"'%git_log_format], callback=parse_log, cwd=self.path())

    ###############################################################################
    # It's not exactly clear to me what the semantics for the following should be.
    # Study what github/bitbucket do, etc.
    # For the very, very first version, we don't really need this to be implemented.
    ###############################################################################
    def checkout(self, rev, callback):
        raise NotImplementedError

    def revert(self, rev, callback):
        raise NotImplementedError


class WorkspaceCommandHandler(web.RequestHandler):
    @auth_frontend
    @tornado.web.asynchronous
    def post(self):
        id = int(self.get_argument("id"))
        command = self.get_argument("command")
        w = Workspace(id)
        callback = functools.partial(self.callback, command)
        try:
            f = getattr(w, command)
        except AttributeError:
            callback({'status':'error', 'mesg':'no command "%s"'%command})
            return
        spec = inspect.getargspec(f)
        num_positional = len(spec.args) - (len(spec.defaults) if spec.defaults else 0)
        v = [callback if a=='callback' else self.get_argument(a) for a in spec.args[1:num_positional]]
        for i in range(num_positional, len(spec.args)):
            v.append(self.get_argument(spec.args[i], spec.defaults[i-num_positional]))
        f(*v)

    def callback(self, command, mesg):
        if 'bundle' in mesg:
            self.write(mesg['bundle'])
        else:
            self.write(mesg)
        self.finish()
        
routes.extend([(r"/workspace", WorkspaceCommandHandler)])        

class IndexHandler(web.RequestHandler):
    def get(self):
        # TODO: need to detect mobile versus desktop here
        self.render("static/sagews/desktop/backend.html")
        #self.render("static/sagews/mobile/backend.html")

class RegisterManagerHandler(web.RequestHandler):
    def post(self):
        m = Manager(self.get_argument('socket_name'))
        if m not in managers:
            unallocated_managers.append(m)



#############################################################
# Operations involving the Remote Worker Machine and Accounts
#############################################################

def init_worker(username, hostname, path, callback):
    """
    Initialize all data for a given worker machine and the
    corresponding accounts in the database.  This is done in a
    subprocess, and when done callback gets called with
    {'status':'ok'} or {'status':'error', 'mesg':'what went wrong'}.

    This will timeout after 60 seconds.  It takes significant time
    since it kills processes, deletes files, etc., for many users.

    1. Get relevant worker configuration.
    2. Store worker configuration in database.
    3. Tell manager of worker to kill all processes owned by any
       worker account and delete all files from their home
       directories.
    """
    async_subprocess(['python', 'backend_blocking.py', '--init_worker',
                      '--username=%s'%username, '--hostname=%s'%hostname, '--path="%s"'%path],
                     callback=callback, timeout=60)

## TODO: this route is mainly for debugging/testing, and is dangerous.    
class WorkerInitHandler(web.RequestHandler):
    @auth_frontend
    @tornado.web.asynchronous
    def post(self):
        username = self.get_argument("username")
        hostname = self.get_argument("hostname")
        path = self.get_argument("path")
        init_worker(username, hostname, path, self.callback)
    def callback(self, mesg):
        self.write(mesg)
        self.finish()
routes.extend([(r"/worker/init", WorkerInitHandler)])


def sanitize_log_message(s):
    safe = string.ascii_letters + ' ;.,:_'
    return ''.join([x if x in safe else '_' for x in s])


def worker_account_commit(account_id, log_message, callback):
    """
    Tell the remote worker account to add any files and commit any
    changes to their repository.
    """
    try:
        s = db.session()
        account = s.query(db.WorkerAccount).filter(db.WorkerAccount.id == account_id)
        user = '%s@%s'%(account.username, account.worker.hostname)
        log_message = sanitize_log_message(log_message)
        remote_cmd = 'git add . && git commit -a -m "%s"'%log_message
        async_subprocess(['ssh', user, remote_cmd], callback)
    except Exception, err:
        callback({'status':'error', 'mesg':str(err)})      
    
def pull_from_worker_account(account_id, callback):
    """
    Do this:
    
       1. cd path/to/repo && git pull account@worker_host
       2. Update database to reflect last save time, etc. 
    """
    try:
        s = db.session()
        account = s.query(db.WorkerAccount).filter(db.WorkerAccount.id == account_id)
        user = '%s@%s'%(account.username, account.worker.hostname)
        ws = account.workspace
        
        def do_pull():
            async_subprocess(['git', 'pull', user + ':.'], callback=update_database, cwd=Workspace(ws.id).path())
            
        def update_database(mesg):
            if mesg['status'] != 'ok':
                callback(mesg)
            else:
                ws.last_commit_timestamp = db.now()
                s.commit()

        do_pull()
            
    except Exception, err:
        s.rollback()
        callback({'status':'error', 'mesg':str(err)}        


def clean_worker_account(account_id, callback):
    """
    1. Lookup account in database.
    2. If necessary, kill and cleanup all files associated with account_id.
    3. Mark account as clean in database.
    4. callback({'status':['ok' or 'error']})
    """
    try:
        s = db.session()
        account = s.query(db.WorkerAccount).filter(db.WorkerAccount.id == account_id)
        manager = '%s@%s'%(account.worker.username, account.worker.hostname)
        if not account.is_clean:

            def reset_account():
                async_subprocess(['ssh', 'python /tmp/worker.py --reset_account=%s'%account.username],
                                 callback=record_account_is_clean)

            def record_account_is_clean(mesg):
                if mesg['status'] != 'ok':
                    callback(mesg)
                else:
                    account.is_clean = True
                    s.commit()
                    callback({'status':'ok'})


            reset_account()
        
    except Exception, err:
        s.rollback()
        callback({'status':'error', 'mesg':str(err)}    

def start_socket_server(account_id, callback):
    """
    1. Lookup in database.
    2. Run via ssh /tmp/worker.py as a deamon.
    """
    try:
        s = db.session()
        account = s.query(db.WorkerAccount).filter(db.WorkerAccount.id == account_id)
        user = '%s@%s'%(account.username, account.worker.hostname)
        #TODO: put in other ulimit-tations, as specified in database
        remote_cmd = 'ulimit -v %s; sage --python /tmp/worker.py --hostname=%s --daemon'%(
            1024*account.worker.ram, account.worker.ip_address)
        async_subprocess(['ssh', user, remote_cmd], callback)
    except Exception, err:
        callback({'status':'error', 'mesg':str(err)}
    

def setup_git_repo_in_worker_account(account_id, bundle_filename, callback):
    """
    Setup home directory git repo for a worker account.
        
        - For security reasons, worker_account can't pull from backend.
        - For quota reasons, worker_account can't have the bundle
          file, since it takes disk space.
        - So we copy the bundle as the manager to /tmp, init, pull
          from that, then delete the bundle.
        - We pull instead of cloning, since we want $HOME to *be*
          the git repo, and we can't create that directory.

        - A "template" for this is:
              scp a785d...0 sagews@worker:/tmp/ && ssh sagews_worker_1@worker "git init&&git pull /tmp/a785d...0 master && ssh sagews@worker rm /tmp/a785d...0"
    """
    try:
        s = db.session()
        account = s.query(db.WorkerAccount).filter(db.WorkerAccount.id == account_id)
        user = '%s@%s'%(account.username, account.worker.hostname)
        manager = '%s@%s'%(account.worker.username, account.worker.hostname)
        account.is_clean = False

        def copy_bundle():
            async_subprocess(['scp', bundle_filename, manager + ':/tmp/'], callback=make_repo)

        def make_repo(mesg):
            if mesg['status'] != 'ok':
                callback(mesg)
            else:
                async_subprocess(['ssh', user, 'git init && git pull "/tmp/%s" master'%bundle_filename], callback=delete_bundle)

        def delete_bundle(mesg):
            async_subprocess(['ssh', manager, 'rm -f /tmp/%s'%bundle_filename], callback=callback)

        copy_bundle()
        s.commit()
        
    except Exception, err:
        try:  # no matter what, at least try to mark things as bad if anything above fails mysteriously
            account.is_clean = False
            s.commit()
        except: pass
        callback({'status':'error', 'mesg':str(err)})


def start_worker_account(account_id, bundle_filename, callback):
    """
    INPUT:

    - account_id -- id of an Account entry in the database
    - bundle_filename -- the name of a file on the filesystem that is
      a git bundle; this file is assumed to be of the form rev_md5_hex.bundle,
      so it will be unique.
    - callback function called after this completes (or None)
    """
    # Ensure account is clean
    def clean_account():
        clean_worker_account(account_id, callback=setup_repo)

    # Setup git repo for worker account
    def setup_repo(mesg):
        if mesg['status'] != 'ok':
            callback(mesg)
        else:
            setup_git_repo_in_worker_account(account_id, bundle_filename, callback=socket_server):

    # Start the socket server
    def socket_server(mesg):
        if mesg['status'] != 'ok':
            callback(mesg)
        else:
            start_socket_server(account_id, callback=callback)

    clean_account()
            
    
## TODO: this is mainly for debugging    
class StartWorkerAccountHandler(web.RequestHandler):
    @auth_frontend
    @tornado.web.asynchronous
    def post(self):
        start_worker_account(self.get_argument('account_id'),
                             self.get_argument('bundle_filename'), self.callback)
    def callback(self, mesg):
        self.write(mesg)
        self.finish()
        
class CleanWorkerAccountHandler(web.RequestHandler):
    @auth_frontend
    @tornado.web.asynchronous
    def post(self):
        clean_worker_account(self.get_argument('account_id'), self.callback)
    def callback(self, mesg):
        self.write(mesg)
        self.finish()

routes.extend([(r"/worker/account/clean", CleanWorkerAccountHandler)])

#############################################################
# Session managers and workers
#############################################################

# TODO: document these
unallocated_managers = []
managers = {}
next_sage_session_id = 0
sage_sessions = {}

def manager_for_user(username):
    """
    Return a valid manager for the given user, if there are any
    registered managers available.
    """
    if username in managers:
        M = managers[username]
        if M.is_valid():
            return M
    while len(unallocated_managers) > 0:
        M = unallocated_managers.pop()
        if M.is_valid():
            managers[username] = M
            return M
    raise RuntimeError, "no available valid managers"

class Manager(object):
    def __init__(self, socket_name):
        self._socket_name = socket_name

    def __hash__(self):
        return hash(self._socket_name)

    def __cmp__(self, other):
        return cmp(type(self),type(other)) and cmp(self._socket_name, other._socket_name)

    def is_valid(self):
        # todo: can probably do better than this
        return os.path.exists(self._socket_name)

    def new_session(self):
        global next_sage_session_id
        id = next_sage_session_id
        next_sage_session_id += 1
        session = SageSession(id=id, socket_name=self._socket_name)
        sage_sessions[id] = session
        return session

class SageSession(object):
    def __init__(self, id, socket_name):
        self.id = id
        self._socket_name = socket_name
        self._stream = None
        self.connect()

    def connect(self):
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM, 0)
        stream = iostream.IOStream(s)
        stream.connect(self._socket_name)
        self._stream = stream
        self._mesg_queue = Queue.Queue()
        self._receiving = False

    def is_connected(self):
        """
        Return True if this session is currently connected.
        """
        return (self._stream is not None) and not self._stream.closed()

    def _send(self, mesg, callback=None):
        self._stream.write(json.dumps(mesg) + '\0', callback=callback)

    def _recv(self, callback=None):
        self._stream.read_until('\0', lambda s: callback(json.loads(s[:-1])))

    def __del__(self):
        if self._stream is not None:
            self._stream.close()

    def send(self, mesg, sender):
        if not self.is_connected():
            sender.emit('recv', {'status':'closed', 'error':'socket is not connected', 'done':True})
            return
        self._mesg_queue.put((mesg, sender))
        self._handle_next_mesg()

    def _handle_next_mesg(self):
        if self._receiving or self._mesg_queue.empty():
            return
        mesg, sender = self._mesg_queue.get()
        self._receiving = True

        try:
            def handle_message(mesg):
                sender.emit('recv', mesg)
                if mesg.get('done'):
                    self._receiving = False
                    # handle another message, if there is one in the queue
                    self._handle_next_mesg()
                else:
                    # receive next message about this computation
                    self._recv(handle_message)

            def when_done_sending():
                self._recv(handle_message)

            self._send(mesg, when_done_sending)
        except IOError, err:
            # the socket connection closed for some reason; record this fact
            self._stream = None
            sender.emit('recv', {'status':'closed', 'error':str(err), 'done':True})


#############################################################
# Socket.io server
#############################################################
class SocketIO(SocketConnection):
    clients = set()

    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        log.debug("new connection: %s"%self)

    @event
    def new_session(self):
        """
        Sends new session id via new_session message.
        """
        # Todo: figure out username properly
        username = 'wstein'
        try:
            self.emit('new_session', manager_for_user(username).new_session().id)
        except RuntimeError:
            # no manager available
            self.emit('new_session', -1)

    @event
    def session_send(self, id, mesg):
        """
        Send a JSON mesg to the Sage session with given id.
        Returns {'status':'ok'} or {'status':'error', 'mesg':'...'}.
        """
        if not isinstance(id, int):
            return {'status':'error', 'mesg':'session id must be an integer'}
        if id not in sage_sessions:
            return {'status':'error', 'mesg':'unknown session id'}

        sage_sessions[id].send(mesg, self)
    
        
#############################################################
# Configure and run the socket.io/web server
#############################################################
        
router = TornadioRouter(SocketIO)
routes.extend([(r"/", IndexHandler),
               (r"/register_manager", RegisterManagerHandler),
               (r"/static/(.*)", web.StaticFileHandler, {'path':'static'})])


def status_update_uri(frontend_uri):
    return frontend_uri + '/backend/send_status_update'

def send_status_mesg(id, frontend_uri, status):
    uri = status_update_uri(frontend_uri)
    data={'id':id, 'status':status}
    log.debug("Sending status update to %s with data=%s"%(uri, data))
    misc.post(uri, data=data)

def start_mesg(id, frontend_uri):
    send_status_mesg(id, frontend_uri, 'running')

def stop_mesg(id, frontend_uri):
    send_status_mesg(id, frontend_uri, 'stopped')

def run(id, port, address, debug, secure, frontend_uri, workers):
    if os.path.exists(pidfile):
        try:
            pid = int(open(pidfile).read())
            os.kill(pid, 0)
            # TODO
            #raise RuntimeError, "server with process %s already running"%pid
        except OSError:
            pass

    open(pidfile,'w').write(str(os.getpid()))
        
    log.debug("Launching backend%s: http%s://%s:%s"%(
        ' in debug mode' if debug else ' in production mode',
        's' if secure else '',
        address if address else '*', port))

    if secure:  # todo
        raise NotImplementedError

    app = web.Application(router.apply_routes(routes),
                socket_io_port=port, socket_io_address=address, debug=debug)

    if frontend_uri:
        start_mesg(id, frontend_uri)

    try:
        SocketServer(app, auto_start=True)
    except Exception, mesg:
        log.debug(str(mesg))
        # now it has stopped, so we remove the pidfile
        os.unlink(pidfile)
        # and send a stop message
        if frontend_uri:
            stop_mesg(id, frontend_uri)

def stop(id, frontend_uri):
    if not os.path.exists(pidfile):
        log.debug("No pidfile, so nothing to stop.")
    else:
        pid = int(open(pidfile).read())
        quits = 5
        for i in range(50):  # try at most n times
            try:
                if quits:
                    os.kill(pid, signal.SIGQUIT)
                    log.debug("Sent SIGQUIT to process %s"%pid)
                    quits -= 1
                else:
                    os.kill(pid, signal.SIGKILL)
                    log.debug("Sent SIGKILL to process %s"%pid)                            
                time.sleep(.25)
            except OSError:
                log.debug("Process %s has died"%pid)
                if os.path.exists(pidfile): # it could be there if death was not clean
                    try:
                        os.unlink(pidfile)
                    except OSError:  # just in case
                        pass
                break
                
    if frontend_uri:
        stop_mesg(id, frontend_uri)

        
#############################################################
# Command line interface
#############################################################

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Run or stop a backend server instance")

    parser.add_argument("--id", dest="id", type=int, default='1',
                        help="database id number of backend server (default: 1)")
    parser.add_argument("--port", dest='port', type=int, default=8080,
                        help="port the server listens on (default: 8080)")
    parser.add_argument("--address", dest="address", type=str, default="",
                        help="address the server listens on (default: '')")
    parser.add_argument("--workers", dest="workers", type=str, default="",
                        help="comma separated list of worker machines to use (default: '' which means: run a worker as same user, which is unsafe except for testing purposes)")
    parser.add_argument("--no_debug", "-n", dest="no_debug", action='store_const', const=False,
                        help="disable debug mode", default=False)
    parser.add_argument("--secure", "-s", dest="secure", action='store_const', const=True,
                        help="SSL secure mode (default: False)", default=False)
    parser.add_argument("--frontend", dest="frontend_uri", type=str,
                        help="URI of frontend server to status update to", default='')
    parser.add_argument("--stop", dest="stop", type=bool, 
                        help="Stop the backend with given id, if it is running", default=False)
    
    args = parser.parse_args()

    # setup data directory variable
    DATA = os.path.abspath(os.path.join('data', 'backend-%s'%args.id))
    if not os.path.exists(DATA):
        os.makedirs(DATA)
    pidfile = os.path.join(DATA, 'pid')

    debug = not args.no_debug
    
    if debug:
        log.setLevel(logging.DEBUG)


    if args.stop:
        stop(args.id, args.frontend_uri)
    else:
        run(id=args.id, port=args.port, address=args.address, debug=debug,
            secure=args.secure, frontend_uri=args.frontend_uri, workers=args.workers)



