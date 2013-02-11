#!/usr/bin/env python
"""
sage_server.py -- unencrypted forking TCP server that can run as root,
               create accounts on the fly, and serve sage as those
               accounts, using protobuf messages.

For debugging (as root user, do):

    killemall sage_server.py && sage --python sage_server.py -p 6000 --host 127.0.0.1

"""

# NOTE: This file must be GPL'd (if salvus is redistributed...)
# because it imports the Sage library.  This file is not directly
# imported by anything else in Salvus; the Python process it runs is
# used over a TCP connection.

#########################################################################################
#       Copyright (C) 2013 William Stein <wstein@gmail.com>                             #
#                                                                                       #
#  Distributed under the terms of the GNU General Public License (GPL), version 2+      #
#                                                                                       #
#                  http://www.gnu.org/licenses/                                         #
#########################################################################################

# This can be useful, just in case.
def log(s):
    debug_log = open("/tmp/debug.log",'a')
    debug_log.write(s+'\n')
    debug_log.flush()

# We import the notebook interact, which we will monkey patch below,
# first, since importing later causes trouble in sage>=5.6.
import sagenb.notebook.interact

# Standard imports.
import json, os, resource, shutil, signal, socket, struct, sys, \
       tempfile, time, traceback, uuid, pwd

import parsing, sage_salvus

LIMITS = {'cputime':60, 'walltime':60, 'vmem':2000, 'numfiles':1000, 'quota':128}

# Configure logging
#logging.basicConfig()
#log = logging.getLogger('sage_server')
#log.setLevel(logging.INFO)

# A tcp connection with support for sending various types of messages, especially JSON.
class ConnectionJSON(object):
    def __init__(self, conn):
        assert not isinstance(conn, ConnectionJSON)
        self._conn = conn

    def close(self):
        self._conn.close()

    def _send(self, s):
        length_header = struct.pack(">L", len(s))
        self._conn.send(length_header + s)

    def send_json(self, m):
        self._send('j' + json.dumps(m))

    def send_blob(self, uuid, blob):
        uuid = str(uuid)
        assert len(uuid) == 36
        self._send('b' + uuid + blob)

    def send_file(self, uuid, filename):
        self.send_blob(uuid, open(filename).read())  # TODO: could stream instead of reading into memory...

    def _recv(self, n):
        #print "_recv(%s)"%n
        for i in range(20): # see http://stackoverflow.com/questions/3016369/catching-blocking-sigint-during-system-call
            try:
                #print "blocking recv (i = %s), pid=%s"%(i, os.getpid())
                r = self._conn.recv(n)
                #print "got it = '%s'"%r
                return r
            except socket.error as (errno, msg):
                #print "socket.error, msg=%s"%msg
                if errno != 4:
                    raise
        raise EOFError

    def recv(self):
        n = self._recv(4)
        if len(n) < 4:
            raise EOFError
        n = struct.unpack('>L', n)[0]   # big endian 32 bits
        s = self._recv(n)
        while len(s) < n:
            t = self._recv(n - len(s))
            if len(t) == 0:
                raise EOFError
            s += t

        if s[0] == 'j':
            return 'json', json.loads(s[1:])
        elif s[0] == 'b':
            return 'blob', s[1:]
        raise ValueError("unknown message type '%s'"%s[0])

class Message(object):
    def _new(self, event, props={}):
        m = {'event':event}
        for key, val in props.iteritems():
            if key != 'self':
                m[key] = val
        return m

    def start_session(self, limits={'walltime':3600, 'cputime':3600, 'numfiles':1000, 'vmem':2048}):
        limits = dict(limits)
        return self._new('start_session', locals())

    def session_description(self, pid, limits):
        return self._new('session_description', locals())

    def send_signal(self, pid, signal=signal.SIGINT):
        return self._new('send_signal', locals())

    def terminate_session(self, done=True):
        return self._new('terminate_session', locals())

    def execute_code(self, id, code, preparse=True):
        return self._new('execute_code', locals())

    def execute_javascript(self, code, data=None, coffeescript=False):
        return self._new('execute_javascript', locals())

    def output(self, id, stdout=None, stderr=None, html=None, javascript=None, coffeescript=None, interact=None, obj=None, tex=None, file=None, done=None, once=None):
        m = self._new('output')
        m['id'] = id
        if stdout is not None: m['stdout'] = stdout
        if stderr is not None: m['stderr'] = stderr
        if html is not None: m['html'] = html
        if tex is not None: m['tex'] = tex
        if javascript is not None: m['javascript'] = javascript
        if coffeescript is not None: m['coffeescript'] = coffeescript
        if interact is not None: m['interact'] = interact
        if obj is not None: m['obj'] = json.dumps(obj)
        if file is not None: m['file'] = file    # = {'filename':..., 'uuid':...}
        if done is not None: m['done'] = done
        if once is not None: m['once'] = once
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

