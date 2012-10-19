"""
tornado_sage -- async connections to Sage server
"""

import socket, struct, time

from tornado import ioloop, iostream

import mesg_pb2

from sage_server import message  # todo: move sage_server message out, due to GPL and linking.

class NonblockingConnectionPB(object):
    def __init__(self, hostname, port, callback=None, timeout=5):
        """
        Make a nonblocking TCP connection to the given hostname and
        port.  If connection hasn't succeeded after timeout seconds
        call callback(self, False); otherwise, call callback(self, True).
        """
        self._timeout = ioloop.IOLoop.instance().add_timeout(time.time() + timeout, self._check_for_connection)
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM, 0)
        self._conn = iostream.IOStream(self._sock)
        self._connected = False
        self._callback = callback
        self._conn.connect((hostname, port), self._on_connect)

    def _check_for_connection(self):
        if not self._connected:
            print "FAILED CONNECTION!!"
            self._callback(self, False)
            self._conn.close()

    def _on_connect(self):
        print "Connected, removing timeout"
        ioloop.IOLoop.instance().remove_timeout(self._timeout)
        self._connected = True
        self._callback(self, True)

    def send(self, mesg, callback=None):
        s = mesg.SerializeToString()
        length_header = struct.pack(">L", len(s))  # big endian 32 bits
        self._conn.write(length_header + s, callback)

    def recv(self, length=None, callback=None):
        def read_mesg(s):
            if len(s) < 4:
                if callback is not None:
                    callback(self, None)
                return
            self._conn.read_bytes(struct.unpack('>L', s)[0], handle_mesg)
        def handle_mesg(s):
            if callback is not None:
                m = mesg_pb2.Message()
                m.ParseFromString(s)
                callback(self, m)
        if length is None:        
            self._conn.read_bytes(4, read_mesg)
        else:
            read_mesg(length)
    

class SageConnection(object):
    connections = set()

    def __init__(self, hostname, port, mesg_callback, init_callback, fail_callback, log, timeout, **options):
        self._options = options
        self._hostname = hostname
        self._port = port
        self._init_callback = init_callback
        self._fail_callback = fail_callback
        self._mesg_callback = mesg_callback
        self._log = log
        self._conn = NonblockingConnectionPB(hostname, port, callback=self._start_session, timeout=timeout)

    def __repr__(self):
        return "<SageConnection pid=%s %s:%s>"%(self._pid if hasattr(self, '_pid') else '?',
                                                  self._hostname, self._port)

    def send_signal(self, signal):
        """Tell Sage server to send given signal to the process."""
        if hasattr(self, '_pid') and self._pid:
            def f(conn, success):
                if success:
                    conn.send(message.send_signal(self._pid, signal))
            NonblockingConnectionPB(self._hostname, self._port, f)
        
    def _listen_for_messages(self):
        self._log.info("listen for messages: %s", self)
        self._conn._conn.read_bytes(4, self._recv)  # call self._recv when we receive 4 bytes of length.
        self.on_open()
        if self._init_callback is not None:
            self._init_callback(self)

    def _start_session(self, conn, success):
        self._log.info("_start_session: success=%s", success)
        if not success:
            self._fail_callback(self)
        else:
            self._conn.send(message.start_session(**self._options), self._recv_pid)
        
    def _recv_pid(self):
        self._log.info("_recv_pid")
        def set_pid(c, mesg):
            self._pid = mesg.session_description.pid
            self._log.info("set_pid = %s", self._pid)
            self._listen_for_messages()
        self._conn.recv(callback=set_pid)

    def _recv(self, length):
        self._conn.recv(length, callback=lambda conn, mesg: self._mesg_callback(self, mesg))
        self._conn._conn.read_bytes(4, self._recv)  # call self._recv again when we receive 4 bytes of length.

    def send(self, mesg, callback=None):
        self._conn.send(mesg, callback)

    def close(self):
        if hasattr(self, '_conn'):
            self._log.info("killing/deleting %s", self)
            self.send_signal(9)
            io = ioloop.IOLoop.instance()
            try:
                io.remove_handler(self._conn._sock.fileno())
            except (KeyError, socket.error):
                pass
        try:
            self.connections.remove(self)
        except KeyError:
            pass

    def on_open(self):
        self.connections.add(self)

    def on_close(self):
        self.connections.remove(self)


