"""
Simple Session Server
"""

# Standard Python modules
import os, posixpath, shutil, StringIO, sys, tempfile

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
        
        """
        if id in self._session:
            return self._session[id]
        else:
            raise ValueError, "unknown session %s"%id
        
    def new_session(self, output_callback=None):
        """
        EXAMPLES::
        
        INPUT:
        - ``output_callback`` -- None (system fallback) or callable that takes as input a single argument
        """
        if output_callback is None:
            def output_callback(msg):
                print msg
        S = SimpleSession(self._next_id, output_callback)
        self._next_id += 1
        self._session[S.id] = S
        return S.id

    def execute(self, id, code):
        """
        INPUT:
        - ``id`` -- session id
        - ``code`` -- string; code to execute

        OUTPUT:
        - ``exec_id`` -- id associated to evaluation of this code

        EXAMPLES::
        
        """
        return self.session(id).execute(code)
        
    def put(self, id, path, content):
        """
        EXAMPLES::
        
        """
        self.session(id).put(path, content)

    def get(self, id, path):
        """
        EXAMPLES::
        
        """
        return self.session(id).get(path)        

    def status(self, id):
        """
        EXAMPLES::
        
        """
        return self.session(id).status()

    def filenames(self, id):
        """
        EXAMPLES::
        
        """
        return self.session(id).filenames()

    
class SimpleSession(object):
    def __init__(self, id, output_callback):
        """
        EXAMPLES::
        
        """
        self._id = id
        self._exec_id = 0
        self._namespace = {}
        self._output_callback = output_callback
        self._execpath = tempfile.mkdtemp()
        self._pathtree = PathTree(self._execpath)

    def __del__(self):
        """
        EXAMPLES::
        
        """
        shutil.rmtree(self._execpath)

    def __repr__(self):
        """
        EXAMPLES::
        
        """
        return "SimpleSession with id %s"%self._id

    @property
    def id(self):
        """
        EXAMPLES::
        
        """
        return self._id

    def execute(self, code):
        """
        EXAMPLES::
        
        """
        exec_id = self._exec_id
        self._exec_id += 1
        
        out = StringIO.StringIO()

        stdout = sys.stdout
        stderr = sys.stderr
        sys.stdout = out
        sys.stderr = out
        curdir = os.path.abspath(os.curdir)
        
        try:
            os.chdir(self._execpath)
            exec code in self._namespace
        except:
            out.write(repr(sys.exc_info()[1]))
        finally:
            os.chdir(curdir)            
            sys.stdout = stdout
            sys.stderr = stderr
            
        output = out.getvalue()
        modified_files = self._pathtree.modified_files()
        done = True

        msg = {'exec_id':exec_id, 'output':output, 'modified_files':modified_files, 'done':done}
        self._output_callback(msg)
        return exec_id

    def _full_path(self, path):
        """
        EXAMPLES::
        
        """
        path = posixpath.normpath(path)
        if '..' in path or os.path.isabs(path):
            raise RuntimeError, "insecure path"
        return os.path.join(self._execpath, path)

    def put(self, path, content):
        """
        EXAMPLES::
        
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
        
        """
        return open(self._full_path(path),'rb').read()

    def status(self):
        """
        EXAMPLES::
        
        """
        return 'ok'

    def filenames(self):
        """
        EXAMPLES::
        
        """
        return self._pathtree.filenames()

class PathTree(object):
    def __init__(self, path):
        """
        EXAMPLES::
        
        """
        self._path = os.path.abspath(path)
        self._filenames = {}
        self._n = len(self._path) + 1
        for root, dirs, files in os.walk(self._path):
            for fname in files:
                fullname = os.path.join(root, fname)
                self._filenames[fullname] = os.stat(fullname).st_mtime

    def strip_base(self, v):
        """
        EXAMPLES::
        
        """
        return [x[self._n:] for x in v]
                
    def filenames(self, relative=True):
        """
        EXAMPLES::
        
        """
        if relative:
            return self.strip_base(self._filenames.keys())
        else:
            return self._filenames.keys()

    def modified_files(self, relative=True):
        """
        EXAMPLES::
        
        """
        modified_files = []
        for root, dirs, files in os.walk(self._path):
            for fname in files:
                fullname = os.path.join(root, fname)
                mtime = os.stat(fullname).st_mtime
                if fullname not in self._filenames:
                    self._filenames[fullname] = mtime
                    modified_files.append(fullname)
                elif self._filenames[fullname] != mtime:
                    modified_files.append(fullname)
        if relative:
            return self.strip_base(modified_files)
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
    assert 'a/b/c/foo.txt' in S.filenames(id)

    # input that raises an exception
    exec_id = S.execute(id, '1/0')
    wait()
    assert output['msg'] == {'output': "ZeroDivisionError('integer division or modulo by zero',)", 'exec_id': exec_id, 'modified_files': [], 'done': True}
    assert S.status(id) == 'ok'
    reset()

def test_server1():
    session_server_tester(SimpleSessionServer)
