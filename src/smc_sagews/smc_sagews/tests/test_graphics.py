# test_graphics.py
# tests of sage worksheet that return more than stdout, e.g. svg files

class TestGraphics:
    def test_plot(self, execblob):
        execblob("plot(cos(x),x,0,pi)")

class TestOctavePlot:
    def test_plot(self,execblob):
        # assume octave kernel not running at start of test
        execblob("%octave\nx = -10:0.1:10;plot (x, sin (x));")

