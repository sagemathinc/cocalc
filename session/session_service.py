import time

import zmq

context = zmq.Context()

port = 5555

socket = context.socket(zmq.REQ)
socket.connect("tcp://localhost:%s"%port)

for request in range (1,5):
    #cmd = "import time\nfor n in range(4):\n   time.sleep(.2); print n,"
    #cmd = "print(%s*3)"%request
    print "sending on port %s: %s"%(port, cmd)
    socket.send(cmd)
    
    while True:
        try:
            #print "waiting for output..."
            message = str(socket.recv(zmq.NOBLOCK))
            print "Received reply ", request, "[", message, "]"
            if 'True' in message:
                break
            socket.send('')
        except zmq.ZMQError:
            # no activity so sleep for 1 msec
            time.sleep(0.001)
    
