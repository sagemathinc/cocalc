import sys

import zmq

from simple import SimpleStreamingSession

class zmqSession(object):
    def __init__(self, port):
        self._context = zmq.Context()
        self._port = port

        self._socket = self._context.socket(zmq.REP)
        self._socket.bind('tcp://*:%s'%port)        

        self._g = {}
        self._session = SimpleStreamingSession(0, lambda msg: self.output(msg))

    def run(self):
        while True:
            print "wait for next command on port %s"%self._port
            code = self._socket.recv()
            print "evaluate('%s')"%code
            # do work
            self._session.execute(code)

    def output(self, msg):
        self._socket.send(str(msg))
        if not msg['done']:
            print self._socket.recv() # ack

if __name__ == '__main__':
    
    if len(sys.argv) != 2:
        print "Usage: %s PORT"%sys.argv[0]
        sys.exit(1)
        
    zmqSession(int(sys.argv[1])).run()

            
            
