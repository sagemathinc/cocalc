"""
Frontend

"""

import frontend_database_sqlalchemy as db

import json, logging
from tornado import web, ioloop

class ManageHandler(web.RequestHandler):
    def get(self):
        self.render('static/sagews/desktop/manage.html')

class ManageBackendsSummaryHandler(web.RequestHandler):
    def get(self):
        s = db.session()
        count = s.query(db.Backend).count()
        self.write(json.dumps({'count':count}))

class ManageBackendsListAllHandler(web.RequestHandler):
    def get(self):
        s = db.session()
        v = [{'id':b.id, 'uri':b.uri, 'unix_user':b.unix_user}
             for b in s.query(db.Backend).all()]
        print v
        self.write(json.dumps(v))

class ManageBackendsRemoveHandler(web.RequestHandler):
    def post(self):
        id = self.get_argument('id')
        s = db.session()
        v = []
        for wl in s.query(db.WorkspaceLocation).filter(db.WorkspaceLocation.backend_id==id).all():
            s.delete(wl)
        for b in s.query(db.Backend).filter(db.Backend.id==id).all():
            s.delete(b)
            v.append(b.id)
        
        s.commit()
        r = {'status':'ok', 'deleted':v}
        self.write(json.dumps(r))

routes = [

    (r"/manage", ManageHandler),
    (r"/manage/backends/summary", ManageBackendsSummaryHandler),
    (r"/manage/backends/list_all", ManageBackendsListAllHandler),
    (r"/manage/backends/remove", ManageBackendsRemoveHandler),
    
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


