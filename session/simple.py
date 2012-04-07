"""
Simple Session Server
"""
# Standard Python modules
import os, posixpath, shutil, StringIO, sys, tempfile, time

# A simple session server
class SimpleSessionServer(object):
    """
    EXAMPLES::

        >>> SimpleSessionServer()
        Simple Session Server
    """
    def __repr__(self):
        """
        EXAMPLES::

            >>> SimpleSessionServer().__repr__()
            'Simple Session Server'
        """
        return "Simple Session Server"

    def __init__(self):
        """
        EXAMPLES::

            >>> S = SimpleSessionServer()
            >>> S._next_id
            0
            >>> S._session
            {}
        """
        self._next_id = 0
        self._session = {}

    def session(self, id):
        """
        EXAMPLES::

            >>> S = SimpleSessionServer()
            >>> id = S.new_session(); id
            0
            >>> S.session(id)
            SimpleSession with id 0
            >>> S.session(1)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 1
        """
        if id in self._session:
            return self._session[id]
        else:
            raise ValueError, "unknown session %s"%id

    def new_session(self, output_callback=None):
        """
        INPUT:
        - ``output_callback`` -- None (system fallback) or callable that takes as input a single argument

        EXAMPLES::

            >>> S = SimpleSessionServer()
            >>> S.new_session()
            0
            >>> S.new_session(lambda output: None)
            1
        """
        if output_callback is None:
            def output_callback(msg):
                print msg
        elif output_callback == 'doctest':
            def output_callback(msg):
                print sorted(list(msg.iteritems()))
        S = SimpleSession(self._next_id, output_callback)
        self._next_id += 1
        self._session[S.id] = S
        return S.id

    def execute(self, id, code):
        r"""
        INPUT:
        - ``id`` -- session id
        - ``code`` -- string; code to execute

        OUTPUT:
        - ``exec_id`` -- id associated to evaluation of this code

        EXAMPLES::

            >>> S = SimpleSessionServer()
            >>> id = S.new_session('doctest')
            >>> S.execute(id, "print(2+3)")
            [('done', True), ('exec_id', 0), ('modified_files', []), ('output', '5\n')]
            0
        """
        return self.session(id).execute(code)

    def interrupt(self, id):
        """
        EXAMPLES::

            >>> S = SimpleSessionServer()
            >>> id = S.new_session('doctest')
            >>> S.interrupt(id)
        """
        self.session(id).interrupt()

    def status(self, id):
        """
        EXAMPLES::

            >>> S = SimpleSessionServer(); id = S.new_session('doctest')
            >>> S.status(id)
            'ok'
            >>> S = SimpleSessionServer(); id = S.new_session('doctest')
            >>> S.status(-1)
            Traceback (most recent call last):
            ...
            ValueError: unknown session -1
        """
        return self.session(id).status()

    def put(self, id, path, content):
        """
        EXAMPLES::

            >>> S = SimpleSessionServer(); id = S.new_session('doctest')
            >>> S.put(id, 'path/to/file.txt', 'contents')
            >>> S.files(id)
            ['path/to/file.txt']
            >>> S.get(id, 'path/to/file.txt')
            'contents'
        """
        self.session(id).put(path, content)

    def get(self, id, path):
        """
        EXAMPLES::

            >>> S = SimpleSessionServer(); id = S.new_session('doctest')
            >>> S.put(id, 'a_file', 'contents of file')
            >>> S.get(id, 'a_file')
            'contents of file'

        Various error conditions::

            >>> S.get(-1, 'foo')
            Traceback (most recent call last):
            ...
            ValueError: unknown session -1
            >>> S.get(id, 'no_such_file')
            Traceback (most recent call last):
            ...
            ValueError: no file 'no_such_file'
        """
        return self.session(id).get(path)

    def delete(self, id, path):
        """
        Delete a file from the session.

        EXAMPLES::

            >>> S = SimpleSessionServer(); id = S.new_session('doctest')
            >>> S.put(id, 'a/b/c/file.txt', 'contents of file')
            >>> S.files(id)
            ['a/b/c/file.txt']
            >>> S.delete(id, 'a/b/c/file.txt')
            >>> S.files(id)
            []
            >>> S.get(id, 'a/b/c/file.txt')
            Traceback (most recent call last):
            ...
            ValueError: no file 'a/b/c/file.txt'
        """
        self.session(id).delete(path)

    def files(self, id):
        """
        EXAMPLES::

            >>> S = SimpleSessionServer(); id = S.new_session('doctest')
            >>> S.files(id)
            []
            >>> S.put(id, 'a/b/c/file.txt', 'contents of file')
            >>> S.files(id)
            ['a/b/c/file.txt']
            >>> S.delete(id, 'a/b/c/file.txt')
            >>> S.files(id)
            []
        """
        return self.session(id).files()


