import os, sys, StringIO, time, tempfile

from Queue import Empty
from multiprocessing import Process, Pipe, Queue

from tornado import web
from tornadio2 import SocketConnection, TornadioRouter, SocketServer, event
import logging


def runloop(input, output, fifo_name):
    sys.displayhook = sys.__displayhook__
    fifo = open(fifo_name,'w+')
    while True:
        try:
            mesg = input.get()
        except KeyboardInterrupt:
            pass
        if mesg == 'quit':
            output.put([])
            os._exit(0)
        code = mesg
        streams = sys.stdout, sys.stderr
        sys.stdout = StringIO.StringIO()
        sys.stderr = StringIO.StringIO()
        try:
            exec compile(code, '', 'single')
            result = [sys.stdout.getvalue(), sys.stderr.getvalue()]
        except Exception, err:
            result = ['',str(err)]
        finally:
            sys.stdout, sys.stderr = streams
        result = str(result)
        fifo.write(result+chr(0))
        fifo.flush()
        output.put(result)

class Executor(object):
    def __init__(self):
        self._input = Queue()
        self._output = Queue()
        self._fifo_name = tempfile.mktemp()
        os.mkfifo(self._fifo_name)
        self._fifo = os.open(self._fifo_name, os.O_RDONLY|os.O_NONBLOCK)
        self._p = Process(target = runloop, args=(self._input, self._output, self._fifo_name))
        self._p.start()
        self._buf = ''

    def __del__(self):
        self.send('quit')
        os.unlink(self._fifo_name)

    def recv_fifo(self):
        buf = self._buf
        while 1:
            try:
                s = os.read(self._fifo, 1)
                if s == chr(0):
                    self._buf = ''
                    return buf
                buf += s
            except OSError:
                # nothing available to read
                return None

    def send(self, mesg):
        self._input.put(mesg)

    def recv(self):
        return self._output.get()

    def recv_nowait(self):
        return self._output.get_nowait()

executor = Executor()

class ExecuteConnection(SocketConnection):
    clients = set()
    
    def on_open(self, *args, **kwargs):
        self.clients.add(self)
        print "new connection: %s"%self

    @event
    def execute(self, code):
        executor.send(code)
##         def f():
##             try:
##                 #print "trying..."
##                 output = executor.recv_nowait()
##                 self.emit('mesg', output)
##                 #print "worked"
##             except Empty:
##                 #print "will try again later"
##                 ss.io_loop.add_timeout(time.time() + .001, f)
##         ss.io_loop.add_timeout(time.time() + .001, f)

def handle_output(fd, events):
    print 'handle_output', fd, events
    print executor.recv_fifo()
        

class IndexHandler(web.RequestHandler):
    def get(self):
        self.render('index6.html')

ss = None
def run(port, address, debug):
    global ss
    logging.getLogger().setLevel(logging.DEBUG)
    router = TornadioRouter(ExecuteConnection)
    ss = SocketServer(web.Application(
                       router.apply_routes([(r"/", IndexHandler),
                                            (r"/static/(.*)", web.StaticFileHandler,
                                             {'path':'../static'}),
                                            ]),
                       socket_io_port = port,
                       socket_io_address = address, 
                       debug=debug),
              auto_start = False)

    ss.io_loop.add_handler(executor._fifo, handle_output, ss.io_loop.WRITE)
    ss.io_loop.start()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print "Usage: %s PORT [ADDRESS] [DEBUG]"%sys.argv[0]
        sys.exit(1)
    port = int(sys.argv[1])

    if len(sys.argv) >= 3:
        print sys.argv[2]
        address = sys.argv[2]
    else:
        address = '127.0.0.1'
        
    if len(sys.argv) >= 4:
        debug = eval(sys.argv[3])
    else:
        debug = True
        
    run(port, address, debug)
