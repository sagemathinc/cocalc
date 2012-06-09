"""
Frontend

"""

import frontend_database_sqlalchemy as db

##########################################################
# Managing backends
##########################################################

class BackendManager(object):
    def list_all(self):
        return [{'id':b.id, 'uri':b.uri, 'unix_user':b.unix_user,
                 'status':b.status,
                 'load_number':b.load_number,
                 'number_of_connected_users':b.number_of_connected_users,
                 'number_of_stored_workspaces':b.number_of_stored_workspaces,
                 'disk_usage':b.disk_usage,
                 'disk_available':b.disk_available}
                for b in db.session().query(db.Backend).all()]

    def add(self, lines):
        if lines:
            # there are lines to add
            s = db.session()
            for line in lines.splitlines():
                uri, unix_user = line.split()
                b = db.Backend()
                b.uri = uri; b.unix_user = unix_user
                s.add(b)
            try:
                s.commit()
                return {'status':'ok'}
            except Exception, mesg:
                return {'status':'error', 'mesg':str(mesg)}
        
    def start(self, id):
        try:
            s = db.session()
            b = s.query(db.Backend).filter(db.Backend.id==id).one()
            # TODO: actually do it        
            b.status = 'running'
            s.commit()
            return {'status':'ok'}
        except Exception, mesg:
            return {'status':'error', 'mesg':str(mesg)}

    def stop(self, id):
        try:
            s = db.session()
            b = s.query(db.Backend).filter(db.Backend.id==id).one()
            # TODO: actually do it        
            b.status = 'stopped'
            s.commit()
            return {'status':'ok'}
        except Exception, mesg:
            return {'status':'error', 'mesg':str(mesg)}

    def start_all(self):
        s = db.session()
        ids = [b.id for b in s.query(db.Backend).filter(db.Backend.status == 'stopped')]
        bad = []
        for id in ids:
            mesg = self.start(id)
            if mesg['status'] == 'error':
                bad.append(id)
        if bad:
            return {'status':'error', 'bad':bad}
        else:
            return {'status':'ok'}

    def stop_all(self):
        s = db.session()
        ids = [b.id for b in s.query(db.Backend).filter(db.Backend.status == 'running')]
        bad = []
        for id in ids:
            mesg = self.stop(id)
            if mesg['status'] == 'error':
                bad.append(id)
        if bad:
            return {'status':'error', 'bad':bad}
        else:
            return {'status':'ok'}

        
    def delete(self, id):
        try:
            s = db.session()
            for wl in s.query(db.WorkspaceLocation).filter(db.WorkspaceLocation.backend_id==id):
                s.delete(wl)
            for b in s.query(db.Backend).filter(db.Backend.id==id):
                s.delete(b)
            s.commit()
            return {'status':'ok'}
        except Exception, mesg:
            return {'status': 'error', 'mesg':str(mesg)}


backend_manager = BackendManager()        


##########################################################
# Web server
##########################################################

import json, logging
from tornado import web, ioloop

class ManageHandler(web.RequestHandler):
    def get(self):
        self.render('static/sagews/desktop/manage.html')

class ManageBackendsListAllHandler(web.RequestHandler):
    def get(self):
        self.write(json.dumps(backend_manager.list_all()))

class ManageBackendsAddHandler(web.RequestHandler):
    def post(self):
        self.write(json.dumps(backend_manager.add(self.get_argument('data').strip())))

class ManageBackendsDeleteHandler(web.RequestHandler):
    def post(self):
        self.write(json.dumps(backend_manager.delete(self.get_argument('id'))))

class ManageBackendsStartHandler(web.RequestHandler):
    def post(self):
        self.write(json.dumps(backend_manager.start(self.get_argument('id'))))

class ManageBackendsStopHandler(web.RequestHandler):
    def post(self):
        self.write(json.dumps(backend_manager.stop(self.get_argument('id'))))

class ManageBackendsStartAllHandler(web.RequestHandler):
    def post(self):
        self.write(json.dumps(backend_manager.start_all()))

class ManageBackendsStopAllHandler(web.RequestHandler):
    def post(self):
        self.write(json.dumps(backend_manager.stop_all()))

routes = [
    (r"/manage", ManageHandler),
    (r"/manage/backends/list_all", ManageBackendsListAllHandler),
    (r"/manage/backends/add", ManageBackendsAddHandler),    
    (r"/manage/backends/delete", ManageBackendsDeleteHandler),
    (r"/manage/backends/start", ManageBackendsStartHandler),    
    (r"/manage/backends/stop", ManageBackendsStopHandler),
    (r"/manage/backends/start_all", ManageBackendsStartAllHandler),    
    (r"/manage/backends/stop_all", ManageBackendsStopAllHandler),
    
    (r"/static/(.*)", web.StaticFileHandler, {'path':'static'})
]

def run(port, address, debug, secure):
    print "Launching frontend%s: http%s://%s:%s"%(
        ' in debug mode' if debug else ' in production mode',
        's' if secure else '',
        address if address else '*', port)

    if debug:
        logging.getLogger().setLevel(logging.DEBUG)

    if secure:  # todo
        raise NotImplementedError
    
    app = web.Application(routes, debug=debug)
    app.listen(port=port, address=address)
    ioloop.IOLoop.instance().start()

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description="Run a frontend instance")
    parser.add_argument("-p", dest='port', type=int, default=8080,
                        help="port the frontend listens on (default: 8080)")
    parser.add_argument("-a", dest="address", type=str, default="",
                        help="address the frontend listens on (default: '')")
    parser.add_argument("-d", dest="debug", action='store_const', const=True,
                        help="debug mode (default: False)", default=False)
    parser.add_argument("-s", dest="secure", action='store_const', const=True,
                        help="SSL secure mode (default: False)", default=False)
    
    args = parser.parse_args()
    run(args.port, args.address, args.debug, args.secure)


