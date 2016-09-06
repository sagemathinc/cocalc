import socket
import conftest
import os
import re

from textwrap import dedent # makes it prettier :-)

def test_connection_type(sagews):
    print("type %s"%type(sagews))
    assert isinstance(sagews, conftest.ConnectionJSON)
    return

def test_set_file_env(sagews, test_id):
    head, file = conftest.path_info()
    code = "os.chdir(salvus.data[\'path\']);__file__=salvus.data[\'file\']"
    data = {
        'path':head,
        'file':file
    }
    m = conftest.message.execute_code(code = code, id = test_id)
    m['preparse'] = False
    m['data'] = data
    sagews.send_json(m)
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg == {u'done': True, u'event': u'output', u'id': test_id}
    return

# plan is to write out a few tests the long way before refactoring

def test_assignment(sagews, test_id):
    code = dedent(r"""
    x = 42
    x""")
    m = conftest.message.execute_code(code = code, id = test_id)
    m['preparse'] = False
    sagews.send_json(m)
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg == {"stdout": "42\n", "done": False, "event": "output", "id": test_id}
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg == {"done": True, "event": "output", "id": test_id}
    return

# tracking down failure of sage_server "import graphics"
def test_syspath(sagews, test_id):
    code = "print(len(sys.path), len(sys.modules))"
    m = conftest.message.execute_code(code = code, id = test_id)
    m['preparse'] = False
    sagews.send_json(m)
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg == {"stdout": "(43, 3708)\n", "done": False, "event": "output", "id": test_id}
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg == {"done": True, "event": "output", "id": test_id}
    return

# test for issue #70 https://github.com/sagemathinc/smc/issues/70
def test_smc_70(sagews, test_id):
    code = dedent(r"""
    for i in range(1):
        pass
    'x'
    """)
    m = conftest.message.execute_code(code = code, id = test_id)
    m['preparse'] = False
    sagews.send_json(m)
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg == {"stdout": "\'x\'\n", "done": False, "event": "output", "id": test_id}
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg == {"done": True, "event": "output", "id": test_id}
    return

## HSY
def test_plot(sagews, test_id):
    code = dedent(r"""
    %var x
    plot(sin(x), (x, -5, 5))
    """).lstrip()
    m = conftest.message.execute_code(code = code, id = test_id)
    m['preparse'] = True
    sagews.send_json(m)
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg['event'] == 'output'
    print(mesg.keys())
    print(mesg)
    fname = mesg['file']['filename']
    _, fn = os.path.split(fname)
    #mtch = re.match('tmp_\w+\.svg$',fn)
    #assert mtch is not None
## HSY END