"""
Python client for the workspace compute server.

"""

import json, time

from misc import get, post

class Client(object):
    r"""
    EXAMPLES::

        >>> import ws_frontend; r = ws_frontend.Runner(5000)
        >>> import ws_client;   c = ws_client.Client(5000)
        >>> c.wait(0)
        >>> c.new_session()
        '0'
        >>> c.cells(0)
        []
        >>> c.wait(0)
        >>> c.execute(0, 'print(2+3)')
        'running'
        >>> c.wait(0)
        >>> c.cells(0)
        [{u'output': [{u'output': u'5\n', u'modified_files': u'[]', u'done': False}, {u'output': None, u'modified_files': None, u'done': True}], u'exec_id': 0, u'code': u'print(2+3)'}]
    """
    def __init__(self, url):
        """
        INPUT:
        - ``url`` -- URL or port; if port, points to that port on localhost

        EXAMPLES::

        We illustrate examples of valid inputs for url::

            >>> import ws_client
            >>> ws_client.Client('http://localhost:5002')
            Client('http://localhost:5002')
            >>> ws_client.Client('http://sagews.com')
            Client('http://sagews.com')
            >>> ws_client.Client(5000)
            Client('http://localhost:5000')
        """
        url = str(url)
        if ':' not in url:
            url = 'http://localhost:%s'%url
        self._url = url

    def __repr__(self):
        """
        EXAMPLES::

            >>> import ws_client; ws_client.Client(5001).__repr__()
            "Client('http://localhost:5001')"
        """
        return "Client('%s')"%self._url
        
    def new_session(self):
        """
        Start a new workspace session, getting back the id of the new
        session on success.

        OUTPUT:
        - ``string``

        EXAMPLES::

            >>> import ws_frontend; r = ws_frontend.Runner(5000)
            >>> import ws_client;   c = ws_client.Client(5000)
            >>> c.wait(0)
            >>> c.new_session()
            '0'
            >>> c.new_session()
            '1'
            >>> c.new_session()
            '2'
        """
        return get('%s/new_session'%self._url)
    
    def execute(self, session_id, code):
        r"""
        INPUT:
        - ``session_id`` -- id of a session
        - ``code`` -- string

        OUTPUT:
        - status code 
        
        EXAMPLES::
        
            >>> import ws_frontend; r = ws_frontend.Runner(5000)
            >>> import ws_client;   c = ws_client.Client(5000)
            >>> c.new_session()
            '0'
            >>> c.wait(0)
            >>> c.new_session()
            '1'
            >>> c.wait(1)
            >>> c.execute(0, 'print(2+3)')
            'running'
            >>> c.execute(1, 'print(5*8)')
            'running'
            >>> c.wait(0)
            >>> c.cells(0)
            [{u'output': [{u'output': u'5\n', u'modified_files': u'[]', u'done': False}, {u'output': None, u'modified_files': None, u'done': True}], u'exec_id': 0, u'code': u'print(2+3)'}]
            >>> c.wait(1)
            >>> c.cells(1)
            [{u'output': [{u'output': u'40\n', u'modified_files': u'[]', u'done': False}, {u'output': None, u'modified_files': None, u'done': True}], u'exec_id': 0, u'code': u'print(5*8)'}]
        """
        return post('%s/execute/%s'%(self._url, session_id), {'code':code}, read=True)

    def sigint(self, session_id):
        return get('%s/sigint/%s'%(self._url, session_id))

    def sigkill(self, session_id):
        return get('%s/sigkill/%s'%(self._url, session_id))

    def cells(self, session_id):
        return json.loads(get('%s/cells/%s'%(self._url, session_id)))

    def wait(self, session_id):
        time.sleep(0.5)
