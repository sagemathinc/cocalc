import pytest
import os
import re
import socket
import json
import signal
import struct
import hashlib
import time
from datetime import datetime

###
# much of the code here is copied from sage_server.py
# cut and paste was done because it takes over 30 sec to import sage_server
# and requires the script to be run from sage -sh
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
                r = self._conn.recv(n)
                return r
            except socket.error as exc:
                if isinstance(exc, socket.timeout):
                    raise
                else:
                    (errno, msg) = exc
                    if errno != 4:
                        raise
        raise EOFError

    def recv(self):
        n = self._recv(4)
        if len(n) < 4:
            print("expecting 4 byte header, got", n)
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
        #print("test got header, expect message of length %s"%n)
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
        return self._new('start_session')

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

    # NOTE: these functions are NOT in sage_server.py
    def save_blob(self, sha1):
        return self._new('save_blob', {'sha1':sha1})

    def introspect(self, id, line, top):
        return self._new('introspect', {'id':id, 'line':line, 'top':top})

message = Message()

###
# end of copy region
###

def set_salvus_path(self, id):
    r"""
    create json message to set path and file at start of virtual worksheet
    """
    m = self._new('execute_code', locals())

# hard code SMC for now so we don't have to run with sage wrapper
SMC = os.path.join(os.environ["HOME"], ".smc")
default_log_file = os.path.join(SMC, "sage_server", "sage_server.log")
default_pid_file = os.path.join(SMC, "sage_server", "sage_server.pid")

def get_sage_server_info(log_file = default_log_file):
    for loop_count in range(3):
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
                        #return host, int(port)
                        break
                else:
                    raise ValueError('Server info not found in log_file',log_file)
                break
        except IOError:
            print("starting new sage_server")
            os.system("smc-sage-server start")
            time.sleep(5.0)
    else:
        pytest.fail("Unable to open log file %s\nThere is probably no sage server running. You either have to open a sage worksheet or run smc-sage-server start"%log_file)
    print("got host %s  port %s"%(host, port))
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
    #file = head + "/testing.sagews"
    return head, file

def recv_til_done(conn, test_id):
    r"""
    Discard json messages from server for current test_id until 'done' is True
    or limit is reached. Used in finalizer for single cell tests.
    """
    for loop_count in range(5):
        typ, mesg = conn.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'done' in mesg
        if mesg['done']:
            break
    else:
        pytest.fail("too many responses for message id %s"%test_id)
###
# Start of fixtures
###

@pytest.fixture(autouse = True, scope = "session")
def sage_server_setup(pid_file = default_pid_file, log_file = default_log_file):
    r"""
    make sure sage_server pid file exists and process running at given pid
    """
    print("initial fixture")
    try:
        pid = int(open(pid_file).read())
        os.kill(pid, 0)
    except:
        assert os.geteuid() != 0, "Do not run as root."
        os.system("pkill -f sage_server_command_line")
        os.system("rm -f %s"%pid_file)
        os.system("smc-sage-server start")
    for loop_count in range(20):
        time.sleep(0.5)
        if not os.path.exists(log_file):
            continue
        lmsg = "Starting server listening for connections"
        if lmsg in open(log_file).read():
            break
    else:
        pytest.fail("Unable to start sage_server and setup log file")
    return

@pytest.fixture()
def test_id(request):
    r"""
    Return increasing sequence of integers starting at 1. This number is used as
    test id as well as message 'id' value so sage_server log can be matched
    with pytest output.
    """
    test_id.id += 1
    return test_id.id
test_id.id = 1

# see http://doc.pytest.org/en/latest/tmpdir.html#the-tmpdir-factory-fixture
@pytest.fixture(scope='session')
def image_file(tmpdir_factory):
    def make_img():
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        my_circle=plt.Circle((0.5,0.5),0.2)
        fig, ax = plt.subplots()
        ax.add_artist(my_circle)
        return fig
    fn = tmpdir_factory.mktemp('data').join('my_circle.png')
    make_img().savefig(str(fn))
    return fn

@pytest.fixture(scope='session')
def data_path(tmpdir_factory):
    path = tmpdir_factory.mktemp("data")
    path.ensure_dir()
    return path

