#!/usr/bin/env python

import os, json, socket

HERE = os.path.split(os.path.abspath(__file__))[0]
os.chdir(HERE)

if not os.path.exists('ports'):
    os.mkdir('ports')

info_file = os.path.join(os.environ['SMC'], 'info.json')
info = json.loads(open(info_file).read())

def get_open_port():    # http://stackoverflow.com/questions/2838244/get-open-tcp-port-in-python
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("",0))
    s.listen(1)
    port = s.getsockname()[1]
    s.close()
    return port

def is_port_open(port):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    return sock.connect_ex(('127.0.0.1', port)) == 0

hub_port = 0
proxy_port = 0

if os.path.exists('ports/hub'):
    hub_port = int(open('ports/hub').read())
    if not is_port_open(hub_port):
        hub_port = 0

if not hub_port:
    hub_port = get_open_port()
    open('ports/hub','w').write(str(hub_port))

hub_port = 11629
proxy_port = 11630

base_url = "/{project_id}/port/{hub_port}".format(project_id=info['project_id'], hub_port=hub_port)

hostname = socket.gethostname()

cmd = "service_hub.py --hostname={hostname} --port={hub_port} --proxy_port={proxy_port} --gap=0 --base_url={base_url} restart".format(
    hostname=hostname, base_url=base_url, hub_port=hub_port, proxy_port=proxy_port)

print cmd
if os.system(cmd):
    raise RuntimeError

print "Point your browser at\n\n    https://cloud.sagemath.com" + base_url + '\n\n'

