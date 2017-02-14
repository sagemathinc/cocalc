###
Passport Authentication (oauth, etc.)

LICENSE: AGPLv3

(c) 2015-2017 SageMath, Inc.
###

async   = require('async')
uuid    = require('node-uuid')
winston = require('winston')
passport= require('passport')

misc    = require('smc-util/misc')
message = require('smc-util/message')     # salvus message protocol

Cookies = require('cookies')

express_session = require('express-session')

{defaults, required} = misc

########################################
# Password hashing
########################################

password_hash_library = require('password-hash')
crypto = require('crypto')

# You can change the parameters at any time and no existing passwords
# or cookies should break.  This will only impact newly created
# passwords and cookies.  Old ones can be read just fine (with the old
# parameters).
HASH_ALGORITHM   = 'sha512'
HASH_ITERATIONS  = 1000
HASH_SALT_LENGTH = 32

# This function is private and burried inside the password-hash
# library.  To avoid having to fork/modify that library, we've just
# copied it here.  We need it for remember_me cookies.
exports.generate_hash = generate_hash = (algorithm, salt, iterations, password) ->
    iterations = iterations || 1
    hash = password
    for i in [1..iterations]
        hash = crypto.createHmac(algorithm, salt).update(hash).digest('hex')
    return algorithm + '$' + salt + '$' + iterations + '$' + hash

exports.password_hash = password_hash = (password) ->
    return password_hash_library.generate(password,
        algorithm  : HASH_ALGORITHM
        saltLength : HASH_SALT_LENGTH
        iterations : HASH_ITERATIONS   # This blocks the server for about 5-9ms.
    )

