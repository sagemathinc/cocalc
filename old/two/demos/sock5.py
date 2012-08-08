import sys, StringIO

from multiprocessing import Process, Pipe, Queue

def runloop(input, output):
    sys.displayhook = sys.__displayhook__
    while True:
        try:
            mesg = input.get()
        except KeyboardInterrupt:
            pass
        if mesg == 'quit':
            output.put([])
            return
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
        output.put(result)

class Executor(object):
    def __init__(self):
        self._input = Queue()
        self._output = Queue()
        self._p = Process(target = runloop, args=(self._input, self._output))
        self._p.start()

    def send(self, mesg):
        self._input.put(mesg)

    def recv(self):
        return self._output.get()
        
