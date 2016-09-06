import pytest
import os
import re
import socket
import json
import signal
import struct
import hashlib

# import sys

###
# copied/modified from sage_server.py
# cut and paste because it takes over 30 sec to import sage_server
# and requires the script to be run from sage -sh
#
# purpose of these tests
#   ensure that sage worksheets return correct results for various cell inputs
#   not to provide unit tests of component fuctions in sagews modules
###

def unicode8(s):
    try:
        return unicode(s, 'utf8')
    except:
        try:
             return unicode(s)
        except:
             return s

PID = os.getpid()
from datetime import datetime

def log(*args):
    mesg = "%s (%s): %s\n"%(PID, datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3], ' '.join([unicode8(x) for x in args]))
    print(mesg)

def uuidsha1(data):
    sha1sum = hashlib.sha1()
    sha1sum.update(data)
    s = sha1sum.hexdigest()
    t = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    r = list(t)
    j = 0
    for i in range(len(t)):
        if t[i] == 'x':
            r[i] = s[j]; j += 1
        elif t[i] == 'y':
            # take 8 + low order 3 bits of hex number.
            r[i] = hex( (int(s[j],16)&0x3) |0x8)[-1]; j += 1
    return ''.join(r)

class ConnectionJSON(object):
    def __init__(self, conn):
        assert not isinstance(conn, ConnectionJSON)  # avoid common mistake -- conn is supposed to be from socket.socket...
        self._conn = conn

    def close(self):
        self._conn.close()

    def _send(self, s):
        length_header = struct.pack(">L", len(s))
        self._conn.send(length_header + s)

    def send_json(self, m):
        m = json.dumps(m)
        #log(u"sending message '", truncate_text(m, 256), u"'")
        self._send('j' + m)
        return len(m)

    def send_blob(self, blob):
        s = uuidsha1(blob)
        self._send('b' + s + blob)
        return s

    def send_file(self, filename):
        #log("sending file '%s'"%filename)
        f = open(filename, 'rb')
        data = f.read()
        f.close()
        return self.send_blob(data)

    def _recv(self, n):
        for i in range(20): # see http://stackoverflow.com/questions/3016369/catching-blocking-sigint-during-system-call
            try:
                #print "blocking recv (i = %s), pid=%s"%(i, os.getpid())
                r = self._conn.recv(n)
                #log("n=%s; received: '%s' of len %s"%(n,r, len(r)))
                return r
            except socket.error as (errno, msg):
                #print("socket.error, msg=%s"%msg)
                if errno != 4:
                    raise
        raise EOFError

    def recv(self):
        n = self._recv(4)
        if len(n) < 4:
            tries = 0
            while tries < 5:
                tries += 1
                n2 = self._recv(4 - len(n))
                n += n2
                if len(n) >= 4:
                    break
            else:
                raise EOFError
        n = struct.unpack('>L', n)[0]   # big endian 32 bits
        #log("got header, expect message of length %s"%n)
        s = self._recv(n)
        while len(s) < n:
            t = self._recv(n - len(s))
            if len(t) == 0:
                raise EOFError
            s += t

        if s[0] == 'j':
            try:
                return 'json', json.loads(s[1:])
            except Exception as msg:
                log("Unable to parse JSON '%s'"%s[1:])
                raise

        elif s[0] == 'b':
            return 'blob', s[1:]
        raise ValueError("unknown message type '%s'"%s[0])

def truncate_text(s, max_size):
    if len(s) > max_size:
        return s[:max_size] + "[...]", True
    else:
        return s, False

