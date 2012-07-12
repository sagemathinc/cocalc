# -*- coding: utf-8 -*-
"""
    Simple sockjs-tornado chat application. By default will listen on port 8080.
"""
import sys

import tornado.ioloop
import tornado.web

import sockjs.tornado


class Connection(sockjs.tornado.SockJSConnection):
    participants = set()

    def on_open(self, info):
        self.broadcast(self.participants, "User connected.")
        self.participants.add(self)
        self.broadcast(self.participants, sys.argv[1] if len(sys.argv)>=2 else '')

    def on_message(self, message):
        self.broadcast(self.participants, message)

    def on_close(self):
        self.participants.remove(self)
        self.broadcast(self.participants, "User disconnected.")

if __name__ == "__main__":
    import logging
    logging.getLogger().setLevel(logging.DEBUG)
    
    Router = sockjs.tornado.SockJSRouter(Connection, '/backend')
    app = tornado.web.Application(Router.urls, debug=True)
    app.listen(int(sys.argv[1]))
    tornado.ioloop.IOLoop.instance().start()
