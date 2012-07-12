# -*- coding: utf-8 -*-
"""
    Simple sockjs-tornado chat application. By default will listen on port 8080.
"""
import sys

import tornado.ioloop
import tornado.web

import sockjs.tornado


class IndexHandler(tornado.web.RequestHandler):
    """Regular HTTP handler to serve the chatroom page"""
    def get(self):
        self.render('static/chat.html')


class ChatConnection(sockjs.tornado.SockJSConnection):
    """Chat connection implementation"""
    # Class level variable
    participants = set()

    def on_open(self, info):
        # Send that someone joined
        self.broadcast(self.participants, "Someone joined.")

        # Add client to the clients list
        self.participants.add(self)
        self.broadcast(self.participants, sys.argv[1] if len(sys.argv)>=2 else '')

    def on_message(self, message):
        # Broadcast message
        print message
        self.broadcast(self.participants, message)

    def on_close(self):
        # Remove client from the clients list and broadcast leave message
        self.participants.remove(self)

        self.broadcast(self.participants, "Someone left.")

if __name__ == "__main__":
    import logging
    logging.getLogger().setLevel(logging.DEBUG)

    # 1. Create chat router
    ChatRouter = sockjs.tornado.SockJSRouter(ChatConnection, '/backend/chat')

    # 2. Create Tornado application
    app = tornado.web.Application(
            [(r"/backend", IndexHandler)] + ChatRouter.urls,
            debug=True
    )

    # 3. Make Tornado app listen 
    if len(sys.argv) == 2:
        app.listen(int(sys.argv[1]))
    else:
        app.listen(9000)

    # 4. Start IOLoop
    tornado.ioloop.IOLoop.instance().start()
