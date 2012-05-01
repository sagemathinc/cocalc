import sys, time

def startall(start_port):
    import frontend
    f = frontend.Daemon(start_port+2, debug=True, log=True)

    import workspace_server
    w = workspace_server.Daemon(start_port, debug=True, log=True)

    import subprocess_server
    s = subprocess_server.Daemon(start_port+1, debug=True, log=True)

    try:
        time.sleep(3600*24*365)
    except KeyboardInterrupt:
        pass
    finally:
        f.kill()
        w.kill()
        s.kill()

if __name__ == '__main__':
    if len(sys.argv) >= 2:
        start_port = int(sys.argv[1])
    else:
        start_port = 4998
    startall(start_port)
    
        
