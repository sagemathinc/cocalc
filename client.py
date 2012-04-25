"""
Python client for the workspace compute server.

"""

# import client, doctest; doctest.testmod(client)

import json, time

from misc import get, post, ConnectionError


class Client(object):
    r"""
    EXAMPLES::

        >>> from client import TestClient; c = TestClient()
        >>> c.new_session()
        0
        >>> c.cells(0)
        []
        >>> c.wait(0)
        >>> c.execute(0, 'print(2+3)')
        (0, 'running')
        >>> c.wait(0)
        >>> c.cells(0)
        [{u'code': u'print(2+3)', u'cell_id': 0}]
        >>> c.output(0,0)
        [{u'output': u'5\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
        >>> c.quit()
    """
    def __init__(self, url):
        """
        INPUT:
        - ``url`` -- URL or port; if port, points to that port on localhost

        EXAMPLES::

        We illustrate examples of valid inputs for url::

            >>> import client
            >>> client.Client('http://localhost:5002')
            Client('http://localhost:5002')
            >>> client.Client('http://sagews.com')
            Client('http://sagews.com')
            >>> client.Client(5000)
            Client('http://localhost:5000')
        """
        url = str(url)
        if ':' not in url:
            url = 'http://localhost:%s'%url
        self._url = url

    def __repr__(self):
        """
        EXAMPLES::

            >>> import client; client.Client(5001).__repr__()
            "Client('http://localhost:5001')"
        """
        return "Client('%s')"%self._url
        
    def new_session(self):
        """
        Start a new workspace session, getting back the id of the new
        session on success.

        OUTPUT:

        - integer -- id of new session

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.new_session()
            1
            >>> c.new_session()
            2
            >>> c.quit()
        """
        msg = json.loads(get('%s/new_session'%self._url))
        if msg['status'] == 'ok':
            return int(msg['id'])
        else:
            raise RuntimeError(msg['data'])
    
    def execute(self, session_id, code):
        r"""
        INPUT:
        
        - ``session_id`` -- id of a session
        - ``code`` -- string

        OUTPUT:
        
        - cell_id -- execution id number
        - status message
        
        EXAMPLES::
        
            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.wait(0)
            >>> c.new_session()
            1
            >>> c.wait(1)
            >>> c.execute(0, 'print(2+3)')
            (0, 'running')
            >>> c.execute(1, 'print(5*8)')
            (0, 'running')
            >>> c.wait(0)
            >>> c.cells(0)
            [{u'code': u'print(2+3)', u'cell_id': 0}]
            >>> c.output(0,0)
            [{u'output': u'5\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.wait(1)
            >>> c.cells(1)
            [{u'code': u'print(5*8)', u'cell_id': 0}]
            >>> c.output(1,0)
            [{u'output': u'40\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.quit()            
        """
        msg = post('%s/execute/%s'%(self._url, session_id), {'code':code})
        m = json.loads(msg)
        if m['status'] == u'error':
            raise RuntimeError(m['data'])
        return int(m['cell_id']), str(m['cell_status'])
    
    def sigint(self, session_id):
        r"""
        Send interrupt signal to a running process.

        INPUT:
        
        - ``session_id`` -- id of a session

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.wait(0)
            >>> c.execute(0, 'import time; time.sleep(10)')
            (0, 'running')
            >>> c.wait(0, status='running')
            >>> c.sigint(0)
            {u'status': u'ok'}
            >>> c.wait(0)
            >>> c.cells(0)
            [{u'code': u'import time; time.sleep(10)', u'cell_id': 0}]
            >>> c.output(0,0)
            [{u'output': u'KeyboardInterrupt()', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.execute(0, 'print(2+3)')
            (1, 'running')
            >>> c.wait(0)
            >>> c.cells(0)[1]
            {u'code': u'print(2+3)', u'cell_id': 1}
            >>> c.output(0,1,0)
            [{u'output': u'5\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.quit()            
        """
        return json.loads(get('%s/sigint/%s'%(self._url, session_id)))

    def sigkill(self, session_id):
        """
        INPUT:
        
        - ``session_id`` -- id of a session

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> id = c.new_session(); c.wait(id)
            >>> c.execute(id, 'import time; time.sleep(60)')
            (0, 'running')
            >>> c.sigkill(id)
            {u'status': u'ok'}
            >>> c.session_status(id)
            'dead'
            >>> c.execute(id, 'print(2+3)')
            Traceback (most recent call last):
            ...
            RuntimeError: session is dead
            >>> c.quit()            
        """
        return json.loads(get('%s/sigkill/%s'%(self._url, session_id)))

    def close_all_sessions(self):
        """
        Close all sessions, deleting everything about them; it is as
        if they never existed.  
        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.sessions()
            []


        Close no sessions::
        
            >>> c.close_all_sessions()
            {u'status': u'ok', u'closed': []}

        We start a session, then close_all_sessions, and confirm it is completely gone::

            >>> id = c.new_session(); c.wait(id)
            >>> c.close_all_sessions()
            {u'status': u'ok', u'closed': [0]}
            >>> c.session_status(id)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 0

        We start two sessions, start work going in both, then do close_all_sessions::

            >>> id1 = c.new_session(); id2 = c.new_session()
            >>> c.execute(id1, 'while 1: pass'), c.execute(id2, 'while 1: pass')
            ((0, 'enqueued'), (0, 'enqueued'))
            >>> c.close_all_sessions()
            {u'status': u'ok', u'closed': [0, 1]}
            >>> c.session_status(id1)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 0
            >>> c.session_status(id2)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 1
            >>> c.quit()
        """
        return json.loads(get('%s/close_all_sessions'%self._url))

    def close_session(self, session_id):
        """
        Close the session with given id.

        This removes everything related to the session from the
        database and removes the working temp directory.

        INPUT::

        - ``session_id`` -- nonnegative integer
        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()

        Try to close a nonexistent session::
        
            >>> c.close_session(0)
            {u'status': u'error', u'data': u'unknown session 0'}

        Create a session, start a loop going, then close it::

            >>> id = c.new_session(); c.execute(id, 'while 1: pass')
            (0, 'enqueued')
            >>> c.close_session(0)
            {u'status': u'ok'}
            >>> c.sessions()
            []

        Clean up::
        
            >>> c.quit()
        """
        return json.loads(get('%s/close_session/%s'%(self._url, session_id)))

    def cells(self, session_id):
        r"""
        Return a list of data about the input cells in the given
        session.
        
        INPUT:

        - ``session_id`` -- nonnegative integer

        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> id = c.new_session(); c.wait(id)
            >>> c.cells(id)
            []
            >>> c.execute(id, 'print(2+2)')
            (0, 'running')
            >>> c.wait(id)
            >>> c.cells(id)
            [{u'code': u'print(2+2)', u'cell_id': 0}]
            >>> c.output(id, 0)
            [{u'output': u'4\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            
        We get a ValueError exception if we ask for the cells of an invalid session::
        
            >>> c.cells(int(id)+1)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 1
            >>> c.quit()            
        """
        msg = json.loads(get('%s/cells/%s'%(self._url, int(session_id))))
        if msg['status'] == u'ok':
            return msg['data']
        else:
            raise ValueError(msg['data'])
    
    def output(self, session_id, cell_id, number=0):
        r"""
        Return all output messages of at least the number for the cell
        with given session_id and cell_id.  All inputs must be
        nonnegative integers.

        INPUT:

        - ``session_id`` -- integer; id of a session (need not be valid)
        - ``cell_id`` -- integer; execution id of a cell
        - ``number`` -- integer; output number

        OUTPUT:

        - list of dictionaries ordered by number

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> id = c.new_session(); c.wait(id)
            >>> c.execute(id, 'import time\nfor n in range(3):\n print(n); time.sleep(0.5)')
            (0, 'running')
            >>> c.wait(id)
            >>> c.output(id,0,0)
            [{u'output': u'0\n1', u'modified_files': None, u'done': False, u'number': 0}, {u'output': u'\n2', u'modified_files': None, u'done': False, u'number': 1}, {u'output': u'\n', u'modified_files': None, u'done': False, u'number': 2}, {u'output': None, u'modified_files': None, u'done': True, u'number': 3}]
            >>> c.output(id,0,2)
            [{u'output': u'\n', u'modified_files': None, u'done': False, u'number': 2}, {u'output': None, u'modified_files': None, u'done': True, u'number': 3}]
            >>> c.output(id,0,4)
            []

        Evaluate some more code and look at the corresponding messages::
        
            >>> c.execute(id, 'print(3**100)')
            (1, 'running')
            >>> c.wait(id)
            >>> c.output(id,1)
            [{u'output': u'515377520732011331036461129765621272702107522001\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.output(id,1,1)
            [{u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.quit()
        """
        url = '%s/output_messages/%s/%s/%s'%(self._url, int(session_id), int(cell_id), int(number))
        msg = json.loads(get(url))
        if msg['status'] == u'ok':
            return msg['data']
        else:
            raise RuntimeError(msg['data'])

    def sessions(self):
        """
        Return list of dictionaries with data about all current
        sessions.

        OUTPUT:

        - list of dictionaries

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()

        No sessions yet::
        
            >>> c.sessions()
            []
        
        Make a session and get info::

            >>> c.new_session(); c.sessions()
            0
            [{u'status': u'running', u'url': u'http://localhost:5001', u'start_time': u'...', u'pid': ..., u'path': u'...', u'next_cell_id': 0, u'id': 0, u'last_active_cell_id': -1}]

        Make another session and get info::
        
            >>> c.new_session(); c.sessions()
            1
            [{u'status': u'running', u'url': u'http://localhost:5001', u'start_time': u'...', u'pid': ..., u'path': u'...', u'next_cell_id': 0, u'id': 0, u'last_active_cell_id': -1}, {u'status': u'running', u'url': u'http://localhost:5002', u'start_time': u'...', u'pid': ..., u'path': u'...', u'next_cell_id': 0, u'id': 1, u'last_active_cell_id': -1}]

        Clean up::
        
            >>> c.quit()
        """
        msg = json.loads(get('%s/sessions'%self._url))
        if msg['status'] == u'error':
            raise ValueError(msg['data'])
        return msg['sessions']

    def session(self, session_id):
        """
        Return data about session with given id.

        INPUT:
        
        - ``session_id`` -- id of a session

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()

        An invalid session::
        
            >>> c.session(0)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 0
        
        Make a session and get info::

            >>> c.new_session(); c.session(0)
            0
            {u'status': u'running', u'url': u'http://localhost:5001', u'start_time': u'...', u'pid': ..., u'path': u'...', u'next_cell_id': 0, u'id': 0, u'last_active_cell_id': -1}

        Clean up::
        
            >>> c.quit()
        """
        msg = json.loads(get('%s/session/%s'%(self._url, session_id)))
        if msg['status'] == u'error':
            raise ValueError(msg['data'])
        return msg['data']

    def session_status(self, session_id=None):
        """
        Return the status of the session with given id.

        INPUT:

        - ``session_id`` -- nonnegative integer or None

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()

        An invalid session::
        
            >>> c.session_status(0)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 0

        Make a session and get its status::

            >>> c.new_session(); c.session_status(0)
            0
            'running'

        After it starts up the status changes to 'ready'::

            >>> c.wait(0); c.session_status(0)
            'ready'

        If we sigkill it, then the status changes to 'dead', but the
        session still exists::

            >>> c.sigkill(0); c.session_status(0)
            {u'status': u'ok'}
            'dead'

        If we delete the session, then we get an error as above; there
        is no status::

            >>> c.close_session(0); c.session_status(0)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 0

        Clean up::
        
            >>> c.quit()
        """
        if session_id is None:
            try:
                get(self._url)
            except ConnectionError:
                return 'running'
            else:
                return 'ready'
        url = '%s/status/%s'%(self._url, int(session_id))
        msg = json.loads(get(url))
        if msg['status'] == u'error':
            raise ValueError(msg['data'])
        return str(msg['session_status'])

    def wait(self, session_id=None, delta=0.01, timeout=5, status='ready'):
        """
        Wait up to timeout seconds until the session with given id has
        the given status.

        NOTE: This should be used mainly for testing purposes.  Good
        clients should implement a push mechanism (e.g., websockets).

        INPUT:

        - ``session_id`` -- nonnegative integer; id of a session
        - ``delta`` -- positive float
        - ``timeout`` -- positive real number
        - ``status`` -- string; the status to wait for
        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> id = c.new_session(); c.wait(id)
            >>> c.execute(id, 'import time; time.sleep(3)'); c.wait(0)
            (0, 'running')
            >>> c.output(id, 0)
            [{u'output': None, u'modified_files': None, u'done': True, u'number': 0}]

        We can only wait for known sessions::
        
            >>> c.wait(1, timeout=5)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 1
            >>> c.quit()            
        """
        t = time.time()
        while time.time() <= t + timeout:
            if self.session_status(session_id) == status:
                return
            time.sleep(delta)
            if delta < 5:
                delta *= 1.25  # exponential backoff
        raise RuntimeError('timeout')

    def put_file(self, id, files):
        """
        Create files in the session with given id, where files is a
        dictionary of filename:content pairs, and content is a string
        or file-like object.

        INPUT::

        - ``id`` -- nonnegative integer
        - ``files`` -- dictionary
        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()

        First try to put a file into a session that doesn't exist::

            >>> c.put_file(0, {'foo.txt':'stuff'})
            Traceback (most recent call last):
            ...
            ValueError: unknown session 0

            >>> c.new_session()
            0
            >>> c.put_file(0, {'a/b/c.txt':'more stuff'})
            >>> c.get_file(0, 'a/b/c.txt')
            u'more stuff'
            
            >>> c.quit()
        """
        msg = post('%s/put_file/%s'%(self._url, id), files=files)
        m = json.loads(msg)
        if m['status'] == u'error':
            raise ValueError(str(m['data']))

    def get_file(self, id, path):
        """
        Get file as a string with given path from session with given id.
        
        INPUT:

        - ``id`` -- nonnegative integer
        - ``path`` -- string
        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.execute(0, "open('a.txt','w').write('stuff')")
            (0, 'enqueued')
            >>> c.wait(0)
            >>> c.get_file(0, 'a.txt')
            u'stuff'
            >>> c.put_file(0, {'a/b/c.txt':'more stuff'})
            >>> c.get_file(0, 'a/b/c.txt')
            u'more stuff'

        Try to get a file that doesn't exist::

            >>> c.get_file(0, 'a/b/z.txt')
            u'...<title>404 Not Found</title>...'

        Try to get a file in a session that doesn't exist::

            >>> c.get_file(1, 'file.txt')
            u'...<title>404 Not Found</title>...'

        Clean up::
        
            >>> c.quit()
        """
        return get('%s/get_file/%s/%s'%(self._url, id, path))

    def delete_file(self, id, path):
        """
        Delete file in the session with given id.

        INPUT:

        - ``id`` -- nonnegative integer
        - ``path`` -- string
        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()

        First try to delete a file in a session that doesn't exist::

            >>> c.delete_file(0, 'foo.txt')
            Traceback (most recent call last):
            ...
            ValueError: unknown session 0

        Try to delete a file that doesn't exists::
        
            >>> c.new_session()
            0
            >>> c.delete_file(0, 'foo.txt')
            Traceback (most recent call last):
            ...
            ValueError: no file "foo.txt"

        Delete a file that exists::

            >>> c.put_file(0, {'a/b/c.txt':'more stuff'})
            >>> c.delete_file(0, 'a/b/c.txt')

        Clean up::

            >>> c.quit()
        """
        m = json.loads(get('%s/delete_file/%s/%s'%(self._url, id, path)))
        if m['status'] == u'error':
            raise ValueError(str(m['data']))
        