whoami = os.environ['USER']

def client1(port, hostname):
    conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    conn.connect((hostname, int(port)))
    conn = ConnectionJSON(conn)

    conn.send_json(message.start_session())
    typ, mesg = conn.recv()
    pid = mesg['pid']
    print "PID = %s"%pid

    id = 0
    while True:
        try:
            code = parsing.get_input('sage [%s]: '%id)
            if code is None:  # EOF
                break
            conn.send_json(message.execute_code(code=code, id=id))
            while True:
                typ, mesg = conn.recv()
                if mesg['event'] == 'terminate_session':
                    return
                elif mesg['event'] == 'output':
                    if 'stdout' in mesg:
                        sys.stdout.write(mesg['stdout']); sys.stdout.flush()
                    if 'stderr' in mesg:
                        print '!  ' + '\n!  '.join(mesg['stderr'].splitlines())
                    if 'done' in mesg and mesg['id'] >= id:
                        break
            id += 1

        except KeyboardInterrupt:
            print "Sending interrupt signal"
            conn2 = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            conn2.connect((hostname, int(port)))
            conn2 = ConnectionJSON(conn2)
            conn2.send_json(message.send_signal(pid))
            del conn2
            id += 1

    conn.send_json(message.terminate_session())
    print "\nExiting Sage client."

class BufferedOutputStream(object):
    def __init__(self, f, flush_size=4096, flush_interval=.1):
        self._f = f
        self._buf = ''
        self._flush_size = flush_size
        self._flush_interval = flush_interval
        self.reset()

    def reset(self):
        self._last_flush_time = time.time()

    def fileno(self):
        return 0

    def write(self, output):
        self._buf += output
        self.flush()
        t = time.time()
        if ((len(self._buf) >= self._flush_size) or
                  (t - self._last_flush_time >= self._flush_interval)):
            self.flush()
            self._last_flush_time = t

    def flush(self, done=False):
        if not self._buf and not done:
            # no point in sending an empty message
            return
        self._f(self._buf, done=done)
        self._buf = ''


# This will *have* to be re-done using Cython for speed.
class Namespace(dict):
    def __init__(self, x):
        self._on_change = {}
        self._on_del = {}
        dict.__init__(self, x)

    def on(self, event, x, f):
        if event == 'change':
            if x not in self._on_change:
                self._on_change[x] = []
            self._on_change[x].append(f)
        elif event == 'del':
            if x not in self._on_del:
                self._on_del[x] = []
            self._on_del[x].append(f)

    def remove(self, event, x, f):
        if event == 'change' and self._on_change.has_key(x):
            v = self._on_change[x]
            i = v.find(f)
            if i != -1:
                del v[i]
            if len(v) == 0:
                del self._on_change[x]
        elif event == 'del' and self._on_del.has_key(x):
            v = self._on_del[x]
            i = v.find(f)
            if i != -1:
                del v[i]
            if len(v) == 0:
                del self._on_del[x]

    def __setitem__(self, x, y):
        dict.__setitem__(self, x, y)
        if self._on_change.has_key(x):
            for f in self._on_change[x]:
                f(y)

    def __delitem__(self, x):
        if self._on_del.has_key(x):
            for f in self._on_del[x]:
                f()
        dict.__delitem__(self, x)

    def set(self, x, y, do_not_trigger=None):
        dict.__setitem__(self, x, y)
        if self._on_change.has_key(x):
            if do_not_trigger is None:
                do_not_trigger = []
            for f in self._on_change[x]:
                if f not in do_not_trigger:
                    f(y)


namespace = Namespace({})

