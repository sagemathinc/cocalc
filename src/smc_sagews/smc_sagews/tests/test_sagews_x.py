# test_sagews_x.py
# tests of sage worksheet that return more than stdout, e.g. svg files
import socket
import conftest
import os
import re

from textwrap import dedent

def test_plot(sagews, test_id):
    SHA_LEN = 36
    code = "plot(cos(x),x,0,pi)"

    # format and send the plot command
    m = conftest.message.execute_code(code = code, id = test_id)
    m['preparse'] = True
    sagews.send_json(m)

    # send an acknowlegment of the blob to sage_server
    typ, mesg = sagews.recv()
    # when a blob is sent, the first 36 bytes are the sha1 uuid
    assert typ == 'blob'
    print("blob len %s"%len(mesg))
    file_uuid = mesg[:SHA_LEN]
    assert file_uuid == conftest.uuidsha1(mesg[SHA_LEN:])

    # sage_server expects an ack with the right uuid
    m = conftest.message.save_blob(sha1 = file_uuid)
    sagews.send_json(m)

    # first json response from sage_server has name of file
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert 'file' in mesg

    # second json response has html wrapper
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert 'html' in mesg

    # third json response has done set
    typ, mesg = sagews.recv()
    assert typ == 'json'
    assert mesg['done'] == True