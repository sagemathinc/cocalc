import sys

import zmq

from simple import SimpleStreamingSession

class zmqSession(object):
    def __init__(self, sub_port, pub_port):
        self._context = zmq.Context()
        self._sub_port = sub_port
        self._pub_port = pub_port

        self._pub_socket = self._context.socket(zmq.PUB)
        self._pub_socket.bind('tcp://*:%s'%pub_port)        

        self._sub_socket = self._context.socket(zmq.SUB)
        self._sub_socket.connect('tcp://localhost:%s'%sub_port)
        self._sub_socket.setsockopt(zmq.SUBSCRIBE, '')
        
        self._g = {}
        self._session = SimpleStreamingSession(
            0, lambda msg: self.output(msg))

    def run(self):
        while True:
            print "wait for next execute command on port %s"%self._sub_port
            code = self._sub_socket.recv()
            print "evaluate('%s')"%code

            # do work
            self._session.execute(code)

    def output(self, msg):
        self._pub_socket.send(str(msg))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print "Usage: %s SUB_PORT PUB_PORT"%sys.argv[0]
        sys.exit(1)
    zmqSession(int(sys.argv[1]), int(sys.argv[2])).run()

            
            
