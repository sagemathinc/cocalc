# test_sagews_x.py
# tests of sage worksheet that return more than stdout, e.g. svg files

def test_plot(execblob):
    execblob("plot(cos(x),x,0,pi)")

###