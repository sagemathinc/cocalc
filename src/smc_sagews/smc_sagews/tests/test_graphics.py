# test_graphics.py
# tests of sage worksheet that return more than stdout, e.g. svg files

import conftest
import time

# TODO(hal) refactor this later
SHA_LEN = 36

class TestGraphics:
    def test_plot(self, execblob):
        execblob("plot(cos(x),x,0,pi)", want_html=False)

class TestOctavePlot:
    def test_plot(self,execblob):
        # assume octave kernel not running at start of test
        execblob("%octave\nx = -10:0.1:10;plot (x, sin (x));", want_html=False)

class TestShowGraphs:
    def test_issue594(self, test_id, sagews):
        code = """G = Graph(sparse=True)
G.allow_multiple_edges(True)
G.add_edge(1,2)
G.add_edge(2,3)
G.add_edge(3,1)
for i in range(2):
    print ("BEFORE PLOT %s"%i)
    G.show()
    print ("AFTER PLOT %s"%i)"""
        m = conftest.message.execute_code(code = code, id = test_id)
        sagews.send_json(m)
        # expect 12 messages from worksheet client, including final done:true
        # 1 stdout BEFORE PLOT 0
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stdout' in mesg
        assert 'BEFORE PLOT 0' in mesg['stdout']
        # 2 blob file
        typ, mesg = sagews.recv()
        assert typ == 'blob'
        file_uuid = mesg[:SHA_LEN]
        assert file_uuid == conftest.uuidsha1(mesg[SHA_LEN:])
        m = conftest.message.save_blob(sha1 = file_uuid)
        sagews.send_json(m)
        # 3 filename
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'file' in mesg

        # 4 stdout AFTER PLOT 0
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stdout' in mesg
        assert 'AFTER PLOT 0' in mesg['stdout']
        # 5 stdout BEFORE PLOT 1
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stdout' in mesg
        assert 'BEFORE PLOT 1' in mesg['stdout']
        # 6 blob file
        typ, mesg = sagews.recv()
        assert typ == 'blob'
        file_uuid = mesg[:SHA_LEN]
        assert file_uuid == conftest.uuidsha1(mesg[SHA_LEN:])
        m = conftest.message.save_blob(sha1 = file_uuid)
        sagews.send_json(m)
        # 7 filename
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'file' in mesg

        # 8 stdout AFTER PLOT 1
        typ, mesg = sagews.recv()
        assert typ == 'json'
        assert mesg['id'] == test_id
        assert 'stdout' in mesg
        assert 'AFTER PLOT 1' in mesg['stdout']
        # 9 stdout newline
        conftest.recv_til_done(sagews, test_id)