class SimpleSession(object):
    def __init__(self, id, output_callback):
        """
        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest')
            >>> s
            SimpleSession with id 0
        """
        if output_callback == 'doctest':
            def output_callback(msg):
                print sorted(list(msg.iteritems()))
        self._id = id
        self._exec_id = 0
        self._namespace = {}
        self._output_callback = output_callback
        self._execpath = tempfile.mkdtemp()
        self._curpath = self._execpath
        self._pathtree = PathTree(self._execpath)

    def interrupt(self):
        """
        Wait until no computations are running.

        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest'); p = s._execpath
            >>> s.interrupt()
        """
        # impossible to call if computation running, so trivial to implement
        pass

    def wait(self):
        """
        Wait until no computations are running.

        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest'); p = s._execpath
            >>> s.wait()
        """
        # impossible to call if computation running, so trivial to implement
        pass

    def __del__(self):
        """
        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest'); p = s._execpath
            >>> os.path.exists(p)
            True
            >>> del s
            >>> os.path.exists(p)
            False
        """
        shutil.rmtree(self._execpath)

    def __repr__(self):
        """
        EXAMPLES::

            >>> SimpleSession(0, 'doctest').__repr__()
            'SimpleSession with id 0'
        """
        return "SimpleSession with id %s"%self._id

    @property
    def id(self):
        """
        EXAMPLES::

            >>> s = SimpleSession(7, 'doctest')
            >>> s.id
            7

        The id is an immutable property::

            >>> s.id = 5
            Traceback (most recent call last):
            ...
            AttributeError: can't set attribute
        """
        return self._id

    def execute(self, code):
        r"""
        EXAMPLES::

            >>> s = SimpleSession(1, 'doctest'); s.execute('print(2+3)'); s.wait()
            [('done', True), ('exec_id', 0), ('modified_files', []), ('output', '5\n')]
            0
            >>> s.execute('a=5\nb=7\nprint(a+b)\nprint(a*b)'); s.wait()
            [('done', True), ('exec_id', 1), ('modified_files', []), ('output', '12\n35\n')]
            1
            >>> s.execute('import os; os.chdir("/")')
            [('done', True), ('exec_id', 2), ('modified_files', []), ('output', '')]
            2
            >>> s._curpath
            '/'

        Make sure the changed directory persists in the next call, but doesn't mess us up::

            >>> s.execute('print(os.path.abspath("/"))')
            [('done', True), ('exec_id', 3), ('modified_files', []), ('output', '/\n')]
            3
            >>> os.path.abspath('.') != '/'
            True
        """
        exec_id = self._exec_id
        self._exec_id += 1

        # evaluate the input code in the current path
        output, self._curpath = blocking_execute(self._curpath, code, self._namespace)
        modified_files = self._pathtree.modified_files()

        self._output_callback({'exec_id':exec_id, 'done':True,
                               'output':output, 'modified_files':modified_files})
        return exec_id

    def _full_path(self, path):
        """
        Given a path into the files for this session, returns the
        absolute path on the host system mapping to that path. Ensures
        that the path is below self._execpath.

        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest')
            >>> s._full_path('foo/bar.txt')
            '/.../foo/bar.txt'

        Paths out are not allowed:

            >>> s._full_path('/etc/passwd')
            Traceback (most recent call last):
            ...
            RuntimeError: insecure path '/etc/passwd'
            >>> s._full_path('../a.txt')
            Traceback (most recent call last):
            ...
            RuntimeError: insecure path '../a.txt'
        """
        path = posixpath.normpath(path)
        if '..' in path or os.path.isabs(path):
            raise RuntimeError, "insecure path '%s'"%path
        return os.path.join(self._execpath, path)

    def put(self, path, content):
        """
        Transfer a file to the execution directory for this
        session. The path may contain slashes, in which case the
        containing directory is automatically created.

        INPUT:
        - path -- relative pathname of the file, including slashes
        - content -- string contents of the file

        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest')
            >>> s.put('path/to/file.txt', 'this is a file')
            >>> s.files()
            ['path/to/file.txt']
            >>> s.get('path/to/file.txt')
            'this is a file'
        """
        path = self._full_path(path)
        base, fname = os.path.split(path)
        if not os.path.exists(base):
            os.makedirs(base)
        open(path, 'w').write(content)
        # update the modified_files cache
        self._pathtree.modified_files()

    def get(self, path):
        """
        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest')
            >>> s.put('file', 'this is a small file')
            >>> s.get('file')
            'this is a small file'
        """
        fullpath = self._full_path(path)
        if not os.path.exists(fullpath):
            raise ValueError, "no file '%s'"%path
        return open(fullpath,'rb').read()

    def delete(self, path):
        """
        Delete the file at the given path, if it is exists.
        Otherwise, a ValueError is raised.

        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest')
            >>> s.put('path/to/file.txt', 'this is a file')
            >>> s.delete('path/to/file.txt')
            >>> s.files()
            []
            >>> s.delete('bad_file.txt')
            Traceback (most recent call last):
            ...
            ValueError: no file 'bad_file.txt'
        """
        fullpath = self._full_path(path)
        if not os.path.exists(fullpath):
            raise ValueError, "no file '%s'"%path
        os.unlink(fullpath)
        # update the modified_files cache
        self._pathtree.modified_files()

    def status(self):
        """
        String describing state of the session.

        EXAMPLES::

            >>> SimpleSession(0, 'doctest').status()
            'ok'
        """
        return 'ok'

    def files(self):
        """
        Return list of all files in this session.

        EXAMPLES::

            >>> s = SimpleSession(0, 'doctest')

        Empty session by default::

            >>> s.files()
            []

        We upload a file using put, and find that it is now in the list::

            >>> s.put('path/to/file.txt', 'this is a file')
            >>> s.files()
            ['path/to/file.txt']

        We then delete the new file, and it is gone from the list::

            >>> s.delete('path/to/file.txt')
            >>> s.files()
            []

        We use some Python code to create a file, and it is detected and listed::

            >>> s.execute('open("foo","w")')
            [('done', True), ('exec_id', 0), ('modified_files', ['foo']), ('output', '')]
            0
            >>> s.files()
            ['foo']

        We remove the file via Python, and its abscence is properly detected::

            >>> s.execute('import os; os.unlink("foo")')
            [('done', True), ('exec_id', 1), ('modified_files', []), ('output', '')]
            1
            >>> s.files()
            []

        We make a directory -- since no normal file is created, the
        files list is unchanged::

            >>> s.execute("os.makedirs('foo/bar')")
            [('done', True), ('exec_id', 2), ('modified_files', []), ('output', '')]
            2
            >>> s.files()
            []

        However, once we put a file in that directory, it is
        detected::

            >>> s.execute('open("foo/bar/filename.txt","w")')
            [('done', True), ('exec_id', 3), ('modified_files', ['foo/bar/filename.txt']), ('output', '')]
            3
            >>> s.files()
            ['foo/bar/filename.txt']
        """
        return self._pathtree.files()

