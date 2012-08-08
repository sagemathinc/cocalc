import os, socket, sys, StringIO

sv = socket.socketpair()

def recv(s):
    buf = ''
    while 1:
        buf += s.recv(4)
        if buf.endswith(chr(0)):
            return buf[:-1]

def send(s, msg):
    s.send(msg + chr(0))

if not os.fork():
    # child
    namespace = {}
    while 1:
        buf = recv(sv[1])
        if buf == 'quit':
            sys.exit(0)
        try:
            sys.stdout = StringIO.StringIO()
            sys.stderr = StringIO.StringIO()
            exec compile(buf, '', 'single') in namespace
            out = sys.stderr.getvalue() + sys.stdout.getvalue()
        except Exception, msg:
            out = str(msg)
        send(sv[1], out.strip())
else:
    # parent
    while 1:
        buf = raw_input("python: ")
        send(sv[0],buf)
        if buf == 'quit':
            break
        buf = recv(sv[0])
        print buf
    os.wait()
    
