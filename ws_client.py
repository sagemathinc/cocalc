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
        >>> c.new_session()
        '0'
        >>> c.cells(0)
        []
        >>> c.wait(0)
        >>> c.execute(0, 'print(2+3)')
        'running'
        >>> c.wait(0)
        >>> c.cells(0)
        [{u'output': [{u'output': u'5\n', u'modified_files': u'[]', u'done': True}, {u'output': None, u'modified_files': None, u'done': True}], u'exec_id': 0, u'code': u'print(2+3)'}]
    """
    def __init__(self, port):
        self._port = port
        self._url = 'http://localhost:%s'%port
        
    def new_session(self):
        return get('%s/new_session'%self._url)
    
    def execute(self, session_id, code):
        return post('%s/execute/%s'%(self._url, session_id), {'code':code}, read=True)

    def sigint(self, session_id):
        return get('%s/sigint/%s'%(self._url, session_id))

    def sigkill(self, session_id):
        return get('%s/sigkill/%s'%(self._url, session_id))

    def cells(self, session_id):
        return json.loads(get('%s/cells/%s'%(self._url, session_id)))

    def wait(self, session_id):
        time.sleep(0.1)