class SimpleStreamingSession(SimpleSession):
    def execute(self, code):
        r"""
        EXAMPLES::

            >>> v = []
            >>> def callback(x): v.append(x)
            ...
            >>> s = SimpleStreamingSession(0, callback)
            >>> s.execute('import sys,time\nfor n in range(3):\n   print str(n)*10; time.sleep(0.2);')
            0
            >>> len(v)
            4
            >>> ''.join([x['output'] for x in v if 'output' in x])
            '0000000000\n1111111111\n2222222222\n'
        """
        exec_id = self._exec_id
        self._exec_id += 1

        class OutStream(object):
            def __init__(self, session, flush_interval):
                self._buf = ''
                self._session = session
                self._last_flush = time.time()
                self._flush_interval = flush_interval

            def write(self, output):
                self._buf += output
                w = time.time()
                if w - self._last_flush >= self._flush_interval:
                    self._last_flush = w
                    self.flush()

            def flush(self):
                modified_files = self._session._pathtree.modified_files()                
                msg = {'exec_id':exec_id, 'done':False,
                       'output':self._buf, 'modified_files':modified_files}
                self._buf = ''
                self._session._output_callback(msg)
                
            def __del__(self):
                self._session._output_callback({'exec_id':exec_id, 'done':True})

        self._curpath = streaming_execute(self._curpath, code, self._namespace,
                                          OutStream(self, 0.05))
        return exec_id
    
        

