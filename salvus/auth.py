"""
auth -- tornadoweb authenticate with Google and Facebook

This requires the file data/secrets/tornado.conf, which looks like this:

 {'cookie_secret'   : "61oxxx...",
  'facebook_api_key': "449xxx...",
  'facebook_secret' : 'e69xx...xxx6b2a5'}

NOTE: I do *NOT* want any other authentication services.  Allowing a generic
OpenID service means that anybody could just setup their own.
"""

import logging

from misc import sha1

logging.basicConfig()
log = logging.getLogger('auth')
log.setLevel(logging.INFO)

import tornado.ioloop
import tornado.web
import tornado.auth

class BaseHandler(tornado.web.RequestHandler):
    def get_current_user(self):
        return self.get_secure_cookie("user")

class LogoutHandler(BaseHandler):
    def get(self):
        self.clear_cookie('user')
        self.write('')

class UsernameHandler(BaseHandler):
    def get(self):
        self.write(str(self.current_user))

class FacebookLoginHandler(BaseHandler, tornado.auth.FacebookGraphMixin):
    @tornado.web.asynchronous
    def get(self):
        my_url = ("https://%s/tornado/auth/facebook?next=%s"%(self.request.host,
                  tornado.escape.url_escape(self.get_argument("next", "/"))))
        if self.get_argument("code", False):
            self.get_authenticated_user(
                redirect_uri=my_url,
                client_id=self.settings["facebook_api_key"],
                client_secret=self.settings["facebook_secret"],
                code=self.get_argument("code"),
                callback=self._on_auth)
            return
        self.authorize_redirect(redirect_uri=my_url,
                                client_id=self.settings["facebook_api_key"],
                                extra_params={"scope": "read_stream"})
    
    def _on_auth(self, user):
        if not user:
            raise tornado.web.HTTPError(500, "Facebook auth failed")
        #{"picture": {"data": {"url": "http://profile.ak.fbcdn.net/hprofile-ak-snc4/260840_504538681_1140148333_q.jpg", "is_silhouette": false}}, "first_name": "William", "last_name": "Stein", "name": "William Stein", "locale": "en_US", "session_expires": ["5183887"], "access_token": "AAAGYs7WBaTMBAMZBTCGx1NZCv8G7j4g12Yasz2ZBJXULWYEaQ74hNPB......f7HO6ilFDwZDZD", "link": "http://www.facebook.com/william.stein.37", "id": "5..."}         
        self.set_secure_cookie("user", tornado.escape.json_encode(user))
        self.redirect(self.get_argument("next", "/"))        
    

class GoogleLoginHandler(BaseHandler, tornado.auth.GoogleMixin):
    @tornado.web.asynchronous
    def get(self):
        log.info("google login handler")
        if self.get_argument("openid.mode", None):
            log.info("openid.mode")
            self.get_authenticated_user(self.async_callback(self._on_auth))
            log.info("called get_authenticated_user")
            return
        self.authenticate_redirect(callback_uri="https://%s/tornado/auth/google"%self.request.host)

    def _on_auth(self, user):
        log.info("_on_auth: %s"%user)
        if not user:
            raise tornado.web.HTTPError(500, "Google auth failed")
        # Save the user with, e.g., set_secure_cookie()...
        # Here's what Google returns: {'locale': u'en', 'first_name': u'William', 'last_name': u'Stein', 'name': u'William Stein', 'email': u'wstein@gmail.com'
        cookie = {'email_sha1':sha1(user['email']), 'name':user['name']}
        log.info("storing cookie %s", cookie)
        self.set_secure_cookie("user", tornado.escape.json_encode(cookie))
        self.redirect("/")
