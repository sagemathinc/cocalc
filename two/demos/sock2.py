import os, signal, socket, sys, StringIO, tempfile

class Python(object):
    """
    Control another Python process.

    The second process can horribly crash (e.g., segfault), and the
    controlling process will see that.
    """
    def __init__(self, namespace=None, bufsize=4): # TODO: increase 4; make small just for testing
        self._bufsize = bufsize
        self._namespace = globals() if namespace is None else namespace
        self._sp = socket.socketpair()
        self._fifo_name = tempfile.mktemp()
        self._stream = ''
        if os.path.exists(self._fifo_name):
            os.unlink(self._fifo_name)
        os.mkfifo(self._fifo_name)
        p = os.fork()
        if not p:
            # child
            self._fifo = open(self._fifo_name, 'w+')
            self._child_runloop()
        else:
            # parent
            self._child_pid = p
            self._fifo = os.open(self._fifo_name, os.O_RDONLY|os.O_NONBLOCK)

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
        buf = ''
        while 1:
            try:
                buf += os.read(self._fifo, self._bufsize)
            except OSError:
                # nothing more available to read
                return buf

    def _read_next_mesg_noblock(self):
        self._stream += self.recv()
        i = self._stream.find(chr(0))
        if i == -1:
            return None
        mesg = self._stream[:i]
        self._stream = self._stream[i+1:]
        return mesg

    def next_mesg(self, block=True):
        while 1:
            m = self._read_next_mesg_noblock()
            if not block or m is not None:
                return m

    def __del__(self):
        try:
            os.unlink(self._fifo_name)
        except:
            pass
        self._send(self._sp[0], 'quit')
        os.kill(self._child_pid, signal.SIGTERM)
        os.wait()
    
    def _child_runloop(self):
        while 1:
            mesg = self._recv(self._sp[1])
            if mesg == 'quit':
                os._exit(0)
            buf = mesg # TODO: real message format
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
                
            self._fifo.write(out.strip() + chr(0))
            self._fifo.flush()
            
        