@pytest.fixture()
def exec2(request, sagews, test_id):
    r"""
    Fixture function exec2. Depends on two other fixtures, sagews and test_id.
    If output & patterns are omitted, the cell is not expected to produce a
    stdout result. All arguments after 'code' are optional.

    - `` code `` -- string of code to run

    - `` output `` -- string or list of strings of output to be matched up to leading & trailing whitespace

    - `` pattern `` -- regex to match with expected stdout output

    - `` html_pattern `` -- regex to match with expected html output

    EXAMPLES:

    ::

        def test_assg(exec2):
            code = "x = 42\nx\n"
            output = "42\n"
            exec2(code, output)

    ::

        def test_set_file_env(exec2):
            code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
            exec2(code)

    ::

        def test_sh(exec2):
            exec2("sh('date +%Y-%m-%d')", pattern = '^\d{4}-\d{2}-\d{2}$')

    .. NOTE::

        If `output` is a list of strings, `pattern` and `html_pattern` are ignored

    """
    def execfn(code, output = None, pattern = None, html_pattern = None):
        m = message.execute_code(code = code, id = test_id)
        m['preparse'] = True
        # send block of code to be executed
        sagews.send_json(m)

        # check stdout
        if isinstance(output, list):
            for o in output:
                typ, mesg = sagews.recv()
                assert typ == 'json'
                assert mesg['id'] == test_id
                assert 'stdout' in mesg
                assert o.strip() in (mesg['stdout']).strip()
        elif output or pattern:
            typ, mesg = sagews.recv()
            assert typ == 'json'
            assert mesg['id'] == test_id
            assert 'stdout' in mesg
            mout = mesg['stdout']
            if output is not None:
                assert output in mout
            elif pattern is not None:
                assert re.search(pattern, mout) is not None
        elif html_pattern:
            typ, mesg = sagews.recv()
            assert typ == 'json'
            assert mesg['id'] == test_id
            assert 'html' in mesg
            assert re.search(html_pattern, mesg['html']) is not None

    def fin():
        recv_til_done(sagews, test_id)

    request.addfinalizer(fin)
    return execfn

@pytest.fixture()
def execinteract(request, sagews, test_id):
    def execfn(code):
        m = message.execute_code(code = code, id = test_id)
        m['preparse'] = True
        sagews.send_json(m)
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'interact' in mesg

    def fin():
        recv_til_done(sagews, test_id)

    request.addfinalizer(fin)
    return execfn


@pytest.fixture()
def execblob(request, sagews, test_id):

    def execblobfn(code, want_html=True, want_javascript=False, file_type = 'png', ignore_stdout=False):

        SHA_LEN = 36

        # format and send the plot command
        m = message.execute_code(code = code, id = test_id)
        sagews.send_json(m)

        # expect several responses before "done", but order may vary
        want_blob = True
        want_name = True
        while any([want_blob, want_name, want_html, want_javascript]):
            typ, mesg = sagews.recv()
            if typ == 'blob':
                assert want_blob
                want_blob = False
                # when a blob is sent, the first 36 bytes are the sha1 uuid
                print("blob len %s"%len(mesg))
                file_uuid = mesg[:SHA_LEN]
                assert file_uuid == uuidsha1(mesg[SHA_LEN:])

                # sage_server expects an ack with the right uuid
                m = message.save_blob(sha1 = file_uuid)
                sagews.send_json(m)
            else:
                assert typ == 'json'
                if 'html' in mesg:
                    assert want_html
                    want_html = False
                    print('got html')
                elif 'javascript' in mesg:
                    assert want_javascript
                    want_javascript = False
                    print('got javascript')
                elif ignore_stdout and 'stdout' in mesg:
                    pass
                else:
                    assert want_name
                    want_name = False
                    assert 'file' in mesg
                    print('got file name')
                    assert file_type in mesg['file']['filename']

        # final response is json "done" message
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['done'] == True

    return execblobfn

@pytest.fixture()
def execintrospect(request, sagews, test_id):
    def execfn(line, completions, target, top=None):
        if top is None:
            top = line
        m = message.introspect(test_id, line=line, top=top)
        m['preparse'] = True
        sagews.send_json(m)
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert mesg['event'] == "introspect_completions"
        assert mesg['completions'] == completions
        assert mesg['target'] == target

    return execfn

