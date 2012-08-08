"""
IPC control of a separate clean Python process using UDS and Subprocess
"""

import os, signal, socket, subprocess, sys, StringIO, tempfile

class Fifo(object):
    def __init__(self):
        self._name = tempfile.mktemp()
        os.mkfifo(self._name)

    def open_read(self, block=True):
        if block:
            flags = os.O_RDONLY
        else:
            flags = os.O_RDONLY|os.O_NONBLOCK
        return os.open(self._name, flags)

    def open_write(self):
        return os.open(self._name, os.O_APPEND)

    def __del__(self):
        os.unlink(self._name)

class IPC(object):
    """
    Control another Python process.
    """
    def __init__(self): 
        self._sp = socket.socketpair()
        self._stdin = Fifo()
        self._stdout = Fifo()
        self._stderr = Fifo()
        # spawn subprocess
        self._child = subprocess.Popen(['python', '%s.py'%__name__],
                                       stdin=self._stdin.open_read(block=False),
                                       stdout=self._stdout.open_write(),
                                       stderr=self._stderr.open_write())

def mesg_loop():
    sys.stdout.write("hi there")
    sys.stdout.flush()
    
if __name__ == "__main__":
    # subprocess
    mesg_loop()
    
