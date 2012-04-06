import os, posixpath, shutil, StringIO, sys, tempfile

class SimpleSessionServer(object):
    def __init__(self):
        self._next_id = 0
        self._session = {}
        
    def new_session(self, push_protocol='stdout'):
        """
        INPUT:
        - ``push_protocol`` -- (string); 'stdout'
        """
        S = SimpleSession(self._next_id, push_protocol)
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
        return self._session[id].execute(code)
        
    def put(self, id, path, content):
        self._session[id].put(path, content)

    def get(self, id, path):
        return self._session[id].get(path)        

    def status(self, id):
        return self._session[id].status()

class SimpleSession(object):
    def __init__(self, id, push_protocol):
        self._id = id
        self._exec_id = 0
        self._namespace = {}
        self._push_protocol = push_protocol
        self._directory = tempfile.mkdtemp()

    def __del__(self):
        shutil.rmtree(self._directory)

    def __repr__(self):
        return "SimpleSession with id %s"%self._id

    @property
    def id(self):
        return self._id

    def execute(self, code):
        exec_id = self._exec_id
        self._exec_id += 1
        
        file_times = dict([(f, os.stat(os.path.join(self._directory, f)).st_mtime)
                           for f in os.listdir(self._directory)])
        out = StringIO.StringIO()

        stdout = sys.stdout
        stderr = sys.stderr
        sys.stdout = out
        sys.stderr = out
        curdir = os.path.abspath(os.curdir)
        
        try:
            os.chdir(self._directory)
            exec code in self._namespace
        except:
            out.write(repr(sys.exc_info()[1]))
        finally:
            os.chdir(curdir)            
            sys.stdout = stdout
            sys.stderr = stderr
            
        text_output = out.getvalue()
        files = os.listdir(self._directory)
        modified_files = [f for f in files if (f not in file_times
               or file_times[f] < os.stat(os.path.join(self._directory, f)).st_mtime)] + \
               list(set(file_times).difference(files))

        self._push_result(exec_id, text_output, modified_files, done=True)
        return exec_id

    def _push_result(self, exec_id, text_output, modified_files, done):
        if self._push_protocol == 'stdout':
            print("exec_id = %s\ntext_output: '%s'\nmodified_files: %s\ndone: %s"%(
                exec_id, text_output, modified_files, done))
        else:
            raise ValueError, "unknown push protocol"

    def _full_path(self, path):
        path = posixpath.normpath(path)
        if '..' in path or os.path.isabs(path):
            raise RuntimeError, "insecure path"
        return os.path.join(self._directory, path)

    def put(self, path, content):
        path = self._full_path(path)
        base, fname = os.path.split(path)
        if not os.path.exists(base):
            os.makedirs(base)
        open(path, 'w').write(content)

    def get(self, path):
        return open(self._full_path(path),'rb').read()

    def status(self):
        return 'ok'

    def files(self):
        all_files = []
        n = len(self._directory)+1
        for root, dirs, files in os.walk(self._directory):
            all_files.extend([os.path.join(root[n:], f) for f in files])
        all_files.sort()
        return all_files
