
exports.init_get_apikey_page = (router) ->
    console.log("initializing /auth/get-apikey endpoint")


    router.get '/auth/get-apikey', (req, res) ->
        s = "The application blah would like to obtain your CoCalc API Key.  Please sign in to make this API key available.")
        s += """<form action="/auth/get-apikey/local" method="post">
                        <label>Email</label>
                        <input type="text" name="username">
                        <label>Password</label>
                        <input type="password" name="password">
                        <button type="submit" value="Log In"/>Login</button>
                    </form>"""
        res.send(s)

    router.post '/auth/get-apikey/local', passport.authenticate('local'), (req, res) ->
        console.log("authenticated... ")
        res.json(req.user)