class Salvus(object):
    Namespace = Namespace

    def _flush_stdio(self):
        """
        Flush the standard output streams.  This should be called before sending any message
        that produces output.
        """
        sys.stdout.flush()
        sys.stderr.flush()

    def __repr__(self):
        return ''

    def __init__(self, conn, id, data=None):
        self._conn = conn
        self._id   = id
        self.data = data
        self.namespace = namespace
        namespace['salvus'] = self   # beware of circular ref?
        # Monkey patch in our "require" command.
        namespace['require'] = self.require
        # Make the salvus object itself available when doing "from sage.all import *".
        import sage.all
        sage.all.salvus = self

    def obj(self, obj, done=False):
        self._conn.send_json(message.output(obj=obj, id=self._id, done=done))
        return self

    def file(self, filename, show=True, done=False, download=False, once=None):
        """
        Sends a file to the browser and returns a uuid that can be
        used to access the file (for 10 minutes) at

                /blobs/filename?uuid=the_uuid

        If show is true (the default), the browser will show the file
        as well, or provide a link to it.

        If you instead use the URL

               /blobs/filename?uuid=the_uuid&download

        the server will include a header that tells the browser to
        download the file to disk instead of displaying it.

        If show=False, also returns the url.  This can be useful for
        constructing custom HTML that directly accesses blobs.
        """
        file_uuid = str(uuid.uuid4())
        self._conn.send_file(file_uuid, filename)
        self._flush_stdio()
        self._conn.send_json(message.output(id=self._id, once=once, file={'filename':filename, 'uuid':file_uuid, 'show':show}))
        if not show:
            url = "/blobs/%s?uuid=%s"%(filename, file_uuid)
            if download:
                url += '?download'
            return url

    def execute(self, code, namespace=None, preparse=True):
        if namespace is None:
            namespace = self.namespace

        blocks = parsing.divide_into_blocks(code)

        for start, stop, block in blocks:
            if preparse:
                block = parsing.preparse_code(block)
            sys.stdout.reset(); sys.stderr.reset()
            try:
                exec compile(block, '', 'single') in namespace
            except:
                sys.stdout.flush()
                sys.stderr.write('Error in lines %s-%s\n'%(start+1, stop+1))
                traceback.print_exc()
                sys.stderr.flush()
                break

    def execute_with_code_decorators(self, code_decorators, code, preparse=True):
        """
        salvus.execute_with_code_decorators is used when evaluating code blocks that are set to any non-default code_decorator.
        """
        import inspect
        if isinstance(code_decorators, str):
            code_decorators = [code_decorators]

        code_decorators = [eval(code_decorator, self.namespace) for code_decorator in code_decorators]

        for i, code_decorator in enumerate(code_decorators):
            # eval is for backward compatibility
            if not hasattr(code_decorator, 'eval') and hasattr(code_decorator, 'before'):
                code_decorators[i] = code_decorator.before(code)

        for code_decorator in reversed(code_decorators):
            if hasattr(code_decorator, 'eval'):   # eval is for backward compatibility
                code = code_decorator.eval(code, globals=self.namespace, locals=self.namespace)
                print code
                code = ''
            else:
                code = code_decorator(code)
            if code is None:
                code = ''

        if code != '' and isinstance(code, str):
            self.execute(code, preparse=preparse)

        for code_decorator in code_decorators:
            if not hasattr(code_decorator, 'eval') and hasattr(code_decorator, 'after'):
                code_decorator.after(code)

    def html(self, html, done=False, once=None):
        self._flush_stdio()
        self._conn.send_json(message.output(html=str(html), id=self._id, done=done, once=once))
        return self

    def tex(self, obj, display=False, done=False, once=None):
        """
        Display obj nicely using TeX rendering.

        INPUT:

        - obj -- latex string or object that is automatically be converted to TeX
        - display -- (default: False); if True, typeset as display math (so centered, etc.)
        """
        self._flush_stdio()
        tex = obj if isinstance(obj, str) else self.namespace['latex'](obj)
        self._conn.send_json(message.output(tex={'tex':tex, 'display':display}, id=self._id, done=done, once=once))
        return self

    def start_executing(self):
        self._conn.send_json(message.output(done=False, id=self._id))

    def stdout(self, output, done=False, once=None):
        """
        Send the string output (or str(output) if output is not a
        string) to the standard output stream of the compute cell.

        INPUT:

        - output -- string or object

        """
        stdout = output if isinstance(output, str) else str(output)
        self._conn.send_json(message.output(stdout=stdout, done=done, id=self._id, once=once))
        return self

    def stderr(self, output, done=False, once=None):
        """
        Send the string output (or str(output) if output is not a
        string) to the standard error stream of the compute cell.

        INPUT:

        - output -- string or object

        """
        stderr = output if isinstance(output, str) else str(output)
        self._conn.send_json(message.output(stderr=stderr, done=done, id=self._id, once=once))
        return self

    def _execute_interact(self, id, vals):
        if id not in sage_salvus.interacts:
            raise RuntimeError, "Error: No interact with id %s"%id
        else:
            sage_salvus.interacts[id](vals)

    def interact(self, f, done=False, once=None, **kwds):
        I = sage_salvus.InteractCell(f, **kwds)
        self._flush_stdio()
        self._conn.send_json(message.output(
            interact = I.jsonable(),
            id=self._id, done=done, once=once))
        return sage_salvus.InteractFunction(I)

    def javascript(self, code, once=True, coffeescript=False, done=False, obj=None):
        """
        Execute the given Javascript code as part of the output
        stream.  This same code will be executed (at exactly this
        point in the output stream) every time the worksheet is
        rendered.

        INPUT:

        - code -- a string
        - once -- boolean (default: True); if True the Javascript is
          only executed once, not every time the cell is loaded. This
          is what you would use if you call salvus.stdout, etc.  Use
          once=False, e.g., if you are using javascript to make a DOM
          element draggable (say).
        - coffeescript -- boolean (default: False); if True, the input
          code is first converted from CoffeeScript to Javascript.

        At least the following Javascript objects are defined in the
        scope in which the code is evaluated::

        - cell -- jQuery wrapper around the current compute cell
        - salvus.stdout, salvus.stderr, salvus.html, salvus.tex -- all
          allow you to write additional output to the cell
        - worksheet - jQuery wrapper around the current worksheet DOM object
        - obj -- the optional obj argument, which is passed via JSON serialization
        """
        if obj is None:
            obj = {}
        self._conn.send_json(message.output(javascript={'code':code, 'coffeescript':coffeescript}, id=self._id, done=done, obj=obj, once=once))
        return self

    def coffeescript(self, *args, **kwds):
        """
        This is the same as salvus.javascript, but with coffeescript=True.
        """
        kwds['coffeescript'] = True
        return self.javascript(*args, **kwds)

    def notify(self, once=None, **kwds):
        """
        Display a graphical notification using the pnotify Javascript library.

        INPUTS:

        - `title: false` - The notice's title.
        - `title_escape: false` - Whether to escape the content of the title. (Not allow HTML.)
        - `text: false` - The notice's text.
        - `text_escape: false` - Whether to escape the content of the text. (Not allow HTML.)
        - `styling: "bootstrap"` - What styling classes to use. (Can be either jqueryui or bootstrap.)
        - `addclass: ""` - Additional classes to be added to the notice. (For custom styling.)
        - `cornerclass: ""` - Class to be added to the notice for corner styling.
        - `nonblock: false` - Create a non-blocking notice. It lets the user click elements underneath it.
        - `nonblock_opacity: .2` - The opacity of the notice (if it's non-blocking) when the mouse is over it.
        - `history: true` - Display a pull down menu to redisplay previous notices, and place the notice in the history.
        - `auto_display: true` - Display the notice when it is created. Turn this off to add notifications to the history without displaying them.
        - `width: "300px"` - Width of the notice.
        - `min_height: "16px"` - Minimum height of the notice. It will expand to fit content.
        - `type: "notice"` - Type of the notice. "notice", "info", "success", or "error".
        - `icon: true` - Set icon to true to use the default icon for the selected style/type, false for no icon, or a string for your own icon class.
        - `animation: "fade"` - The animation to use when displaying and hiding the notice. "none", "show", "fade", and "slide" are built in to jQuery. Others require jQuery UI. Use an object with effect_in and effect_out to use different effects.
        - `animate_speed: "slow"` - Speed at which the notice animates in and out. "slow", "def" or "normal", "fast" or number of milliseconds.
        - `opacity: 1` - Opacity of the notice.
        - `shadow: true` - Display a drop shadow.
        - `closer: true` - Provide a button for the user to manually close the notice.
        - `closer_hover: true` - Only show the closer button on hover.
        - `sticker: true` - Provide a button for the user to manually stick the notice.
        - `sticker_hover: true` - Only show the sticker button on hover.
        - `hide: true` - After a delay, remove the notice.
        - `delay: 8000` - Delay in milliseconds before the notice is removed.
        - `mouse_reset: true` - Reset the hide timer if the mouse moves over the notice.
        - `remove: true` - Remove the notice's elements from the DOM after it is removed.
        - `insert_brs: true` - Change new lines to br tags.
        """
        obj = {}
        for k, v in kwds.iteritems():
            obj[k] = sage_salvus.jsonable(v)
        self.javascript("$.pnotify(obj)", once=once, obj=obj)

    def execute_javascript(self, code, coffeescript=False, data=None):
        """
        Tell the browser to execute javascript.  Basically the same as
        salvus.javascript with once=True (the default), except this
        isn't tied to a particular cell.
        """
        self._conn.send_json(message.execute_javascript(code, coffeescript=coffeescript, data=data))
        return self

    def execute_coffeescript(self, *args, **kwds):
        """
        This is the same as salvus.execute_javascript, but with coffeescript=True.
        """
        kwds['coffeescript'] = True
        return self.execute_javascript(*args, **kwds)

    def _cython(self, filename, **opts):
        """
        Return module obtained by compiling the Cython code in the
        given file.

        INPUT:

           - filename -- name of a Cython file
           - all other options are passed to sage.misc.cython.cython unchanged,
             except for use_cache which defaults to True (instead of False)

        OUTPUT:

           - a module
        """
        if 'use_cache' not in opts:
            opts['use_cache'] = True
        import sage.misc.cython
        modname, path = sage.misc.cython.cython(filename, **opts)
        import sys
        try:
            sys.path.insert(0,path)
            module = __import__(modname)
        finally:
            del sys.path[0]
        return module

    def _import_file(self, filename, content, **opts):
        base,ext = os.path.splitext(filename)
        py_file_base = str(uuid.uuid4()).replace('-','_')
        try:
            open(py_file_base+'.py', 'w').write(content)
            import sys
            try:
                sys.path.insert(0, os.path.abspath('.'))
                mod = __import__(py_file_base)
            finally:
                del sys.path[0]
        finally:
            os.unlink(py_file_base+'.py')
        return mod

    def _sage(self, filename, **opts):
        import sage.misc.preparser
        content = "from sage.all import *\n" + sage.misc.preparser.preparse_file(open(filename).read())
        return self._import_file(filename, content, **opts)

    def _spy(self, filename, **opts):
        import sage.misc.preparser
        content = "from sage.all import Integer, RealNumber, PolynomialRing\n" + sage.misc.preparser.preparse_file(open(filename).read())
        return self._import_file(filename, content, **opts)

    def _py(self, filename, **opts):
        return __import__(filename)

    def require(self, filename, **opts):
        if not os.path.exists(filename):
            raise ValueError("file '%s' must exist"%filename)
        base,ext = os.path.splitext(filename)
        if ext == '.pyx' or ext == '.spyx':
            return self._cython(filename, **opts)
        if ext == ".sage":
            return self._sage(filename, **opts)
        if ext == ".spy":
            return self._spy(filename, **opts)
        if ext == ".py":
            return self._py(filename, **opts)
        raise NotImplementedError("require file of type %s not implemented"%ext)