class Message(object):
    def _new(self, event, props={}):
        m = {'event':event}
        for key, val in props.iteritems():
            if key != 'self':
                m[key] = val
        return m

    def start_session(self):
        m = self._new('start_session')
        m['type'] = 'sage'
        return m

    def session_description(self, pid):
        return self._new('session_description', {'pid':pid})

    def send_signal(self, pid, signal=signal.SIGINT):
        return self._new('send_signal', locals())

    def terminate_session(self, done=True):
        return self._new('terminate_session', locals())

    def execute_code(self, id, code, preparse=True):
        return self._new('execute_code', locals())

    def execute_javascript(self, code, obj=None, coffeescript=False):
        return self._new('execute_javascript', locals())

    def output(self, id,
               stdout       = None,
               stderr       = None,
               code         = None,
               html         = None,
               javascript   = None,
               coffeescript = None,
               interact     = None,
               md           = None,
               tex          = None,
               d3           = None,
               file         = None,
               raw_input    = None,
               obj          = None,
               once         = None,
               hide         = None,
               show         = None,
               events       = None,
               clear        = None,
               delete_last  = None,
               done         = False   # CRITICAL: done must be specified for multi-response; this is assumed by sage_session.coffee; otherwise response assumed single.
              ):
        m = self._new('output')
        m['id'] = id
        t = truncate_text_warn
        did_truncate = False
        import sage_server  # we do this so that the user can customize the MAX's below.
        if code is not None:
            code['source'], did_truncate, tmsg = t(code['source'], sage_server.MAX_CODE_SIZE, 'MAX_CODE_SIZE')
            m['code'] = code
        if stderr is not None and len(stderr) > 0:
            m['stderr'], did_truncate, tmsg = t(stderr, sage_server.MAX_STDERR_SIZE, 'MAX_STDERR_SIZE')
        if stdout is not None and len(stdout) > 0:
            m['stdout'], did_truncate, tmsg  = t(stdout, sage_server.MAX_STDOUT_SIZE, 'MAX_STDOUT_SIZE')
        if html is not None  and len(html) > 0:
            m['html'], did_truncate, tmsg  = t(html, sage_server.MAX_HTML_SIZE, 'MAX_HTML_SIZE')
        if md is not None  and len(md) > 0:
            m['md'], did_truncate, tmsg  = t(md, sage_server.MAX_MD_SIZE, 'MAX_MD_SIZE')
        if tex is not None and len(tex)>0:
            tex['tex'], did_truncate, tmsg  = t(tex['tex'], sage_server.MAX_TEX_SIZE, 'MAX_TEX_SIZE')
            m['tex'] = tex
        if javascript is not None: m['javascript'] = javascript
        if coffeescript is not None: m['coffeescript'] = coffeescript
        if interact is not None: m['interact'] = interact
        if d3 is not None: m['d3'] = d3
        if obj is not None: m['obj'] = json.dumps(obj)
        if file is not None: m['file'] = file    # = {'filename':..., 'uuid':...}
        if raw_input is not None: m['raw_input'] = raw_input
        if done is not None: m['done'] = done
        if once is not None: m['once'] = once
        if hide is not None: m['hide'] = hide
        if show is not None: m['show'] = show
        if events is not None: m['events'] = events
        if clear is not None: m['clear'] = clear
        if delete_last is not None: m['delete_last'] = delete_last
        if did_truncate:
            if 'stderr' in m:
                m['stderr'] += '\n' + tmsg
            else:
                m['stderr'] = '\n' + tmsg
        return m

    def introspect_completions(self, id, completions, target):
        m = self._new('introspect_completions', locals())
        m['id'] = id
        return m

    def introspect_docstring(self, id, docstring, target):
        m = self._new('introspect_docstring', locals())
        m['id'] = id
        return m

    def introspect_source_code(self, id, source_code, target):
        m = self._new('introspect_source_code', locals())
        m['id'] = id
        return m

message = Message()

###
# end of copy region
###

def set_salvus_path(self, id):
    r"""
    create json message to set path and file at start of virtual worksheet
    """
    m = self._new('execute_code', locals())

default_log_file = os.path.join(os.environ["HOME"], ".smc/sage_server/sage_server.log")

def get_sage_server_info(log_file = default_log_file):
    # log file ~/.smc/sage_server/sage_server.log
    # sample sage_server startup line in first lines of log:
    # 3136 (2016-08-18 15:02:49.372): Sage server 127.0.0.1:44483
    try:
        with open(log_file, "r") as inf:
            for lno in range(5):
                line = inf.readline().strip()
                m = re.search("Sage server (?P<host>[\w.]+):(?P<port>\d+)$", line)
                if m:
                    host = m.group('host')
                    port = int(m.group('port'))
                    break
            else:
                raise ValueError('Server info not found in log_file',log_file)
    except IOError:
        pytest.fail("Unable to open log file %s\nYou may need to open a sage worksheet"%log_file)
    return host, int(port)

secret_token = None
secret_token_path = os.path.join(os.environ['SMC'], 'secret_token')

def client_unlock_connection(sock):
    secret_token = open(secret_token_path).read().strip()
    sock.sendall(secret_token)

def path_info():
    file = __file__
    full_path = os.path.abspath(file)
    head, tail = os.path.split(full_path)
    #head = "/projects/ccd4d4a4-29a8-4c39-85c2-a630cb1e9b6c/TEST_SAGEWS"
    #file = "/projects/ccd4d4a4-29a8-4c39-85c2-a630cb1e9b6c/TEST_SAGEWS/scratch.sagews"
    file = head + "/testing.sagews"
    return head, file

@pytest.fixture()
def test_id(request):
    test_id.id += 1
    return test_id.id
test_id.id = 1

@pytest.fixture(scope = "session")
def sagews(request):
    # setup connection to sage_server TCP listener
    host, port = get_sage_server_info()
    print("host %s  port %s"%(host, port))
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((host, port))
    print("connected to socket")

    # unlock
    client_unlock_connection(sock)
    print("socket unlocked")
    conn = ConnectionJSON(sock)
    c_ack = conn._recv(1)
    assert c_ack == 'y',"expect ack for token, got %s"%c_ack

    # start session
    conn.send_json(message.start_session())
    print("start_session sent")
    typ, mesg = conn.recv()
    assert typ == 'json'
    pid = mesg['pid']
    print("sage_server PID = %s" % pid)

    #
    # start mock worksheet - make different layer of fixture?
    #conn.send_json({'event':'output', 'id':id, 'done':True})
    # teardown needed - terminate session nicely
    return conn
