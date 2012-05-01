import sys

from flask import Flask
app = Flask(__name__)
from flask import render_template

@app.route('/')
def demo1():
    return render_template('demo1.html')

@app.route('/client')
def client():
    return render_template('client.html')


#TODO: refactor -- this is exactly copied from frontend.py!!!!
import os, subprocess, time
from misc import get, ConnectionError
class Daemon(object):
    """
    Run workspace deamon.
    
    EXAMPLES::
    
        >>> Daemon(5000)
        Workspace Frontend Daemon on port 5000
    """
    def __init__(self, port, debug=False, pidfile=None, log=False):
        """
        EXAMPLES::

            >>> r = Daemon(5002)
            >>> type(r)
            <class 'frontend.Daemon'>
            >>> r._port
            5002
        """
        if pidfile is None:
            self._pidfile = '%s-%s.pid'%(__name__, port)
        else:
            self._pidfile = pidfile
            
        if os.path.exists(self._pidfile):
            pid = int(open(self._pidfile).read())
            try:
                os.kill(pid, 0)
                raise RuntimeError("there is already a frontend daemon running on port %s (pid=%s)"%(port, pid))
            except OSError:
                # no actual process
                pass

        self._port = port
        cmd = "python %s.py %s %s %s"%(__name__, port, debug, log)

        self._server = subprocess.Popen(cmd, shell=True)
        open(self._pidfile, 'w').write(str(self._server.pid))
        
        max_tries = 20
        while True:
            max_tries -= 1
            if max_tries == 0:
                raise RuntimeError("unable to start frontend")
            
            # TODO: here we should just check that it is a zombie
            # Next wait to see if it is listening.
            try:
                get('http://localhost:%s/'%port, timeout=10)
            except ConnectionError:
                time.sleep(0.1)
                # Ensure that the process is actually running, to
                # avoid an infinite loop trying to get from a URL
                # that will never come alive. 
                try:
                    os.kill(self._server.pid, 0)
                except OSError:
                    raise RuntimeError("unable to start frontend")
            else:
                # It is listening - done!
                break

    def __repr__(self):
        """
        EXAMPLES::

            >>> Daemon(5002).__repr__()
            'Workspace Frontend Daemon on port 5002'
        """
        return "Workspace Frontend Daemon on port %s"%self._port
        
    def __del__(self):
        """
        EXAMPLES::

            >>> import frontend, misc
            >>> R = frontend.Daemon(5002)
            >>> del R
        """
        try:
            self.kill()
        except:
            pass

    def kill(self):
        """
        Terminate the server subprocess.
        
        EXAMPLES:

            >>> r = Daemon(5000)
            >>> r.kill()
        """
        if hasattr(self, '_server'):
            self._server.kill()
            self._server.wait()
            try:
                os.kill(self._server.pid, 0)
            except OSError:
                # no such process -- safe to remove pidfile:
                if os.path.exists(self._pidfile):
                    os.unlink(self._pidfile)




if __name__ == '__main__':
    app.run(port=int(sys.argv[1]), debug=True)
