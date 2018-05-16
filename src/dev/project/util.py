from __future__ import print_function

import os, json, socket

join = os.path.join

def cmd(s):
    print(s)
    if os.system(s):
        raise RuntimeError

def chdir():
    os.chdir(os.path.split(os.path.abspath(__file__))[0])

def base_url(port=None, write=True):
    print("base_url(port=%s)"%port)
    project_id = os.environ['COCALC_PROJECT_ID']
    if project_id == "":
        raise ValueError("COCALC_PROJECT_ID environment variable not found. You can only use dev/project to run CoCalc from inside of a CoCalc project.")
    if port is None and write:
        write_base_url = True
        port = get_ports()['hub']
    else:
        write_base_url = False
    base_url = "/{project_id}/port/{port}".format(project_id=project_id, port=port)
    if write_base_url:
        open("../../data/base_url",'w').write(base_url)
    return base_url

def get_open_port():    # http://stackoverflow.com/questions/2838244/get-open-tcp-port-in-python
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("",0))
    s.listen(1)
    port = s.getsockname()[1]
    s.close()
    return port

def get_ports():
    P = os.path.split(os.path.abspath(__file__))[0]
    path = join(P, 'ports')
    if not os.path.exists(path):
        os.mkdir(path)
    ports = {'hub':0, 'hub-api':0, 'hub-share':0, 'hub-share-2':0}
    for x in ports.keys():
        file = join(path, x)
        if os.path.exists(file):
            ports[x] = int(open(file).read())
        else:
            ports[x] = get_open_port()
            open(file,'w').write(str(ports[x]))
    return ports