passport_login = (opts) ->
    opts = defaults opts,
        database   : required
        strategy   : required     # name of the auth strategy, e.g., 'google', 'facebook', etc.
        profile    : required     # will just get saved in database
        id         : required     # unique id given by oauth provider
        first_name : undefined
        last_name  : undefined
        full_name  : undefined
        emails     : undefined    # if user not logged in (via remember_me) already, and existing account with same email, and passport not created, then get an error instead of login or account creation.
        req        : required     # request object
        res        : required     # response object
        base_url   : ''
        host       : required
        cb         : undefined

    dbg = (m) -> winston.debug("passport_login: #{m}")
    BASE_URL = opts.base_url

    dbg(misc.to_json(opts.req.user))

    if opts.full_name? and not opts.first_name? and not opts.last_name?
        name = opts.full_name
        i = name.lastIndexOf(' ')
        if i == -1
            opts.first_name = name
            opts.last_name = name
        else
            opts.first_name = name.slice(0,i).trim()
            opts.last_name = name.slice(i).trim()
    if not opts.first_name?
        opts.first_name = "Anonymous"
    if not opts.last_name?
        opts.last_name = "User"

    if opts.emails?
        opts.emails = (x.toLowerCase() for x in opts.emails when (x? and x.toLowerCase? and misc.is_valid_email_address(x)))

    opts.id = "#{opts.id}"  # convert to string (id is often a number)

    has_valid_remember_me = false
    account_id    = undefined
    email_address = undefined
    async.series([
        (cb) ->
            dbg("check if user has a valid remember_me token, in which case we can trust who they are already")
            cookies = new Cookies(opts.req)
            value = cookies.get(BASE_URL + 'remember_me')
            if not value?
                cb()
                return
            x = value.split('$')
            if x.length != 4
                cb()
                return
            hash = generate_hash(x[0], x[1], x[2], x[3])
            opts.database.get_remember_me
                hash : hash
                cb   : (err, signed_in_mesg) ->
                    if err
                        cb(err)
                    else if signed_in_mesg?
                        account_id = signed_in_mesg.account_id
                        has_valid_remember_me = true
                        cb()
                    else
                        cb()
        (cb) ->
            dbg("check to see if the passport already exists indexed by the given id -- in that case we will log user in")
            opts.database.passport_exists
                strategy : opts.strategy
                id       : opts.id
                cb       : (err, _account_id) ->
                    if err
                        cb(err)
                    else
                        if not _account_id and has_valid_remember_me
                            dbg("passport doesn't exist, but user is authenticated (via remember_me), so we add this passport for them.")
                            opts.database.create_passport
                                account_id : account_id
                                strategy   : opts.strategy
                                id         : opts.id
                                profile    : opts.profile
                                cb         : cb
                        else
                            if has_valid_remember_me and account_id != _account_id
                                dbg("passport exists but is associated with another account already")
                                cb("Your #{opts.strategy} account is already attached to another SageMathCloud account.  First sign into that account and unlink #{opts.strategy} in account settings if you want to instead associate it with this account.")
                            else
                                if has_valid_remember_me
                                    dbg("passport already exists and is associated to the currently logged into account")
                                else
                                    dbg("passport exists and is already associated to a valid account, which we'll log user into")
                                    account_id = _account_id
                                cb()
        (cb) ->
            if account_id or not opts.emails?
                cb(); return
            dbg("passport doesn't exist and emails available, so check for existing account with a matching email -- if we find one it's an error")
            f = (email, cb) ->
                if account_id
                    dbg("already found a match with account_id=#{account_id} -- done")
                    cb()
                else
                    dbg("checking for account with email #{email}...")
                    opts.database.account_exists
                        email_address : email.toLowerCase()
                        cb            : (err, _account_id) ->
                            if account_id # already done, so ignore
                                dbg("already found a match with account_id=#{account_id} -- done")
                                cb()
                            else if err or not _account_id
                                cb(err)
                            else
                                account_id    = _account_id
                                email_address = email.toLowerCase()
                                dbg("found matching account #{account_id} for email #{email_address}")
                                cb("There is already an account with email address #{email_address}; please sign in using that email account, then link #{opts.strategy} to it in account settings.")
            async.map(opts.emails, f, cb)
        (cb) ->
            if account_id
                cb(); return
            dbg("no existing account to link, so create new account that can be accessed using this passport")
            if opts.emails?
                email_address = opts.emails[0]
            async.series([
                (cb) ->
                    opts.database.create_account
                        first_name        : opts.first_name
                        last_name         : opts.last_name
                        email_address     : email_address
                        passport_strategy : opts.strategy
                        passport_id       : opts.id
                        passport_profile  : opts.profile
                        cb                : (err, _account_id) ->
                            account_id = _account_id
                            cb(err)
                (cb) ->
                    if not email_address?
                        cb()
                    else
                        opts.database.do_account_creation_actions
                            email_address : email_address
                            account_id    : account_id
                            cb            : cb
            ], cb)
        (cb) ->
            target = BASE_URL + "/#login"

            if has_valid_remember_me
                opts.res.redirect(target)
                cb()
                return
            dbg("passport created: set remember_me cookie, so user gets logged in")
            # create and set remember_me cookie, then redirect.
            # See the remember_me method of client for the algorithm we use.
            signed_in_mesg = message.signed_in
                remember_me : true
                hub         : opts.host
                account_id  : account_id
                first_name  : opts.first_name
                last_name   : opts.last_name

            dbg("create remember_me cookie")
            session_id = uuid.v4()
            hash_session_id = password_hash(session_id)
            ttl = 24*3600*30     # 30 days
            x = hash_session_id.split('$')
            remember_me_value = [x[0], x[1], x[2], session_id].join('$')
            dbg("set remember_me cookies in client")
            expires = new Date(new Date().getTime() + ttl*1000)
            cookies = new Cookies(opts.req, opts.res)
            cookies.set(BASE_URL + 'remember_me', remember_me_value, {expires:expires})
            dbg("set remember_me cookie in database")
            opts.database.save_remember_me
                account_id : account_id
                hash       : hash_session_id
                value      : signed_in_mesg
                ttl        : ttl
                cb         : (err) ->
                    if err
                        cb(err)
                    else
                        dbg("finally redirect the client to #{target}, who should auto login")
                        opts.res.redirect(target)
                        cb()
    ], (err) ->
        if err
            opts.res.send("Error trying to login using #{opts.strategy} -- #{err}")
        opts.cb?(err)
    )

