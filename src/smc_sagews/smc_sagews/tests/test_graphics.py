# test_graphics.py
# tests of sage worksheet that return more than stdout, e.g. svg files

import conftest
import time

from textwrap import dedent

import pytest

# TODO(hal) refactor this later
SHA_LEN = 36

class TestTachyon:
    def test_t_show0(self, exec2):
        code = dedent(r"""t = Tachyon(xres=400,yres=400, camera_center=(2,0,0))
        t.light((4,3,2), 0.2, (1,1,1))
        t.sphere((0,0,0), 0.5, 't0')""")
        exec2(code,[])
    def test_t_show1(self, execblob):
        execblob("t.show()", want_html = False, file_type='png', ignore_stdout = True)
    def test_show_t(self, execblob):
        execblob("show(t)", want_html = False, file_type='png', ignore_stdout = True)
    def test_t(self, execblob):
        execblob("t", want_html = False, file_type='png', ignore_stdout = True)

class TestThreeJS:
    # https://github.com/sagemathinc/cocalc/issues/2450
    def test_2450(self, execblob):
        code = """
        t, theta = var('t, theta', domain='real')
        x(t) = cosh(t)
        z(t) = t
        formula = (x(t)*cos(theta), x(t)*sin(theta), z(t))
        parameters = ((t, -3, 3), (theta, -pi, pi))
        surface = ParametrizedSurface3D(formula, parameters)
        p = surface.plot(aspect_ratio=1, color='yellow')
        show(p, viewer='threejs', online=True)
        """
        execblob(dedent(code), want_html=False, ignore_stdout=True, file_type='sage3d')

class TestGraphics:
    def test_plot(self, execblob):
        execblob("plot(cos(x),x,0,pi)", want_html = False, file_type = 'svg')

class TestOctavePlot:
    def test_octave_plot(self,execblob):
        # assume octave kernel not running at start of test
        execblob("%octave\nx = -10:0.1:10;plot (x, sin (x));", file_type = 'png', ignore_stdout = True)

class TestRPlot:
    def test_r_smallplot(self,execblob):
        execblob("%r\nwith(mtcars,plot(wt,mpg))", file_type = 'svg')
    def test_r_bigplot(self,execblob):
        "lots of points, do not overrun blob size limit"
        code = """%r
N <- 100000
xx <- rnorm(N, 5) + 3
yy <- rnorm(N, 3) - 1
plot(xx, yy, cex=.1)"""
        execblob("%r\nwith(mtcars,plot(wt,mpg))", file_type = 'svg')

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
        json_wanted = 6
        jstep = 0
        blob_wanted = 2
        while json_wanted > 0 and blob_wanted > 0:
            typ, mesg = sagews.recv()
            assert typ == 'json' or typ == 'blob'
            if typ == 'json':
                assert mesg['id'] == test_id
                json_wanted -= 1
                jstep += 1
                if jstep == 1:
                    assert 'stdout' in mesg
                    assert 'BEFORE PLOT 0' in mesg['stdout']
                    continue
                elif jstep == 2:
                    assert 'file' in mesg
                    continue
                elif jstep == 3:
                    assert 'stdout' in mesg
                    assert 'AFTER PLOT 0' in mesg['stdout']
                    continue
                elif jstep == 4:
                    assert 'stdout' in mesg
                    assert 'BEFORE PLOT 1' in mesg['stdout']
                    continue
                elif jstep == 5:
                    assert 'file' in mesg
                    continue
                elif jstep == 6:
                    assert 'stdout' in mesg
                    assert 'AFTER PLOT 1' in mesg['stdout']
                    continue
            else:
                blob_wanted -= 1
                file_uuid = mesg[:SHA_LEN].decode()
                assert file_uuid == conftest.uuidsha1(mesg[SHA_LEN:])
                m = conftest.message.save_blob(sha1 = file_uuid)
                sagews.send_json(m)
                continue
        conftest.recv_til_done(sagews, test_id)


