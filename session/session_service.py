import zmq

context = zmq.Context()

pub_port = 5555
sub_port = 5556

socket_pub = context.socket(zmq.PUB)
socket_pub.bind("tcp://*:%s"%pub_port)

socket_sub = context.socket(zmq.SUB)
socket_sub.connect("tcp://localhost:%s"%sub_port)
socket_sub.setsockopt(zmq.SUBSCRIBE, '')

for request in range (1,5):
    #cmd = "import time\nfor n in range(4):\n   time.sleep(1); print n"

    cmd = "print(%s*3)"%request
    print "sending on port %s: %s"%(pub_port, cmd)
    socket_pub.send(cmd)
    while True:
        print "waiting for output..."
        message = str(socket_sub.recv())
        # temporary hack
        print "Received reply ", request, "[", message, "]"
        if 'True' in message:
            break