exports.init_passport = (opts) ->
    opts = defaults opts,
        router   : required
        database : required
        base_url : required
        host     : required
        cb       : required

    {router, database, base_url, host, cb} = opts
    # Initialize authentication plugins using Passport
    dbg = (m) -> winston.debug("init_passport: #{m}")
    dbg()

    # initialize use of middleware
    router.use(express_session({secret:misc.uuid()}))  # secret is totally random and per-hub session
    router.use(passport.initialize())
    router.use(passport.session())

    # Define user serialization
    passport.serializeUser (user, done) ->
        done(null, user)
    passport.deserializeUser (user, done) ->
        done(null, user)

    strategies = []   # configured strategies listed here.
    get_conf = (strategy, cb) ->
        database.get_passport_settings
            strategy : strategy
            cb       : (err, settings) ->
                if err
                    dbg("error getting passport settings for #{strategy} -- #{err}")
                    cb(err)
                else
                    if settings?
                        if strategy != 'site_conf'
                            strategies.push(strategy)
                        cb(undefined, settings)
                    else
                        dbg("WARNING: passport strategy #{strategy} not configured")
                        cb(undefined, undefined)

    # Return the configured and supported authentication strategies.
    router.get '/auth/strategies', (req, res) ->
        res.json(strategies)

    # Set the site conf like this:
    #
    #  require 'c'; db()
    #  db.set_passport_settings(strategy:'site_conf', conf:{auth:'https://cloud.sagemath.com/auth'}, cb:done())
    #
    #  or when doing development in a project  # TODO: far too brittle, especially the port/base_url stuff!
    #
    #  db.set_passport_settings(strategy:'site_conf', conf:{auth:'https://cloud.sagemath.com/project_uuid.../port/YYYYY/auth'}, cb:done())


    auth_url = undefined # gets set below

    init_local = (cb) ->
        dbg("init_local")
        # Strategy: local email address / password login
        PassportStrategy = require('passport-local').Strategy

        verify = (username, password, done) ->
            if username == 'a'
                return done(null, false, { message: 'Incorrect password.' })
            console.log("local strategy validating user #{username}")
            done(null, {username:username})

        passport.use(new PassportStrategy(verify))

        router.get '/auth/local', (req, res) ->
            res.send("""<form action="/auth/local" method="post">
                            <label>Email</label>
                            <input type="text" name="username">
                            <label>Password</label>
                            <input type="password" name="password">
                            <button type="submit" value="Log In"/>Login</button>
                        </form>""")

        router.post '/auth/local', passport.authenticate('local'), (req, res) ->
            console.log("authenticated... ")
            res.json(req.user)

        cb()

    init_google = (cb) ->
        dbg("init_google")
        # Strategy: Google OAuth 2 -- https://github.com/jaredhanson/passport-google-oauth
        #
        # NOTE: The passport-recommend library passport-google uses openid2, which
        # is deprecated in a few days!   So instead, I have to use oauth2, which
        # is in https://github.com/jaredhanson/passport-google-oauth, which I found by luck!?!
        #
        PassportStrategy = require('passport-google-oauth').OAuth2Strategy
        strategy = 'google'
        get_conf strategy, (err, conf) ->
            if err or not conf?
                cb(err)
                return
            # docs for getting these for your app
            # https://developers.google.com/accounts/docs/OpenIDConnect#appsetup
            #
            # You must then put them in the database, via
            #
            # require 'c'; db()
            # db.set_passport_settings(strategy:'google', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)
            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            winston.debug("opts=#{misc.to_json(opts)}")

            # Enabling "profile" below I think required that I explicitly go to Google Developer Console for the project,
            # then select API&Auth, then API's, then Google+, then explicitly enable it.  Otherwise, stuff just mysteriously
            # didn't work.  To figure out that this was the problem, I had to grep the source code of the passport-google-oauth
            # library and put in print statements to see what the *REAL* errors were, since that
            # library hid the errors (**WHY**!!?).
            router.get "/auth/#{strategy}", passport.authenticate(strategy, {'scope': 'openid email profile'})

            router.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    database   : database
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    first_name : profile.name.givenName
                    last_name  : profile.name.familyName
                    emails     : (x.value for x in profile.emails)
                    req        : req
                    res        : res
                    base_url   : base_url
                    host       : host

            cb()

    init_github = (cb) ->
        dbg("init_github")
        # Strategy: Github OAuth2 -- https://github.com/jaredhanson/passport-github
        PassportStrategy = require('passport-github').Strategy
        strategy = 'github'
        get_conf strategy, (err, conf) ->
            if err or not conf?
                cb(err)
                return
            # Get these here:
            #      https://github.com/settings/applications/new
            # You must then put them in the database, via
            #   db.set_passport_settings(strategy:'github', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            router.get "/auth/#{strategy}", passport.authenticate(strategy)

            router.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    database   : database
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    full_name  : profile.name or profile.displayName or profile.username
                    emails     : (x.value for x in (profile.emails ? []))
                    req        : req
                    res        : res
                    base_url   : base_url
                    host       : host
            cb()

    init_facebook = (cb) ->
        dbg("init_facebook")
        # Strategy: Facebook OAuth2 --
        PassportStrategy = require('passport-facebook').Strategy
        strategy = 'facebook'
        get_conf strategy, (err, conf) ->
            if err or not conf?
                cb(err)
                return
            # Get these by going to https://developers.facebook.com/ and creating a new application.
            # For that application, set the url to the site SMC will be served from.
            # The Facebook "App ID" and is clientID and the Facebook "App Secret" is the clientSecret
            # for oauth2, as I discovered by a lucky guess... (sigh).
            #
            # You must then put them in the database, via
            #   db.set_passport_settings(strategy:'facebook', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"
                enableProof  : false

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            router.get "/auth/#{strategy}", passport.authenticate(strategy)

            router.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    database   : database
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    full_name  : profile.displayName
                    req        : req
                    res        : res
                    base_url   : base_url
                    host       : host

            cb()

    init_dropbox = (cb) ->
        dbg("init_dropbox")
        PassportStrategy = require('passport-dropbox-oauth2').Strategy
        strategy = 'dropbox'
        get_conf strategy, (err, conf) ->
            if err or not conf?
                cb(err)
                return
            # Get these by:
            #   (1) creating a dropbox account, then going to this url: https://www.dropbox.com/developers/apps
            #   (2) make a dropbox api app that only access the datastore (not user files -- for now, since we're just doing auth!).
            #   (3) You'll see an "App key" and an "App secret".
            #   (4) Add the redirect URL on the dropbox page as well, which will be like https://cloud.sagemath.com/auth/dropbox/return
            # This might (or might not) be relevant when we support dropbox sync: https://github.com/dropbox/dropbox-js
            #
            # You must then put them in the database, via
            #   db.set_passport_settings(strategy:'dropbox', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            router.get "/auth/#{strategy}", passport.authenticate("dropbox-oauth2")

            router.get "/auth/#{strategy}/return", passport.authenticate("dropbox-oauth2", {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    database   : database
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    first_name : profile._json.name_details.familiar_name
                    last_name  : profile._json.name_details.surname
                    full_name  : profile.displayName
                    req        : req
                    res        : res
                    base_url   : base_url
                    host       : host

            cb()

    init_bitbucket = (cb) ->
        dbg("init_bitbucket")
        PassportStrategy = require('passport-bitbucket').Strategy
        strategy = 'bitbucket'
        get_conf strategy, (err, conf) ->
            if err or not conf?
                cb(err)
                return
            # Get these by:
            #      (1) make a bitbucket account
            #      (2) Go to https://bitbucket.org/account/user/[your username]/api
            #      (3) Click add consumer and enter the URL of your SMC instance.
            #
            # You must then put them in the database, via
            #   db.set_passport_settings(strategy:'bitbucket', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

            opts =
                consumerKey    : conf.clientID
                consumerSecret : conf.clientSecret
                callbackURL    : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            router.get "/auth/#{strategy}", passport.authenticate(strategy)

            router.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                #winston.debug("profile=#{misc.to_json(profile)}")
                passport_login
                    database   : database
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.username
                    first_name : profile.name.givenName
                    last_name  : profile.name.familyName
                    req        : req
                    res        : res
                    base_url   : base_url
                    host       : host

            cb()

    ###
    init_wordpress = (cb) ->
        dbg("init_wordpress")
        PassportStrategy = require('passport-wordpress').Strategy
        strategy = 'wordpress'
        get_conf strategy, (err, conf) ->
            if err or not conf?
                cb(err)
                return
            # Get these by:
            #    (1) Make a wordpress account
            #    (2) Go to https://developer.wordpress.com/apps/
            #    (3) Click "Create a New Application"
            #    (4) Fill the form as usual and eventual get the id and secret.
            #
            # You must then put them in the database, via
            #   db.set_passport_settings(strategy:'wordpress', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)
            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"
            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))
            router.get "/auth/#{strategy}", passport.authenticate(strategy)
            router.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    database   : database
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile._json.ID
                    emails     : [profile._json.email]
                    full_name  : profile.displayName
                    req        : req
                    res        : res
                    base_url   : base_url
                    host       : host
            cb()
    ###

    init_twitter = (cb) ->
        dbg("init_twitter")
        PassportStrategy = require('passport-twitter').Strategy
        strategy = 'twitter'
        get_conf strategy, (err, conf) ->
            if err or not conf?
                cb(err)
                return
            # Get these by:
            #    (1) Go to https://apps.twitter.com/ and create a new application.
            #    (2) Click on Keys and Access Tokens
            #
            # You must then put them in the database, via
            #   db.set_passport_settings(strategy:'twitter', conf:{clientID:'...',clientSecret:'...'}, cb:console.log)

            opts =
                consumerKey    : conf.clientID
                consumerSecret : conf.clientSecret
                callbackURL    : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            router.get "/auth/#{strategy}", passport.authenticate(strategy)

            router.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    database   : database
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    full_name  : profile.displayName
                    req        : req
                    res        : res
                    base_url   : base_url
                    host       : host

            cb()

    async.series([
        (cb) ->
            get_conf 'site_conf', (err, site_conf) ->
                if err
                    cb(err)
                else
                    if site_conf?
                        auth_url = site_conf.auth
                        dbg("auth_url='#{auth_url}'")
                    cb()
        (cb) ->
            if not auth_url?
                cb()
            else
                async.parallel([init_local, init_google, init_github, init_facebook,
                                init_dropbox, init_bitbucket, init_twitter], cb)
    ], (err) =>
        strategies.sort()
        strategies.unshift('email')
        cb(err)
    )