def blocking_execute(path, code, namespace):
    r"""
    Change current directory to path, then execute code in the
    namespace.  Return the output of executing the code and the new
    path.

    INPUT:
    - ``path`` -- path in which to run code
    - ``code`` -- code to run
    - ``namespace`` -- namespace in which to exec the code

    OUTPUT:

    - the output (with stdout and stderr mixed) of exec'ing
      the code, and of course the namespace may be modified.
    - the path after executing the code

    EXAMPLES::

        >>> g = {}; output, path = blocking_execute('.', 'a=2\nb=3\nprint(a*b)', g)
        >>> output
        '6\n'
        >>> path == os.path.abspath(os.curdir)
        True
        >>> g.keys()
        ['__builtins__', 'a', 'b']
        >>> g['a'], g['b']
        (2, 3)
    """
    outstream = StringIO.StringIO()
    newpath = streaming_execute(path, code, namespace, outstream)
    return outstream.getvalue(), newpath

def streaming_execute(path, code, namespace, outstream):
    r"""
    Change current directory to path, then execute code in the
    namespace.  Return the output of executing the code and the new
    path.

    INPUT:
    - ``path`` -- path in which to run code
    - ``code`` -- code to run
    - ``namespace`` -- namespace in which to exec the code
    - ``outstream`` -- where to write output as it appears

    OUTPUT:

    - the path after executing the code

    EXAMPLES::

        >>> outstream = StringIO.StringIO()
        >>> g = {}; path = streaming_execute('.', 'a=2\nb=3\nprint(a*b)', g, outstream)
        >>> outstream.getvalue()
        '6\n'
        >>> path = streaming_execute('.', 'print("hello")', g, outstream)
        >>> outstream.getvalue()
        '6\nhello\n'
    """
    stdout = sys.stdout
    stderr = sys.stderr
    sys.stdout = outstream
    sys.stderr = outstream
    curdir = os.path.abspath(os.curdir)
    try:
        os.chdir(path)
        exec code in namespace
    except:
        outstream.write(repr(sys.exc_info()[1]))
    finally:
        newpath = os.path.abspath(os.curdir)
        os.chdir(curdir)
        sys.stdout = stdout
        sys.stderr = stderr
        outstream.flush()

    return newpath



class PathTree(object):
    """
    Watches the tree of files in a path.
    """
    def __init__(self, path):
        """
        EXAMPLES::

            >>> p = PathTree(tempfile.mkdtemp())
            >>> PathTree(tempfile.mkdtemp())
            PathTree('...')
        """
        self._path = os.path.abspath(path)
        self._filenames = {}
        self._n = len(self._path) + 1
        for root, dirs, files in os.walk(self._path):
            for fname in files:
                fullname = os.path.join(root, fname)
                self._filenames[fullname] = os.stat(fullname).st_mtime

    def __repr__(self):
        """
        EXAMPLES::

            >>> PathTree(tempfile.mkdtemp()).__repr__()
            "PathTree('...')"
        """
        return "PathTree('%s')"%self._path

    def _strip_base(self, v):
        """
        Internal function that is used to remove the beginning
        absolute path from each string in v.

        EXAMPLES::

            >>> p = PathTree(tempfile.mkdtemp())
            >>> PathTree('/foo')._strip_base(['/foo/bar/a.txt'])
            ['bar/a.txt']
        """
        return [x[self._n:] for x in v]

    def files(self, relative=True):
        """
        Return the names of the files in this tree.  If relative is
        False (not the default), return absolute path to each file.

        EXAMPLES::

            >>> PathTree(tempfile.mkdtemp()).files()
            []
        """
        if relative:
            return self._strip_base(self._filenames.keys())
        else:
            return self._filenames.keys()

    def modified_files(self, relative=True):
        """
        Return files that were modified since the last call to this
        function.  If relative is False (not the default), return
        absolute path to each file.

        EXAMPLES::

            >>> PathTree(tempfile.mkdtemp()).modified_files()
            []
        """
        modified_files = []
        all_files = []
        for root, dirs, files in os.walk(self._path):
            for fname in files:
                fullname = os.path.join(root, fname)
                all_files.append(fullname)
                mtime = os.stat(fullname).st_mtime
                if fullname not in self._filenames:
                    self._filenames[fullname] = mtime
                    modified_files.append(fullname)
                elif self._filenames[fullname] != mtime:
                    modified_files.append(fullname)

        for k in set(self._filenames.keys()).difference(all_files):
            del self._filenames[k]

        if relative:
            return self._strip_base(modified_files)
        else:
            return modified_files