def execute(conn, id, code, data, preparse):
    # initialize the salvus output streams
    salvus = Salvus(conn=conn, id=id, data=data)
    salvus.start_executing()

    try:
        streams = (sys.stdout, sys.stderr)
        sys.stdout = BufferedOutputStream(salvus.stdout)
        sys.stderr = BufferedOutputStream(salvus.stderr)
        try:
            # initialize more salvus functionality
            sage_salvus.salvus = salvus
            namespace['sage_salvus'] = sage_salvus
        except:
            traceback.print_exc()

        salvus.execute(code, namespace=namespace, preparse=preparse)
        
    finally:
        # there must be exactly one done message
        if sys.stderr._buf:
            if sys.stdout._buf:
                sys.stdout.flush()
            sys.stderr.flush(done=True)
        else:
            sys.stdout.flush(done=True)
        (sys.stdout, sys.stderr) = streams


def drop_privileges(id, home, transient, username):
    gid = id
    uid = id
    if transient:
        os.chown(home, uid, gid)
    os.setgid(gid)
    os.setuid(uid)
    os.environ['DOT_SAGE'] = home
    mpl = os.environ['MPLCONFIGDIR']
    os.environ['MPLCONFIGDIR'] = home + mpl[5:]
    os.environ['HOME'] = home
    os.environ['IPYTHON_DIR'] = home
    os.environ['USERNAME'] = username
    os.environ['USER'] = username
    os.chdir(home)

    # Monkey patch the Sage library and anything else that does not
    # deal well with changing user.  This sucks, but it is work that
    # simply must be done because we're not importing the library from
    # scratch (which would take a long time).
    import sage.misc.misc
    sage.misc.misc.DOT_SAGE = home + '/.sage/'

