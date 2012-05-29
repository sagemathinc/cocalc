import os, signal, socket, sys, StringIO

class PythonUDS(object):
    """
    Control a local Python process using Unix Domain Sockets.
    """
    def __init__(self, namespace=None, bufsize=4): # TODO: increase 4
        self._bufsize = bufsize
        self._namespace = globals() if namespace is None else namespace
        self._sp = socket.socketpair()
        p = os.fork()
        if not p:
            # child
            self._child()
        else:
            # parent
            self._child_pid = p

    def _send(self, s, mesg):
        s.send(mesg + chr(0))

    def _recv(self, s):
        buf = ''
        while 1:
            buf += s.recv(self._bufsize)
            if buf.endswith(chr(0)):
                return buf[:-1]

    def send(self, mesg):
        self._send(self._sp[0], mesg)

    def recv(self):
        return self._recv(self._sp[0])

    def __del__(self):
        self._send(self._sp[0], 'quit')
        os.kill(self._child_pid, signal.SIGTERM)
        os.wait()
    
    def _child(self):
        # runloop for child
        while 1:
            mesg = self._recv(self._sp[1])
            if mesg == 'quit':
                os._exit(0)
            buf = mesg # TODO: real message forma
            streams = sys.stdout, sys.stderr
            try:
                sys.stdout = StringIO.StringIO()
                sys.stderr = StringIO.StringIO()
                exec compile(buf, '', 'single') in self._namespace
                out = sys.stderr.getvalue() + sys.stdout.getvalue()
            except Exception, msg:
                out = str(msg)
            finally:
                sys.stdout, sys.stderr = streams
            self._send(self._sp[1], out.strip())
            
        