@pytest.fixture(scope = "class")
def sagews(request):
    r"""
    Module-scoped fixture for tests that don't leave
    extra threads running.
    """
    # setup connection to sage_server TCP listener
    host, port = get_sage_server_info()
    print("host %s  port %s"%(host, port))
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.connect((host, port))
    # jupyter kernels can take over 10 seconds to start
    sock.settimeout(45)
    print("connected to socket")

    # unlock
    client_unlock_connection(sock)
    print("socket unlocked")
    conn = ConnectionJSON(sock)
    c_ack = conn._recv(1)
    assert c_ack == 'y',"expect ack for token, got %s"%c_ack

    # open connection with sage_server and run tests
    msg = message.start_session()
    msg['type'] = 'sage'
    conn.send_json(msg)
    print("start_session sent")
    typ, mesg = conn.recv()
    assert typ == 'json'
    pid = mesg['pid']
    print("sage_server PID = %s" % pid)

    # teardown needed - terminate session nicely
    # use yield instead of request.addfinalizer in newer versions of pytest
    def fin():
        print("\nExiting Sage client.")
        conn.send_json(message.terminate_session())
        # wait several seconds for client to die
        for loop_count in range(8):
            try:
                os.kill(pid, 0)
            except OSError:
                # client is dead
                break
            time.sleep(0.5)
        else:
            print("sending sigterm to %s"%pid)
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
    request.addfinalizer(fin)
    return conn

import time

@pytest.fixture(scope = "class")
def own_sage_server(request):
    assert os.geteuid() != 0, "Do not run as root, will kill all sage_servers."
    #os.system("pkill -f sage_server_command_line")
    print("starting new sage_server")
    os.system("smc-sage-server start")
    time.sleep(0.5)
    def fin():
        print("killing all sage_server processes")
        os.system("pkill -f sage_server_command_line")
    request.addfinalizer(fin)

@pytest.fixture(scope = "class")
def test_ro_data_dir(request):
    """
    Return the directory containing the test file.
    Used for tests which have read-only data files in the test dir.
    """
    return os.path.dirname(request.module.__file__)

#
# Write machine-readable report files into the $HOME directory
# http://doc.pytest.org/en/latest/example/simple.html#post-process-test-reports-failures
#
import os
report_json = os.path.expanduser('~/sagews-test-report.json')
report_prom = os.path.expanduser('~/sagews-test-report.prom')
results = []
start_time = None

@pytest.hookimpl
def pytest_configure(config):
    global start_time
    start_time = datetime.utcnow()

@pytest.hookimpl
def pytest_unconfigure(config):
    global start_time
    data = {
        'name'     : 'smc_sagews.test',
        'version'  : 1,
        'start'    : str(start_time),
        'end'      : str(datetime.utcnow()),
        'fields'   : ['name', 'outcome', 'duration'],
        'results'  : results,
    }
    with open(report_json, 'w') as out:
        json.dump(data, out, indent=1)
    # this is a plain text prometheus report
    # https://prometheus.io/docs/instrumenting/exposition_formats/#text-format-details
    # timestamp milliseconds since epoch
    ts = int(1000 * time.mktime(start_time.timetuple()))
    # first write to temp file ...
    report_prom_tmp = report_prom + '~'
    with open(report_prom_tmp, 'w') as prom:
        for (name, outcome, duration) in results:
            labels = 'name="{name}",outcome="{outcome}"'.format(**locals())
            line = 'sagews_test{{{labels}}} {duration} {ts}'.format(**locals())
            prom.write(line + '\n')
    # ... then atomically overwrite the real one
    os.rename(report_prom_tmp, report_prom)

@pytest.hookimpl(tryfirst=True, hookwrapper=True)
def pytest_runtest_makereport(item, call):
    # execute all other hooks to obtain the report object
    outcome = yield
    rep = outcome.get_result()

    if rep.when != "call":
        return

    #import pdb; pdb.set_trace() # uncomment to inspect item and rep objects
    # the following `res` should match the `fields` above
    # parent: item.parent.name could be interesting, but just () for auto discovery
    name = item.name
    test_ = 'test_'
    if name.startswith(test_):
        name = name[len(test_):]
    res = [name, rep.outcome, rep.duration]
    results.append(res)
