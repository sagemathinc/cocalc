import zmq
context = zmq.Context()

socket = context.socket(zmq.PUB)
socket.connect ("tcp://localhost:5555")

#  Do 10 requests, waiting each time for a response
for request in range (1,10):
    print "Sending request ", request,"..."
    socket.send ("Hello")
    
    #  Get the reply.
    message = socket.recv()
    print "Received reply ", request, "[", message, "]"
