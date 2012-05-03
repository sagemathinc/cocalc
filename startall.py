import sys, time

def startall(start_port, host="127.0.0.1"):
    try:
        import frontend
        f = frontend.Daemon(start_port+2, debug=True, log=True, host=host)
        import workspace_server
        w = workspace_server.Daemon(start_port, debug=True, log=True, host=host)
        import subprocess_server
        s = subprocess_server.Daemon(start_port+1, debug=True, log=True)
        time.sleep(1e8) # sleep "forever" (3 years)
    except KeyboardInterrupt:
        pass

if __name__ == '__main__':
    host = "127.0.0.1"
    if len(sys.argv) >= 2:
        start_port = int(sys.argv[1])
        if len(sys.argv) >= 3:
            host = sys.argv[2]
    else:
        start_port = 4998
    startall(start_port, host=host)
    
        