def session(conn, home, username, cputime, numfiles, vmem, uid, transient):
    """
    This is run by the child process that is forked off on each new
    connection.  It drops privileges, then handles the complete
    compute session.

    INPUT:

    - ``conn`` -- the TCP connection
    - ``home`` -- the home directory of the user
    - ``username`` -- the username to drop privileges to
    - ``cputime`` -- maximum cputime that the process is allowed to
      run (implemented using setrlimit), or 0 for no limit.
    - ``numfiles`` -- maximum number of files that this process is
      allowed to create (implemented using setrlimit), or 0 for no limit.
    - ``vmem`` -- maximum virtual memory that process has access to
      (implemented using setrlimit); or 0 for no limit.
    """
    pid = os.getpid()
    if home is not None:
        drop_privileges(uid, home, transient, username)
        pass

    if cputime:
        resource.setrlimit(resource.RLIMIT_CPU, (cputime,cputime))
    if numfiles:
        resource.setrlimit(resource.RLIMIT_NOFILE, (numfiles,numfiles))
    if vmem:
        if os.uname()[0] == 'Linux':
            resource.setrlimit(resource.RLIMIT_AS, (vmem*1048576L, -1L))
    else:
        # This is hardly necessary, since we only support Linux!
        #log.warning("Server not running on Linux, so there are NO memory constraints.")
        pass

    def handle_parent_sigquit(signum, frame):
        conn.send_json(message.terminate_session())
        print "** Sage process killed by external SIGQUIT signal (time limit probably exceeded) **\n\n"
        sys.exit(0)

    signal.signal(signal.SIGQUIT, handle_parent_sigquit)

    # seed the random number generator(s)
    import sage.all; sage.all.set_random_seed()
    import time; import random; random.seed(time.time())

    while True:
        try:
            typ, mesg = conn.recv()
            #print 'INFO:child%s: received message "%s"'%(pid, mesg)
            event = mesg['event']
            if event == 'terminate_session':
                return
            elif event == 'execute_code':
                try:
                    execute(conn=conn, id=mesg['id'], code=mesg['code'], data=mesg.get('data',None), preparse=mesg['preparse'])
                except:
                    pass
            elif event == 'introspect':
                try:
                    introspect(conn=conn, id=mesg['id'], line=mesg['line'], preparse=mesg['preparse'])
                except:
                    pass
            else:
                raise RuntimeError("invalid message '%s'"%mesg)
        except KeyboardInterrupt:
            # SIGINT can come at any time.
            pass


