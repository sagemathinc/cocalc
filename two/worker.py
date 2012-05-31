"""
Backend Worker


"""

import argparse, os, simplejson, socket

import time

class SocketJSON(object):
    def __init__(self, s, bufsize=4096, sep='\0'):
        self._s = s
        self._data = ''
        self._bufsize = bufsize
        self._sep = sep

    def recv(self):
        while True:
            i = self._data.find(self._sep)
            if i == -1:
                self._data += self._s.recv(self._bufsize)
            else:
                mesg = self._data[:i]
                self._data = self._data[i+1:]
                return simplejson.loads(mesg)

    def send(self, m):
        self._s.send(simplejson.dumps(str(m))+self._sep)


class Worker(object):
    def __init__(self, socket_name):
        self._socket_name = socket_name
        self._s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        print "connecting to socket '%s'..."%socket_name  # todo -- use logging module
        self._s.connect(socket_name)
        print "connected."
        self._b = SocketJSON(s)

    def do_eval(self, expr):
        try:
            r = str(eval(expr))
            self._b.send({'status':'ok', 'result':r})
        except Exception, msg:
            self._b.send({'status':'error', 'exception':str(msg)})

    def do_exec(self, code):

    def run(self):
        data = ''
        while True:
            print "getting work from socket"

            mesg = b.recv()
            cmd = mesg['cmd']
            if cmd == 'eval':
                self.do_eval(mesg['expr'])
            elif cmd = 'exec':
                self._do_exec(mesg['code'])
                

def test_server():
    import tempfile
    #socket_name = tempfile.mktemp()
    socket_name = 'a'
    print "creating new socket '%s'"%socket_name
    
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        print "binding to socket"
        s.bind(socket_name)
        s.listen(1)
        print "listening for connection..."
        conn, addr = s.accept()
        b = SocketBuffer(conn)

        while 1:
            r = raw_input('sage: ')
            print "sending work"
            t = time.time()
            b.send(r)
            answer = b.recv()
            #print time.time() - t, len(answer)
            print "answer = '%s'"%answer

    finally:
        try:
            os.unlink(socket_name)
        except OSError:
            pass
        

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Run backend worker instance")
    parser.add_argument("-s", dest="socket_name", type=str, 
                        help="name of local unix domain socket of the backend server",
                        default='')
    parser.add_argument("-t", dest="test", action="store_const",
                        const=True, default=False, help="run a simple test server that creates a socket")
                        
    args = parser.parse_args()
    if args.test:
        test_server()
    else:
        run(args.socket_name)
    
