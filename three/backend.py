from tornado import web, ioloop
from sockjs.tornado import SockJSRouter, SockJSConnection

class EchoConnection(SockJSConnection):
    def on_message(self, msg):
        self.send(msg)

if __name__ == '__main__':
    EchoRouter = SockJSRouter(EchoConnection, '/echo')

    app = web.Application(EchoRouter.urls)
    app.listen(9999)
    ioloop.IOLoop.instance().start()
