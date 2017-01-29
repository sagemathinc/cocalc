from __future__ import print_function

import os, json, socket

join = os.path.join

def cmd(s):
    print(s)
    if os.system(s):
        raise RuntimeError

def chdir():
    os.chdir(os.path.split(os.path.abspath(__file__))[0])

def base_url():
    info_file = join(os.environ['SMC'], 'info.json')
    info = json.loads(open(info_file).read())
    base_url = "/{project_id}/port/{hub_port}".format(project_id=info['project_id'], hub_port=get_ports()['hub'])
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
    ports = {'hub':0}
    for x in ports.keys():
        file = join(path, x)
        if os.path.exists(file):
            ports[x] = int(open(file).read())
        else:
            ports[x] = get_open_port()
            open(file,'w').write(str(ports[x]))
    return ports