# Password checking.  opts.cb(false, true) if the
# password is correct, opts.cb(true) on error (e.g., loading from
# database), and opts.cb(false, false) if password is wrong.  You must
# specify exactly one of password_hash, account_id, or email_address.
# In case you specify password_hash, in addition to calling the
# callback (if specified), this function also returns true if the
# password is correct, and false otherwise; it can do this because
# there is no async IO when the password_hash is specified.
exports.is_password_correct = (opts) ->
    opts = defaults opts,
        database      : required
        password      : required
        password_hash : undefined
        account_id    : undefined
        email_address : undefined
        allow_empty_password : false  # If true and no password set in account, it matches anything.
                                      # this is only used when first changing the email address or password
                                      # in passport-only accounts.
        cb            : required

    if opts.password_hash?
        r = password_hash_library.verify(opts.password, opts.password_hash)
        opts.cb(undefined, r)
    else if opts.account_id? or opts.email_address?
        opts.database.get_account
            account_id    : opts.account_id
            email_address : opts.email_address
            columns       : ['password_hash']
            cb            : (error, account) ->
                if error
                    opts.cb(error)
                else
                    if opts.allow_empty_password and not account.password_hash
                        opts.cb(undefined, true)
                    else
                        opts.cb(undefined, password_hash_library.verify(opts.password, account.password_hash))
    else
        opts.cb("One of password_hash, account_id, or email_address must be specified.")


