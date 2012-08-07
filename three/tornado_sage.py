"""
backend_worker -- async connections to workers
"""

import socket, struct

from tornado import ioloop, iostream

import mesg_pb2
from worker import message

class NonblockingConnectionPB(object):
    def __init__(self, hostname, port, callback=None):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM, 0)
        self._conn = iostream.IOStream(self._sock)
        self._conn.connect((hostname, port), lambda: callback(self))

    def send(self, mesg, callback=None):
        s = mesg.SerializeToString()
        length_header = struct.pack(">L", len(s))
        self._conn.write(length_header + s, callback)

    def recv(self, callback=None):
        def read_length():
            self._conn.read_bytes(4, read_mesg)
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
        read_length()
    

class SageConnection(object):
    connections = set()

    def __init__(self, hostname, port, mesg_callback, init_callback, log, **options):
        self._options = options
        self._hostname = hostname
        self._port = port
        self._init_callback = init_callback
        self._mesg_callback = mesg_callback
        self._log = log
        self._conn = NonblockingConnectionPB(hostname, port, self._start_session)

    def __repr__(self):
        return "<SageConnection pid=%s %s:%s>"%(self._pid if hasattr(self, '_pid') else '?',
                                                  self._hostname, self._port)

    def send_signal(self, signal):
        """Tell worker to send given signal to the process."""
        if hasattr(self, '_pid') and self._pid:
            NonblockingConnectionPB(self._hostname, self._port,
                    lambda C: C.send(message.send_signal(self._pid, signal)))
        
    def _listen_for_messages(self):
        self._log.info("listen for messages: %s", self)
        io = ioloop.IOLoop.instance()
        try:
            io.add_handler(self._conn._sock.fileno(), self._recv, io.READ)
        except IOError:
            # TODO: On linux for some reason sometimes the registration happens
            # multiple times for the same connection, which causes an error.
            # Ignoring the error seems to work fine. 
            pass
        self.on_open()
        if self._init_callback is not None:
            self._init_callback(self)

    def _start_session(self, conn):
        self._log.info("_start_session")
        self._conn.send(message.start_session(**self._options), self._recv_pid)
        
    def _recv_pid(self):
        self._log.info("_recv_pid")
        def set_pid(c, mesg):
            self._pid = mesg.session_description.pid
            self._log.info("set_pid = %s", self._pid)
            self._listen_for_messages()
        self._conn.recv(set_pid)

    def _recv(self, fd, events):
        self._conn.recv(lambda conn, mesg: self._mesg_callback(self, mesg))

    def send(self, mesg, callback=None):
        self._conn.send(mesg, callback)

    def close(self):
        if hasattr(self, '_conn'):
            self._log.info("killing/deleting %s", self)
            self.send_signal(9)
            io = ioloop.IOLoop.instance()
            try:
                io.remove_handler(self._conn._sock.fileno())
            except KeyError:
                pass
        try:
            self.connections.remove(self)
        except KeyError:
            pass

    def on_open(self):
        self.connections.add(self)

    def on_close(self):
        self.connections.remove(self)