################################
# Unit tests
################################

def session_server_tester(ServerClass):
    output = {'msg':None}
    a = 5
    def reset():
        output['msg'] = {'output': '', 'modified_files': [], 'done': False}
    reset()
    def output_callback(msg):
        output['msg']['output'] += msg['output']
        output['msg']['modified_files'].extend(msg['modified_files'])
        output['msg']['done'] = msg['done']
        output['msg']['exec_id'] = msg['exec_id']
    def wait():
        import time
        while not output['msg']['done']:
            time.sleep(0.05)

    S = ServerClass()
    id = S.new_session(output_callback)
    assert id == 0

    # a simple line of code that prints something
    exec_id = S.execute(id, 'print(2+3)')
    assert exec_id == 0
    wait()
    assert output['msg'] == {'output': '5\n', 'exec_id': exec_id, 'modified_files': [], 'done': True}
    assert S.status(id) == 'ok'
    reset()

    # multiline code which also sets some variables and uses them
    exec_id = S.execute(id, 'a=5\nb=7\nprint(a+b)')
    assert exec_id == 1
    wait()
    assert output['msg'] == {'output': '12\n', 'exec_id': exec_id, 'modified_files': [], 'done': True}
    assert S.status(id) == 'ok'
    reset()

    # use variable set in previous call
    exec_id = S.execute(id, 'print(a+b)')
    wait()
    assert output['msg'] == {'output': '12\n', 'exec_id': exec_id, 'modified_files': [], 'done': True}
    assert S.status(id) == 'ok'
    reset()

    # change a and b in another session, and check that it doesn't change this session
    id1 = S.new_session()
    assert id1 == 1
    S.execute(id1, 'a=0; b=2')
    exec_id = S.execute(id, 'print(a+b)')
    wait()
    assert output['msg'] == {'output': '12\n', 'exec_id': exec_id, 'modified_files': [], 'done': True}
    reset()

    # create a file via code
    exec_id = S.execute(id, 'open("foo.txt","w").write("contents")')
    wait()
    assert output['msg'] == {'output': '', 'exec_id': exec_id, 'modified_files': ['foo.txt'], 'done': True}
    assert S.status(id) == 'ok'
    reset()

    # download file
    assert S.get(id, 'foo.txt') == 'contents'

    # use put to overwrite file created above, then read it via executing code
    S.put(id, 'foo.txt', 'xyz')
    exec_id = S.execute(id, 'print(open("foo.txt").read())')
    wait()
    assert output['msg'] == {'output': 'xyz\n', 'exec_id': exec_id, 'modified_files': [], 'done': True}
    assert S.status(id) == 'ok'
    reset()

    # put a file with a nontrivial path
    S.put(id, 'a/b/c/foo.txt', 'stuff')
    assert 'a/b/c/foo.txt' in S.files(id)

    # input that raises an exception
    exec_id = S.execute(id, '1/0')
    wait()
    assert output['msg'] == {'output': "ZeroDivisionError('integer division or modulo by zero',)", 'exec_id': exec_id, 'modified_files': [], 'done': True}
    assert S.status(id) == 'ok'
    reset()

def test_server1():
    session_server_tester(SimpleSessionServer)