class TestClient(Client):
    """
    A testing client, which on startup also starts a frontend daemon,
    and deletes all sessions.  Take care to explicitly call .quit()
    when done with this.
    
    EXAMPLES::

        >>> from client import TestClient; c = TestClient()
        >>> c
        Client('http://localhost:5000')
        >>> c.quit()
    """
    def __init__(self, port=5000):
        """
        INPUT:

        - ``port`` -- nonnegative integer
        """
        Client.__init__(self, port)
        import frontend
        self.r = frontend.Daemon(port)
        self.wait()
        self.close_all_sessions()

    def quit(self):
        """
        You must explicitly call quit() to clean up any sessions
        started when testing.  Cleanup is *not* done automatically via
        garbage collection, since that happens at weird times, and
        leads to disaster.

        EXAMPLES::

            >>> from client import TestClient; c = TestClient(5002)
            >>> c.quit()
        """
        try:
            self.close_all_sessions()
        except:
            pass
        if hasattr(self, 'r'):
            del self.r

def test1(n=10):
    """
    Unit test -- send n simple execute requests in rapid fire, then
    verify that they were received.  We do not check that they were in
    fact computed here.

    EXAMPLES::

        >>> test1(2)
        ['print(0)', 'print(1)']
    """
    c = TestClient(); c.wait()
    id = c.new_session(); c.wait(id)
    requests = ['print(%s)'%j for j in range(n)]
    print requests
    for x in requests:
        c.execute(id, x)
    c.wait(id)
    cells = c.cells(id)
    for i, x in enumerate(requests):
        assert x == cells[i]['code']
    c.quit()