def introspect(conn, id, line, preparse):
    salvus = Salvus(conn=conn, id=id) # so salvus.[tab] works -- note that Salvus(...) modifies namespace.
    z = parsing.introspect(line, namespace=namespace, preparse=preparse)
    if z['get_completions']:
        mesg = message.introspect_completions(id=id, completions=z['result'], target=z['target'])
    elif z['get_help']:
        mesg = message.introspect_docstring(id=id, docstring=z['result'], target=z['expr'])
    elif z['get_source']:
        mesg = message.introspect_source_code(id=id, source_code=z['result'], target=z['expr'])
    conn.send_json(mesg)

def rmtree(path):
    if not path.startswith('/tmp/') or path.startswith('/var/') or path.startswith('/private/'):
        #log.error("Trying to rmtree on '%s' is very suspicious! Refusing!", path)
        pass
    else:
        #log.info("Removing '%s'", path)
        shutil.rmtree(path)

class Connection(object):
    def __init__(self, pid, uid, home=None, maxtime=3600, transient=False):
        # maxtime = 0 -- don't timeout ever
        self._pid = pid
        self._uid = uid
        self._home = home
        self._start_time = time.time()
        if maxtime is None:
            maxtime = 0
        self._maxtime = maxtime
        self._transient = transient

    def __repr__(self):
        return 'pid=%s, home=%s, start_time=%s, maxtime=%s'%(
            self._pid, self._home, self._start_time, self._maxtime)

    def time_remaining(self):
        if self._maxtime == 0:
            return 2**31  # effectively infinite
        else:
            return self._maxtime - (time.time() - self._start_time)

    def signal(self, sig):
        os.kill(self._pid, sig)

    def remove_files(self):
        if not self._transient:
            return
        # remove any other files created in /tmp by this user, if server is running as root.
        if whoami == 'root':
            if self._home is not None:
                rmtree(self._home)
            for dirpath, dirnames, filenames in os.walk('/tmp', topdown=False):
                for name in dirnames + filenames:
                    path = os.path.join(dirpath, name)
                    if os.stat(path).st_uid == self._uid:
                        try:
                            if os.path.isdir(path):
                                shutil.rmtree(path)
                            else:
                                os.unlink(path)
                        except Exception, msg:
                            print "Error removing a file -- ", msg
                            pass

    def monitor(self, interval=1):
        if self._maxtime == 0:
            return
        try:
            while True:
                tm = self.time_remaining()
                if tm < 0:
                    try:
                        if tm <= -2*interval:
                            self.signal(signal.SIGKILL)
                        else:
                            self.signal(signal.SIGQUIT)
                    except OSError:
                        return # subprocess is dead
                else:
                    try:
                        self.signal(0)
                    except OSError: # subprocess is dead
                        return
                time.sleep(interval)
        finally:
            self.remove_files()

