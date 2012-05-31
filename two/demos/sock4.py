import sys

from multiprocessing import Process, Pipe, Queue

def f(conn):
    while 1:
        x = conn.recv()
        if x == 'quit':
            break
        conn.send(eval(x))
    conn.close()

def f2(conn):
    while 1:
        x = conn.recv()
        if x == 'quit':
            break
        conn.send('')
    conn.close()

def f3(q, q2):
    while 1:
        x = q.get()
        if x == 'quit':
            q2.put('done')
            break
        q2.put(eval(x))

import time

def test(v):
    n = int(1e3)
    if v=='1':
        parent_conn, child_conn = Pipe()
        p = Process(target=f, args=(child_conn,))
        p.start()
        t = time.time()
        for i in range(n):
            parent_conn.send("3*%s"%i)
            #print parent_conn.recv()
            parent_conn.recv()
        t0 = time.time()
        parent_conn.send("quit")
    if v=='2':
        parent_conn, child_conn = Pipe()
        p = Process(target=f2, args=(child_conn,))
        p.start()
        t = time.time()
        for i in range(n):
            parent_conn.send("2323")
            parent_conn.recv()
        t0 = time.time()
        parent_conn.send("quit")

    if v=='3':
        q = Queue()
        q2 = Queue()
        p = Process(target=f3, args=(q,q2))
        p.start()
        t = time.time()
        for i in range(n):
            q.put('3*%s'%i)
            #print q2.get()
            q2.get()
        t0 = time.time()
        q.put('quit')

    print "%.1f microseconds"%((t0 - t)/n * 1e6)
    
    
    p.join()


if __name__ == '__main__':
    n = int(10000)
    v = sys.argv[1]
    test(v)
