"""
Python client for the workspace compute server.

"""

# import client, doctest; doctest.testmod(client)

import json, time

from misc import get, post


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
        [{u'exec_id': 0, u'code': u'print(2+3)'}]
        >>> c.output(0,0)
        [{u'output': u'5\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
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
        - exec_id -- execution id number
        - status message
        
        EXAMPLES::
        
            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.wait()
            >>> c.new_session()
            1
            >>> c.wait()
            >>> c.execute(0, 'print(2+3)')
            (0, 'running')
            >>> c.execute(1, 'print(5*8)')
            (0, 'running')
            >>> c.wait(0)
            >>> c.cells(0)
            [{u'exec_id': 0, u'code': u'print(2+3)'}]
            >>> c.output(0,0)
            [{u'output': u'5\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.wait(1)
            >>> c.cells(1)
            [{u'exec_id': 0, u'code': u'print(5*8)'}]
            >>> c.output(1,0)
            [{u'output': u'40\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
        """
        msg = post('%s/execute/%s'%(self._url, session_id), {'code':code})
        m = json.loads(msg)
        if m['status'] == u'error':
            raise RuntimeError(m['data'])
        return int(m['exec_id']), str(m['cell_status'])
    
    def sigint(self, session_id):
        r"""
        Send interrupt signal to a running process.

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.execute(0, 'import time; time.sleep(10)')
            (0, 'running')
            >>> c.sigint(0)
            {u'status': u'ok'}
            >>> c.wait(0)  
            >>> c.cells(0)
            [{u'exec_id': 0, u'code': u'import time; time.sleep(10)'}]
            >>> c.output(0,0)
            [{u'output': u'KeyboardInterrupt()', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.execute(0, 'print(2+3)')
            (1, 'running')
            >>> c.wait(0)
            >>> c.cells(0)[1]
            {u'exec_id': 1, u'code': u'print(2+3)'}
            >>> c.output(0,1,0)
            [{u'output': u'5\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
        """
        return json.loads(get('%s/sigint/%s'%(self._url, session_id)))

    def sigkill(self, session_id):
        """
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.execute(0, 'import time; time.sleep(60)')
            (0, 'running')
            >>> c.sigkill(0)
            {u'status': u'ok'}
            >>> c.session_status(0)
            'dead'
            >>> c.execute(0, 'print(2+3)')
            Traceback (most recent call last):
            ...
            RuntimeError: session is dead
        """
        return json.loads(get('%s/sigkill/%s'%(self._url, session_id)))

    def killall(self):
        return json.loads(get('%s/killall'%self._url))

    def cells(self, session_id):
        r"""
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> id = c.new_session(); c.wait(id)
            >>> c.cells(id)
            []
            >>> c.execute(id, 'print(2+2)')
            (0, 'running')
            >>> c.wait(id)
            >>> c.cells(id)
            [{u'exec_id': 0, u'code': u'print(2+2)'}]
            >>> c.output(id, 0)
            [{u'output': u'4\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            
        We get a ValueError exception if we ask for the cells of an invalid session::
        
            >>> c.cells(int(id)+1)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 1
        """
        msg = json.loads(get('%s/cells/%s'%(self._url, int(session_id))))
        if msg['status'] == u'ok':
            return msg['data']
        else:
            raise ValueError(msg['data'])
    
    def output(self, session_id, exec_id, number=0):
        r"""
        Return all output messages of at least the number for the cell
        with given session_id and exec_id.  All inputs must be
        nonnegative integers.

        INPUT:

        - ``session_id`` -- integer; id of a session (need not be valid)
        - ``exec_id`` -- integer; execution id of a cell
        - ``number`` -- integer; output number

        OUTPUT:

        - list of dictionaries ordered by number

        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.new_session(); c.wait(0)
            0
            >>> c.execute(0, 'import time\nfor n in range(3):\n print(n); time.sleep(0.5)')
            (0, 'running')
            >>> c.wait(0)
            >>> c.output(0,0,0)
            [{u'output': u'0\n1', u'modified_files': None, u'done': False, u'number': 0}, {u'output': u'\n2', u'modified_files': None, u'done': False, u'number': 1}, {u'output': u'\n', u'modified_files': None, u'done': False, u'number': 2}, {u'output': None, u'modified_files': None, u'done': True, u'number': 3}]
            >>> c.output(0,0,2)
            [{u'output': u'\n', u'modified_files': None, u'done': False, u'number': 2}, {u'output': None, u'modified_files': None, u'done': True, u'number': 3}]
            >>> c.output(0,0,4)
            []

        Evaluate some more code and look at the corresponding messages::
        
            >>> c.execute(0, 'print(3**100)')
            (1, 'running')
            >>> c.wait(0)
            >>> c.output(0,1)
            [{u'output': u'515377520732011331036461129765621272702107522001\n', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
            >>> c.output(0,1,1)
            [{u'output': None, u'modified_files': None, u'done': True, u'number': 1}]
        """
        url = '%s/output_messages/%s/%s/%s'%(self._url, int(session_id), int(exec_id), int(number))
        msg = json.loads(get(url))
        if msg['status'] == u'ok':
            return msg['data']
        else:
            raise RuntimeError(msg['data'])

    def sessions(self):
        return json.loads(get('%s/sessions'%self._url))

    def session(self, session_id):
        return json.loads(get('%s/session/%s'%(self._url, session_id)))

    def session_status(self, session_id):
        """
        Return the status of the session with given id.

        INPUT:
        - ``session_id`` -- nonnegative integer
        """
        url = '%s/status/%s'%(self._url, int(session_id))
        msg = json.loads(get(url))
        if msg['status'] == u'error':
            raise ValueError(msg['data'])
        return str(msg['session_status'])

    def wait(self, session_id=None, delta=0.05, timeout=5):
        """
        Wait until the session with given id is in the 'ready' state.

        This should be used only for testing purposes.  Any good
        client should implement a push mechanishm (something like
        websockets).
        
        EXAMPLES::

            >>> from client import TestClient; c = TestClient()
            >>> c.new_session()
            0
            >>> c.execute(0, 'import time; time.sleep(3)'); c.wait(0)
            (0, 'running')
            >>> c.output(0,0)
            [{u'output': u'', u'modified_files': None, u'done': False, u'number': 0}, {u'output': None, u'modified_files': None, u'done': True, u'number': 1}]

        We can only wait for known sessions::
        
            >>> c.wait(1, timeout=5)
            Traceback (most recent call last):
            ...
            ValueError: unknown session 1
        """

        if session_id is None:
            # todo -- fully implement this! -- what should it even mean?
            time.sleep(1)
        else:
            t = time.time()
            while time.time() <= t + timeout:
                if self.session_status(session_id) == 'ready':
                    return
                time.sleep(delta)
                if delta < 5:
                    delta *= 2  # exponential backoff
            raise RuntimeError('timeout')

    def put_file(self, id, files):
        """
        Create files in the session with given id, where files is a
        dictionary of filename:content pairs, and content is a string
        or file-like object.
        
        EXAMPLES::

        """
        msg = post('%s/put_file/%s'%(self._url, id), files=files)
        m = json.loads(msg)
        if m['status'] == u'error':
            raise ValueError(str(m['data']))

    def get_file(self, id, path):
        return get('%s/get_file/%s/%s'%(self._url, id, path))

    def delete_file(self, id, path):
        m = json.loads(get('%s/delete_file/%s/%s'%(self._url, id, path)))
        if m['status'] == u'error':
            raise ValueError(str(m['data']))
        
class TestClient(Client):
    def __init__(self, port=5000):
        Client.__init__(self, port)
        import frontend
        self.r = frontend.Daemon(port)
        self.wait()
        self.killall()

    def __del__(self):
        try:
            self.killall()
        except:
            pass

def test1(n=10):
    """
    Unit test -- send n simple execute requests in rapid fire, then
    verify that they were received.  We do not check that they were in
    fact computed here.

    EXAMPLES::

        >>> test1(2)
        ['print(0)', 'print(1)']
    """
    c = TestClient()
    c.wait(); id = c.new_session(); c.wait()
    requests = ['print(%s)'%j for j in range(n)]
    print requests
    for x in requests:
        c.execute(id, x)
    c.wait(id)
    cells = c.cells(id)
    for i, x in enumerate(requests):
        assert x == cells[i]['code']