def handle_session_term(signum, frame):
    while True:
        try:
            pid, exit_status = os.waitpid(-1, os.WNOHANG)
        except:
            return
        if not pid: return

def serve_connection(conn):
    conn = ConnectionJSON(conn)
    typ, mesg = conn.recv()
    if mesg['event'] == 'send_signal':
        if mesg['pid'] == 0:
            print "invalid signal mesg (pid=0)"
            # TODO: send error message back (?)
            #log.info("invalid signal mesg (pid=0?): %s", mesg)
        else:
            #log.info("sending signal %s to process %s", mesg['signal'], mesg['pid'])
            os.kill(mesg['pid'], mesg['signal'])
        return
    if mesg['event'] != 'start_session':
        return

    # start a session
    if 'project_id' in mesg:
        # Start session with user determined by the given project.
        transient = False
        username = mesg['project_id'][:8]
        home = "/home/" + username
        uid = pwd.getpwnam(username).pw_uid
    else:
        # TODO -- redo so there is a username, etc., or get rid of and
        # have a special transient project.
        transient = True
        home = tempfile.mkdtemp() if whoami == 'root' else None
        uid = (os.getpid() % 5000) + 5000   # TODO: just for testing; hub/db will have to assign and track this!
        username = str(uid) # kind of silly since there is no username in this case

    pid = os.fork()
    limits = mesg.get('limits', {})
    if pid:
        # parent
        quota = limits.get('quota', LIMITS['quota'])
        if whoami == 'root':
            # TODO TODO on linux, set disk quota for given user
            pass
        C = Connection(pid=pid, uid=uid, home=home,
                       maxtime=limits.get('walltime', LIMITS['walltime']), transient=transient)
        C.monitor()
    else:
        # child
        conn.send_json(message.session_description(os.getpid(), limits))
        session(conn=conn, home=home, username=username, uid=uid,
                cputime=limits.get('cputime', LIMITS['cputime']),
                numfiles=limits.get('numfiles', LIMITS['numfiles']),
                vmem=limits.get('vmem', LIMITS['vmem']),
                transient=transient)

