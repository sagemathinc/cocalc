"""
Simple Session Server
"""

# we use only standard Python modules to implement this server
import os, posixpath, shutil, StringIO, sys, tempfile

def simple_push(*args):
    print args

# A simple session server:
class SimpleSessionServer(object):
    def __init__(self):
        self._next_id = 0
        self._session = {}

    def session(self, id):
        if id in self._session:
            return self._session[id]
        else:
            raise ValueError, "unknown session %s"%id
        
    def new_session(self, push=simple_push):
        """
        INPUT:
        - ``push`` -- None (system fallback) or callable that takes as input exec_id, text, files, done.
        """
        S = SimpleSession(self._next_id, push)
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
        """
        return self.session(id).execute(code)
        
    def put(self, id, path, content):
        self.session(id).put(path, content)

    def get(self, id, path):
        return self.session(id).get(path)        

    def status(self, id):
        return self.session(id).status()

    def filenames(self, id):
        return self.session(id).filenames()

def test_server1():
    S = SimpleSessionServer()
    id = S.new_session(push_method='stdout')
    S.execute(id, '2+3')
    assert S.status(id) == 'ok'
    

class SimpleSession(object):
    def __init__(self, id, push):
        self._id = id
        self._exec_id = 0
        self._namespace = {}
        self._push = push
        self._execpath = tempfile.mkdtemp()
        self._pathtree = PathTree(self._execpath)

    def __del__(self):
        shutil.rmtree(self._execpath)

    def __repr__(self):
        return "SimpleSession with id %s"%self._id

    @property
    def id(self):
        return self._id

    def execute(self, code):
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
            
        text_output = out.getvalue()
        modified_files = self._pathtree.modified_files()
        done = True

        self._push(exec_id, text_output, modified_files, done)
        return exec_id

    def _full_path(self, path):
        path = posixpath.normpath(path)
        if '..' in path or os.path.isabs(path):
            raise RuntimeError, "insecure path"
        return os.path.join(self._execpath, path)

    def put(self, path, content):
        path = self._full_path(path)
        base, fname = os.path.split(path)
        if not os.path.exists(base):
            os.makedirs(base)
        open(path, 'w').write(content)
        # update the modified_files cache
        self._pathtree.modified_files()

    def get(self, path):
        return open(self._full_path(path),'rb').read()

    def status(self):
        return 'ok'

    def filenames(self):
        return self._pathtree.filenames()

class PathTree(object):
    def __init__(self, path):
        self._path = os.path.abspath(path)
        self._filenames = {}
        self._n = len(self._path) + 1
        for root, dirs, files in os.walk(self._path):
            for fname in files:
                fullname = os.path.join(root, fname)
                self._filenames[fullname] = os.stat(fullname).st_mtime

    def strip_base(self, v):
        return [x[self._n:] for x in v]
                
    def filenames(self, relative=True):
        if relative:
            return self.strip_base(self._filenames.keys())
        else:
            return self._filenames.keys()

    def modified_files(self, relative=True):
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
        
    