def serve(port, host):
    #log.info('opening connection on port %s', port)
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind((host, port))
    print 'Sage server %s:%s'%(host, port)

    signal.signal(signal.SIGCHLD, handle_session_term)

    tm = time.time()
    print "pre-importing the sage library..."

    # Monkey patching interact using the new and improved Salvus
    # implementation of interact.
    import sagenb.notebook.interact
    sagenb.notebook.interact.interact = sage_salvus.interact
    for k,v in sage_salvus.interact_functions.iteritems():
        namespace[k] = sagenb.notebook.interact.__dict__[k] = v

    namespace['_salvus_parsing'] = parsing

    # Actually import sage now.  This must happen after the interact
    # import because of library interacts.
    import sage.all

    # Monkey patch the html command.
    sage.all.html = sage.misc.html.html = sage.interacts.library.html = sage_salvus.html

    # Monkey patch latex.eval, so that %latex works in worksheets
    sage.misc.latex.latex.eval = sage_salvus.latex0

    # Doing an integral start embedded ECL; unfortunately, it can
    # easily get put in a broken state after fork that impacts future forks... ?
    #exec "from sage.all import *; import scipy; import sympy; import pylab; from sage.calculus.predefined import x; integrate(sin(x**2),x);" in namespace
    exec "from sage.all import *; from sage.calculus.predefined import x; import scipy" in namespace
    print 'imported sage library in %s seconds'%(time.time() - tm)

    for name in ['coffeescript', 'javascript', 'time', 'file', 'timeit', 'capture', 'cython', 'script']:
        namespace[name] = getattr(sage_salvus, name)

    t = time.time()
    s.listen(128)
    i = 0
    try:
        while True:
            i += 1
            #print i, time.time()-t, 'cps: ', int(i/(time.time()-t))
            # do not use log.info(...) in the server loop; threads = race conditions that hang server every so often!!
            try:
                conn, addr = s.accept()
                print "connection from", addr
            except socket.error, msg:
                continue
            if not os.fork(): # child
                try:
                    serve_connection(conn)
                finally:
                    conn.close()
                    os._exit(0)
        # end while
    except Exception, err:
        traceback.print_exc(file=sys.stdout)
        #log.error("error: %s %s", type(err), str(err))

    finally:
        #log.info("closing socket")
        #s.shutdown(0)
        s.close()

def serve2(port, host):
    # this approach SUCKS: zombies, zombies; the socket can't be reused.
    import sage.all
    exec "from sage.all import *; from sage.calculus.predefined import x; integrate(sin(x**2),x); import scipy" in namespace

    import socket
    import SocketServer
    class Handler(SocketServer.StreamRequestHandler):
        def handle(self):
            serve_connection(self.request)
            self.request.close()
            os._exit(0)

    class ForkingTCPServer(SocketServer.ForkingMixIn, SocketServer.TCPServer):
        pass
    S = ForkingTCPServer((host, port), Handler)
    S.serve_forever()


def run_server(port, host, pidfile, logfile):
    if pidfile:
        open(pidfile,'w').write(str(os.getpid()))
    if logfile:
        #log.addHandler(logging.FileHandler(logfile))
        pass
    #log.info("port=%s, host=%s, pidfile='%s', logfile='%s'", port, host, pidfile, logfile)
    try:
        serve(port, host)
    finally:
        if pidfile:
            os.unlink(pidfile)

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Run Sage server")
    parser.add_argument("-p", dest="port", type=int, default=6000,
                        help="port to listen on (default: 6000); give 0 to autogenerate")
    parser.add_argument("-l", dest='log_level', type=str, default='INFO',
                        help="log level (default: INFO) useful options include WARNING and DEBUG")
    parser.add_argument("-d", dest="daemon", default=False, action="store_const", const=True,
                        help="daemon mode (default: False)")
    parser.add_argument("--host", dest="host", type=str, default='',
                        help="host interface to bind to")
    parser.add_argument("--pidfile", dest="pidfile", type=str, default='',
                        help="store pid in this file")
    parser.add_argument("--logfile", dest="logfile", type=str, default='',
                        help="store log in this file (default: '' = don't log to a file)")
    parser.add_argument("-c", dest="client", default=False, action="store_const", const=True,
                        help="run in test client mode number 1 (command line)")
    parser.add_argument("--hostname", dest="hostname", type=str, default='',
                        help="hostname to connect to in client mode")
    parser.add_argument("--portfile", dest="portfile", type=str, default='',
                        help="write port to this file")

    args = parser.parse_args()

    if args.daemon and not args.pidfile:
        print "%s: must specify pidfile in daemon mode"%sys.argv[0]
        sys.exit(1)

    if args.log_level:
        pass
        #level = getattr(logging, args.log_level.upper())
        #log.setLevel(level)

    if args.client:
        client1(port=args.port if args.port else int(open(args.portfile).read()), hostname=args.hostname)
        sys.exit(0)

    if not args.port:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.bind(('',0)) # pick a free port
        args.port = s.getsockname()[1]
        del s

    if args.portfile:
        open(args.portfile,'w').write(str(args.port))

    pidfile = os.path.abspath(args.pidfile) if args.pidfile else ''
    logfile = os.path.abspath(args.logfile) if args.logfile else ''

    main = lambda: run_server(port=args.port, host=args.host, pidfile=pidfile, logfile=logfile)
    if args.daemon:
        import daemon
        with daemon.DaemonContext():
            main()
    else:
        main()
