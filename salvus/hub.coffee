###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################


##############################################################################
#
# This is the Salvus Global HUB module.  It runs as a daemon, sitting in the
# middle of the action, connected to potentially thousands of clients,
# many Sage sessions, and a Cassandra database cluster.  There are
# many HUBs running on VM's all over the installation.
#
# Run this by running ./hub [options]
#
# For local debugging, run this way, since it gives better stack traces.
#
#         make_coffee && echo "require('hub').start_server()" | coffee
#
# or even this is fine:
#
#     ./hub nodaemon --port 5000 --tcp_port 5001 --keyspace devel --host localhost --database_nodes localhost
#
##############################################################################

DEBUG = false

SALVUS_HOME=process.cwd()

REQUIRE_ACCOUNT_TO_EXECUTE_CODE = false

# Anti DOS parameters:
# If a client sends a burst of messages, we space handling them out by this many milliseconds:
# (this even includes keystrokes when using the terminal)
MESG_QUEUE_INTERVAL_MS  = 0
# If a client sends a burst of messages, we discard all but the most recent this many of them:
#MESG_QUEUE_MAX_COUNT    = 25
MESG_QUEUE_MAX_COUNT    = 60
# Any messages larger than this is dropped (it could take a long time to handle, by a de-JSON'ing attack, etc.).
MESG_QUEUE_MAX_SIZE_MB  = 7

# How long to cache a positive authentication for using a project.
CACHE_PROJECT_AUTH_MS = 1000*60*15    # 15 minutes

# How long to cache believing that a project is public.   If a user
# makes their project private, this fact might be ignored for few minutes.
# However, if they make it public (from private), that is instant.
CACHE_PROJECT_PUBLIC_MS = 1000*60*15    # 15 minutes

# Blobs (e.g., files dynamically appearing as output in worksheets) are kept for this
# many seconds before being discarded.  If the worksheet is saved (e.g., by a user's autosave),
# then the BLOB is saved indefinitely.
BLOB_TTL = 60*60*24*90     # 3 months

# How frequently to register with the database that this hub is up and running, and also report
# number of connected clients
REGISTER_INTERVAL_S = 30   # every 30 seconds

# node.js -- builtin libraries
net     = require('net')
assert  = require('assert')
http    = require('http')
url     = require('url')
fs      = require('fs')
{EventEmitter} = require('events')

_       = require('underscore')

# SMC libraries
sage    = require("sage")               # sage server
misc    = require("misc")
{defaults, required} = require('misc')
message = require("message")     # salvus message protocol
cass    = require("cassandra")
cql     = require("cassandra-driver")
client_lib = require("client")
JSON_CHANNEL = client_lib.JSON_CHANNEL
{send_email} = require('email')


SALVUS_VERSION = 0
update_salvus_version = () ->
    version_file = 'node_modules/salvus_version.js'
    fs.readFile version_file, (err, data) ->
        if err
            winston.debug("update_salvus_version: WARNING: Error reading -- #{version_file}")
        else
            s = data.toString()
            i = s.indexOf('=')
            j = s.indexOf('\n')
            if i != -1 and j != -1
                SALVUS_VERSION = parseInt(s.slice(i+1,j))
            # winston.debug("SALVUS_VERSION=#{SALVUS_VERSION}")

init_salvus_version = () ->
    update_salvus_version()
    # update periodically, so we can inform users of new version without having
    # to actually restart the server.
    setInterval(update_salvus_version, 90*1000)


misc_node = require('misc_node')

to_json = misc.to_json
to_safe_str = misc.to_safe_str
from_json = misc.from_json

# third-party libraries: add any new nodejs dependencies to the NODEJS_PACKAGES list in build.py
async   = require("async")
program = require('commander')          # command line arguments -- https://github.com/visionmedia/commander.js/
daemon  = require("start-stop-daemon")  # daemonize -- https://github.com/jiem/start-stop-daemon
uuid    = require('node-uuid')

Cookies = require('cookies')            # https://github.com/jed/cookies


winston = require('winston')            # logging -- https://github.com/flatiron/winston

# Set the log level
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})


# defaults
# TEMPORARY until we flesh out the account types
DEFAULTS =
    quota        : {disk:{soft:128, hard:256}, inode:{soft:4096, hard:8192}}
    zfs_quota    : '5G'
    idle_timeout : 3600


# module scope variables:
database           = null

# the connected clients
clients            = {}

# Temporary project data directory
project_data = 'data/projects/'

fs.exists project_data, (exists) ->
    if not exists
        fs.mkdir(project_data)

PROJECT_TEMPLATE = 'conf/project_templates/default/'

###
# HTTP Server
###
formidable = require('formidable')
util = require('util')

init_express_http_server = (cb) ->

    # Create an express application
    express = require('express')
    bodyParser = require('body-parser')

    app = express()
    app.use(bodyParser.urlencoded({ extended: true }))

    # Define how the endpoints are handled

    # used for testing that this hub is working
    app.get '/alive', (req, res) ->
        if not database_is_working
            # this will stop haproxy from routing traffic to us
            # until db connection starts working again.
            winston.debug("alive: answering *NO*")
            res.status(404).end()
        else
            res.send('alive')

    # stripe invoices:  /invoice/[invoice_id].pdf
    app.get '/invoice/*', (req, res) ->
        winston.debug("/invoice/* (hub --> client): #{misc.to_json(req.query)}, #{req.path}")
        path = req.path.slice(req.path.lastIndexOf('/') + 1)
        i = path.lastIndexOf('-')
        if i != -1
            path = path.slice(i+1)
        i = path.lastIndexOf('.')
        if i == -1
            res.status(404).send("invoice must end in .pdf")
            return
        invoice_id = path.slice(0,i)
        winston.debug("id='#{invoice_id}'")

        stripe_render_invoice(invoice_id, true, res)

    # return uuid-indexed blobs (mainly used for graphics)
    app.get '/blobs/*', (req, res) ->
        #winston.debug("blob (hub --> client): #{misc.to_json(req.query)}, #{req.path}")
        if not misc.is_valid_uuid_string(req.query.uuid)
            res.status(404).send("invalid uuid=#{req.query.uuid}")
            return
        get_blob
            uuid : req.query.uuid
            cb   : (err, data) ->
                if err
                    res.status(500).send("internal error: #{err}")
                else if not data?
                    res.status(404).send("blob #{req.query.uuid} not found")
                else
                    filename = req.path.slice(req.path.lastIndexOf('/') + 1)
                    if req.query.download?
                        # tell browser to download the link as a file instead
                        # of displaying it in browser
                        res.attachment(filename)
                    else
                        res.type(filename)
                    res.send(data)

    # TODO: is this cookie trick dangerous in some surprising way?
    app.get '/cookies', (req, res) ->
        if req.query.set
            # TODO: implement expires as part of query?  not needed for now.
            expires = new Date(new Date().getTime() + 1000*24*3600*30) # one month
            cookies = new Cookies(req, res)
            cookies.set(req.query.set, req.query.value, {expires:expires})
        res.end()

    # Used to determine whether or not a token is needed for
    # the user to create an account.
    app.get '/registration', (req, res) ->
        database.key_value_store(name:'global_admin_settings').get
            key : 'account_creation_token'
            cb  : (err, token) ->
                if err or not token
                    res.json({})
                else
                    res.json({token:true})

    # Save other paths in # part of URL then redirect to the single page app.
    app.get ['/projects*', '/help', '/help/', '/settings', '/settings/'], (req, res) ->
        res.redirect(program.base_url + "/#" + req.path.slice(1))


    # Return global status information about smc
    app.get '/stats', (req, res) ->
        server_stats (err, stats) ->
            if err
                res.status(500).send("internal error: #{err}")
            else
                res.json(stats)

    app.post '/upload', (req, res) ->
        # See https://github.com/felixge/node-formidable
        # user uploaded a file
        winston.debug("User uploading a file...")
        form = new formidable.IncomingForm()
        form.parse req, (err, fields, files) ->
            if err or not files.file? or not files.file.path? or not files.file.name?
                e = "file upload failed -- #{misc.to_safe_str(err)} -- #{misc.to_safe_str(files)}"
                winston.debug(e)
                res.status(500).send(e)
                return # nothing to do -- no actual file upload requested

            account_id = undefined
            project_id = undefined
            dest_dir   = undefined
            data       = undefined
            async.series([
                # authenticate user
                (cb) ->
                    cookies = new Cookies(req, res)
                    # we prefix base_url to cookies mainly for doing development of SMC inside SMC.
                    value = cookies.get(program.base_url + 'remember_me')
                    if not value?
                        cb('you must enable remember_me cookies to upload files')
                        return
                    x    = value.split('$')
                    hash = generate_hash(x[0], x[1], x[2], x[3])
                    database.key_value_store(name: 'remember_me').get
                        key         : hash
                        consistency : cql.types.consistencies.one
                        cb          : (err, signed_in_mesg) =>
                            if err or not signed_in_mesg?
                                cb('unable to get remember_me cookie from db -- cookie invalid')
                                return
                            account_id = signed_in_mesg.account_id
                            if not account_id?
                                cb('invalid remember_me cookie')
                                return
                            winston.debug("Upload from: '#{account_id}'")
                            project_id = req.query.project_id
                            dest_dir   = req.query.dest_dir
                            if dest_dir == ""
                                dest_dir = '.'
                            winston.debug("project = #{project_id}")
                            winston.debug("dest_dir = '#{dest_dir}'")
                            cb()
                # auth user access to *write* to the project
                (cb) ->
                    user_has_write_access_to_project
                        project_id     : project_id
                        account_id     : account_id
                        cb             : (err, result) =>
                            #winston.debug("PROXY: #{project_id}, #{account_id}, #{err}, #{misc.to_json(result)}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have write access to project.")
                            else
                                winston.debug("user has write access to project.")
                                cb()
                (cb) ->
                    #winston.debug(misc.to_json(files))
                    winston.debug("Reading file from disk '#{files.file.path}'")
                    fs.readFile files.file.path, (err, _data) ->
                        if err
                            cb(err)
                        else
                            data = _data
                            cb()

                # actually send the file to the project
                (cb) ->
                    winston.debug("getting project...")
                    project = new_project(project_id)
                    path = dest_dir + '/' + files.file.name
                    winston.debug("writing file '#{path}' to project...")
                    project.write_file
                        path : path
                        data : data
                        cb   : cb

            ], (err) ->
                if err
                    winston.debug(e)
                    e = "file upload error -- #{misc.to_safe_str(err)}"
                    res.status(500).send(e)
                else
                    res.send('received upload:\n\n')
                # delete tmp file
                if files?.file?.path?
                    fs.unlink(files.file.path)
            )

    # Get the http server and return it.
    http_server = require('http').createServer(app)
    http_server.on('close', clean_up_on_shutdown)

    # init authentication via passport.
    init_passport app, (err) =>
        if err
            cb?(err)
        else
            cb?(undefined, http_server)



# Render a stripe invoice/receipt using pdfkit = http://pdfkit.org/
stripe_render_invoice = (invoice_id, download, res) ->
    invoice = undefined
    customer = undefined
    charge = undefined
    async.series([
        (cb) ->
            stripe.invoices.retrieve invoice_id, (err, x) ->
                invoice = x; cb(err)
        (cb) ->
            stripe.customers.retrieve invoice.customer, (err, x) ->
                customer = x; cb(err)
        (cb) ->
            if not invoice.paid
                cb()
            else
                stripe.charges.retrieve invoice.charge, (err, x) ->
                    charge = x; cb(err)
        (cb) ->
            render_invoice_to_pdf(invoice, customer, charge, res, download, cb)
    ], (err) ->
        if err
            res.status(404).send(err)
    )

render_invoice_to_pdf = (invoice, customer, charge, res, download, cb) ->
    PDFDocument = require('pdfkit')
    doc = new PDFDocument
    if download
        res.setHeader('Content-disposition', 'attachment')

    doc.pipe(res)

    doc.image('static/favicon-128.png', 268, 15, {width: 64, align: 'center'})
    y = 100
    c1 = 100
    if invoice.paid
        doc.fontSize(35).text('SageMath, Inc. - Receipt', c1, y)
    else
        doc.fontSize(35).text('SageMath, Inc. - Invoice', c1, y)

    y += 60
    c2 = 360
    doc.fontSize(16)
    doc.fillColor('#555')
    doc.text("Date", c1, y)
    doc.text("ID")
    doc.text("Account")
    doc.text("Email")
    if invoice.paid
        doc.text("Card charged")

    doc.fillColor('black')
    doc.text(misc.stripe_date(invoice.date), c2, y)
    doc.text(invoice.id.slice(invoice.id.length-6).toLowerCase())
    doc.text(customer.description)
    doc.text(customer.email)
    if invoice.paid
        doc.text("#{charge.source.brand} ending #{charge.source.last4}")

    y += 120
    doc.fontSize(24).text("Items", c1, y)

    y += 40
    doc.fontSize(12)
    v = []
    for x in invoice.lines.data
        v.push
            desc   : misc.trunc(x.description,60)
            amount : "USD $#{x.amount/100}"

    for i in [0...v.length]
        if i == 0
            doc.text("#{i+1}. #{v[i].desc}", c1, y)
        else
            doc.text("#{i+1}. #{v[i].desc}")
    doc.moveDown()
    if invoice.paid
        doc.text("PAID")
    else
        doc.text("DUE")

    for i in [0...v.length]
        if i == 0
            doc.text(v[i].amount, c2+90, y)
        else
            doc.text(v[i].amount)
    doc.moveDown()
    doc.text("USD $#{invoice.total/100}")

    y += 300
    doc.fontSize(14)
    doc.text("Contact us with any questions by emailing billing@sagemath.com.", c1, y)
    if not invoice.paid
        doc.moveDown()
        doc.text("To pay, sign into your account at https://cloud.sagemath.com and add a payment method in the billing tab under account settings.")
    else
        doc.text("Thank you for using https://cloud.sagemath.com.")

    doc.end()
    cb()


###
# Passport Authentication (oauth, etc.)
###

passport_login = (opts) ->
    opts = defaults opts,
        strategy   : required     # name of the auth strategy, e.g., 'google', 'facebook', etc.
        profile    : required     # will just get saved in database
        id         : required     # unique id given by oauth provider
        first_name : undefined
        last_name  : undefined
        full_name  : undefined
        emails     : undefined    # if user not logged in (via remember_me) already, and existing account with same email, and passport not created, then get an error instead of login or account creation.
        req        : required     # request object
        res        : required     # response object
        cb         : undefined

    dbg = (m) -> winston.debug("passport_login: #{m}")

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
        opts.emails = (x.toLowerCase() for x in opts.emails when (x? and x.toLowerCase? and client_lib.is_valid_email_address(x)))

    opts.id = "#{opts.id}"  # convert to string (id is often a number)

    remember_me_db = database.key_value_store(name:'remember_me')
    has_valid_remember_me = false
    account_id    = undefined
    email_address = undefined
    async.series([
        (cb) ->
            dbg("check if user has a valid remember_me token, in which case we can trust who they are already")
            cookies = new Cookies(opts.req)
            value = cookies.get(program.base_url + 'remember_me')
            if not value?
                cb()
                return
            x = value.split('$')
            if x.length != 4
                cb()
                return
            hash = generate_hash(x[0], x[1], x[2], x[3])
            remember_me_db.get
                key : hash
                cb  : (err, signed_in_mesg) ->
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
            database.passport_exists
                strategy : opts.strategy
                id       : opts.id
                cb       : (err, _account_id) ->
                    if err
                        cb(err)
                    else
                        if not _account_id and has_valid_remember_me
                            dbg("passport doesn't exist, but user is authenticated (via remember_me), so we add this passport for them.")
                            database.create_passport
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
                    database.account_exists
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
                    database.create_account
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
                        account_creation_actions
                            email_address : email_address
                            account_id    : account_id
                            cb            : cb
            ], cb)
        (cb) ->
            target = "/" + program.base_url + "#login"

            if has_valid_remember_me
                opts.res.redirect(target)
                cb()
                return
            dbg("passport created: set remember_me cookie, so user gets logged in")
            # create and set remember_me cookie, then redirect.
            # See the remember_me method of client for the algorithm we use.
            signed_in_mesg = message.signed_in
                remember_me : true
                hub         : program.host
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
            cookies.set(program.base_url + 'remember_me', remember_me_value, {expires:expires})
            dbg("set remember_me cookie in database")
            database.save_remember_me
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


init_passport = (app, cb) ->
    # Initialize authentication plugins using Passport
    passport = require('passport')
    dbg = (m) -> winston.debug("init_passport: #{m}")
    dbg()

    # initialize use of middleware
    app.use(require('express-session')({secret:misc.uuid()}))  # secret is totally random and per-hub session -- don't use it for now.
    app.use(passport.initialize())
    app.use(passport.session())

    # Define user serialization
    passport.serializeUser (user, done) ->
        done(null, user)
    passport.deserializeUser (user, done) ->
        done(null, user)

    settings = database.key_value_store(name:'passport_settings')
    strategies = []   # configured strategies listed here.
    get_conf = (strategy, cb) ->
        database.select
            table  : 'passport_settings'
            where  :
                strategy : strategy
            columns: ['conf']
            cb     : (err, results) ->
                if err
                    dbg("error getting passport conf for #{strategy} -- #{err}")
                    cb(err)
                else
                    if results.length == 0
                        dbg("WARNING: passport strategy #{strategy} not configured")
                        cb(undefined, undefined)
                    else
                        conf = results[0][0]
                        if strategy != 'site_conf' and conf?
                            strategies.push(strategy)
                        cb(undefined, conf)

    # Return the configured and supported authentication strategies.
    app.get '/auth/strategies', (req, res) ->
        res.json(strategies)

    # Set the site conf via cassandra like this:
    #    update passport_settings set conf['auth']='https://cloud.sagemath.com/auth' where strategy='site_conf';

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

        app.get '/auth/local', (req, res) ->
            res.send("""<form action="/auth/local" method="post">
                            <label>Email</label>
                            <input type="text" name="username">
                            <label>Password</label>
                            <input type="password" name="password">
                            <button type="submit" value="Log In"/>Login</button>
                        </form>""")

        app.post '/auth/local', passport.authenticate('local'), (req, res) ->
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
            #   update passport_settings set conf['clientID']='...'     where strategy='google';
            #   update passport_settings set conf['clientSecret']='...' where strategy='google';
            #
            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            # Enabling "profile" below I think required that I explicitly go to Google Developer Console for the project,
            # then select API&Auth, then API's, then Google+, then explicitly enable it.  Otherwise, stuff just mysteriously
            # didn't work.  To figure out that this was the problem, I had to grep the source code of the passport-google-oauth
            # library and put in print statements to see what the *REAL* errors were, since that
            # library hid the errors (**WHY**!!?).
            app.get "/auth/#{strategy}", passport.authenticate(strategy, {'scope': 'openid email profile'})

            app.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    first_name : profile.name.givenName
                    last_name  : profile.name.familyName
                    emails     : (x.value for x in profile.emails)
                    req        : req
                    res        : res

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
            #   update passport_settings set conf['clientID']='...'     where strategy='github';
            #   update passport_settings set conf['clientSecret']='...' where strategy='github';

            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            app.get "/auth/#{strategy}", passport.authenticate(strategy)

            app.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    full_name  : profile.name or profile.displayName or profile.username
                    emails     : (x.value for x in profile.emails)
                    req        : req
                    res        : res

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
            #   update passport_settings set conf['clientID']='...'     where strategy='facebook';
            #   update passport_settings set conf['clientSecret']='...' where strategy='facebook';

            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"
                enableProof  : false

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            app.get "/auth/#{strategy}", passport.authenticate(strategy)

            app.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    full_name  : profile.displayName
                    req        : req
                    res        : res

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
            #   update passport_settings set conf['clientID']='...'     where strategy='dropbox';
            #   update passport_settings set conf['clientSecret']='...' where strategy='dropbox';

            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            app.get "/auth/#{strategy}", passport.authenticate("dropbox-oauth2")

            app.get "/auth/#{strategy}/return", passport.authenticate("dropbox-oauth2", {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    first_name : profile._json.name_details.familiar_name
                    last_name  : profile._json.name_details.surname
                    full_name  : profile.displayName
                    req        : req
                    res        : res

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
            #   update passport_settings set conf['clientID']='...'     where strategy='bitbucket';
            #   update passport_settings set conf['clientSecret']='...' where strategy='bitbucket';

            opts =
                consumerKey    : conf.clientID
                consumerSecret : conf.clientSecret
                callbackURL    : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            app.get "/auth/#{strategy}", passport.authenticate(strategy)

            app.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                #winston.debug("profile=#{misc.to_json(profile)}")
                passport_login
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.username
                    first_name : profile.name.givenName
                    last_name  : profile.name.familyName
                    req        : req
                    res        : res

            cb()

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
            #   update passport_settings set conf['clientID']='...'     where strategy='wordpress';
            #   update passport_settings set conf['clientSecret']='...' where strategy='wordpress';

            opts =
                clientID     : conf.clientID
                clientSecret : conf.clientSecret
                callbackURL  : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            app.get "/auth/#{strategy}", passport.authenticate(strategy)

            app.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile._json.ID
                    emails     : [profile._json.email]
                    full_name  : profile.displayName
                    req        : req
                    res        : res

            cb()

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
            #   update passport_settings set conf['clientID']='...'     where strategy='twitter';
            #   update passport_settings set conf['clientSecret']='...' where strategy='twitter';

            opts =
                consumerKey    : conf.clientID
                consumerSecret : conf.clientSecret
                callbackURL    : "#{auth_url}/#{strategy}/return"

            verify = (accessToken, refreshToken, profile, done) ->
                done(undefined, {profile:profile})
            passport.use(new PassportStrategy(opts, verify))

            app.get "/auth/#{strategy}", passport.authenticate(strategy)

            app.get "/auth/#{strategy}/return", passport.authenticate(strategy, {failureRedirect: '/auth/local'}), (req, res) ->
                profile = req.user.profile
                passport_login
                    strategy   : strategy
                    profile    : profile  # will just get saved in database
                    id         : profile.id
                    full_name  : profile.displayName
                    req        : req
                    res        : res

            cb()

    async.series([
        (cb) ->
            get_conf 'site_conf', (err, site_conf) ->
                if err
                    cb(err)
                else
                    if site_conf?
                        auth_url = site_conf.auth
                        dbg("auth_url=#{auth_url}")
                    cb()
        (cb) ->
            if not auth_url?
                cb()
            else
                async.parallel([init_local, init_google, init_github, init_facebook,
                                init_dropbox, init_bitbucket, init_wordpress, init_twitter], cb)
    ], (err) =>
        strategies.sort()
        strategies.unshift('email')
        cb(err)
    )



###
# HTTP Proxy Server, which passes requests directly onto http servers running on project vm's
###

httpProxy = require('http-proxy')

init_http_proxy_server = () =>

    _remember_me_check_for_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            type        : 'write'     # 'read' or 'write'
            cb          : required    # cb(err, has_access)
        dbg = (m) -> winston.debug("_remember_me_check_for_access_to_project: #{m}")
        account_id       = undefined
        email_address    = undefined
        has_access       = false
        hash             = undefined
        async.series([
            (cb) ->
                dbg("get remember_me message")
                x    = opts.remember_me.split('$')
                hash = generate_hash(x[0], x[1], x[2], x[3])
                database.key_value_store(name: 'remember_me').get
                    key         : hash
                    consistency : cql.types.consistencies.one
                    cb          : (err, signed_in_mesg) =>
                        if err or not signed_in_mesg?
                            cb("unable to get remember_me from db -- #{err}")
                            dbg("failed to get remember_me -- #{err}")
                        else
                            account_id    = signed_in_mesg.account_id
                            email_address = signed_in_mesg.email_address
                            dbg("account_id=#{account_id}, email_address=#{email_address}")
                            cb()
            (cb) ->
                if not email_address?
                    cb(); return
                dbg("check if user is banned")
                database.is_banned_user
                    email_address : email_address
                    cb            : (err, is_banned) ->
                        if err
                            cb(err); return
                        if is_banned
                            dbg("delete this auth key, since banned users are a waste of space.")
                            @remember_me_db.delete(key : hash)
                            cb('banned')
                        else
                            cb()
            (cb) ->
                dbg("check if user has #{opts.type} access to project")
                if opts.type == 'write'
                    user_has_write_access_to_project
                        project_id : opts.project_id
                        account_id : account_id
                        cb         : (err, result) =>
                            dbg("got: #{err}, #{result}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have write access to project.")
                            else
                                has_access = true
                                cb()
                else
                    user_has_read_access_to_project
                        project_id : opts.project_id
                        account_id : account_id
                        cb         : (err, result) =>
                            dbg("got: #{err}, #{result}")
                            if err
                                cb(err)
                            else if not result
                                cb("User does not have read access to project.")
                            else
                                has_access = true
                                cb()

        ], (err) ->
            opts.cb(err, has_access)
        )

    _remember_me_cache = {}
    remember_me_check_for_access_to_project = (opts) ->
        opts = defaults opts,
            project_id  : required
            remember_me : required
            type        : 'write'
            cb          : required    # cb(err, has_access)
        key = opts.project_id + opts.remember_me + opts.type
        has_access = _remember_me_cache[key]
        if has_access?
            opts.cb(false, has_access)
            return
        # get the answer, cache it, return answer
        _remember_me_check_for_access_to_project
            project_id  : opts.project_id
            remember_me : opts.remember_me
            type        : opts.type
            cb          : (err, has_access) ->
                # if cache gets huge for some *weird* reason (should never happen under normal conditions),
                # just reset it to avoid any possibility of DOS-->RAM crash attack
                if misc.len(_remember_me_cache) >= 100000
                    _remember_me_cache = {}

                _remember_me_cache[key] = has_access
                # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                # but also if the user is suddenly granted permission to the project, this should be
                # reflected within a few seconds.
                f = () ->
                    delete _remember_me_cache[key]
                if has_access
                    setTimeout(f, 1000*60*6)    # access lasts 6 minutes (i.e., if you revoke privs to a user they could still hit the port for this long)
                else
                    setTimeout(f, 1000*60*2)    # not having access lasts 2 minute
                opts.cb(err, has_access)

    _target_cache = {}

    invalidate_target_cache = (remember_me, url) ->
        {key} = target_parse_req(remember_me, url)
        winston.debug("invalidate_target_cache: #{url}")
        delete _target_cache[key]

    target_parse_req = (remember_me, url) ->
        v          = url.split('/')
        project_id = v[1]
        type       = v[2]  # 'port' or 'raw'
        key        = remember_me + project_id + type
        if type == 'port'
            key += v[3]
            port = v[3]
        return {key:key, type:type, project_id:project_id, port_number:port}

    jupyter_server_port = (opts) ->
        opts = defaults opts,
            project_id : required   # assumed valid and that all auth already done
            cb         : required   # cb(err, port)
        new_project(opts.project_id).jupyter_port
            cb   : opts.cb

    target = (remember_me, url, cb) ->
        {key, type, project_id, port_number} = target_parse_req(remember_me, url)

        t = _target_cache[key]
        if t?
            cb(false, t)
            return

        dbg = (m) -> winston.debug("target(#{key}): #{m}")
        dbg("url=#{url}")

        tm = misc.walltime()
        host       = undefined
        port       = undefined
        async.series([
            (cb) ->
                if not remember_me?
                    # remember_me = undefined means "allow"; this is used for the websocket upgrade.
                    cb(); return

                # It's still unclear if we will ever grant read access to the raw server...
                #if type == 'raw'
                #    access_type = 'read'
                #else
                #    access_type = 'write'
                access_type = 'write'

                remember_me_check_for_access_to_project
                    project_id  : project_id
                    remember_me : remember_me
                    type        : access_type
                    cb          : (err, has_access) ->
                        dbg("finished remember_me_check_for_access_to_project (mark: #{misc.walltime(tm)}) -- #{err}")
                        if err
                            cb(err)
                        else if not has_access
                            cb("user does not have #{access_type} access to this project")
                        else
                            cb()
            (cb) ->
                if host?
                    cb()
                else
                    compute_server.project
                        project_id : project_id
                        cb         : (err, project) ->
                            dbg("first compute_server.project finished (mark: #{misc.walltime(tm)}) -- #{err}")
                            if err
                                cb(err)
                            else
                                host = project.host
                                cb()
            (cb) ->
                # determine the port
                if type == 'port'
                    if port_number == "jupyter"
                        jupyter_server_port
                            project_id : project_id
                            cb         : (err, jupyter_port) ->
                                if err
                                    cb(err)
                                else
                                    port = jupyter_port
                                    cb()
                    else
                        port = port_number
                        cb()
                else if type == 'raw'
                    compute_server.project
                        project_id : project_id
                        cb         : (err, project) ->
                            dbg("second compute_server.project finished (mark: #{misc.walltime(tm)}) -- #{err}")
                            if err
                                cb(err)
                            else
                                project.status
                                    cb : (err, status) ->
                                        dbg("project.status finished (mark: #{misc.walltime(tm)})")
                                        if err
                                            cb(err)
                                        else if not status['raw.port']?
                                            cb("raw port not available -- project might not be opened or running")
                                        else
                                            port = status['raw.port']
                                            cb()
                else
                    cb("unknown url type -- #{type}")
            ], (err) ->
                dbg("all finished (mark: #{misc.walltime(tm)}): host=#{host}; port=#{port}; type=#{type} -- #{err}")
                if err
                    cb(err)
                else
                    t = {host:host, port:port}
                    _target_cache[key] = t
                    cb(false, t)
                    # THIS IS NOW DISABLED.
                    #            Instead if the proxy errors out below, then it directly invalidates this cache
                    #            by calling invalidate_target_cache
                    # Set a ttl time bomb on this cache entry. The idea is to keep the cache not too big,
                    # but also if a new user is granted permission to the project they didn't have, or the project server
                    # is restarted, this should be reflected.  Since there are dozens (at least) of hubs,
                    # and any could cause a project restart at any time, we just timeout this info after
                    # a few minutes.  This helps enormously when there is a burst of requests.
                    #setTimeout((()->delete _target_cache[key]), 1000*60*3)
            )

    #proxy = httpProxy.createProxyServer(ws:true)
    proxy_cache = {}
    http_proxy_server = http.createServer (req, res) ->
        tm = misc.walltime()
        {query, pathname} = url.parse(req.url, true)
        req_url = req.url.slice(program.base_url.length)  # strip base_url for purposes of determining project location/permissions
        if req_url == "/alive"
            res.end('')
            return

        #buffer = httpProxy.buffer(req)  # see http://stackoverflow.com/questions/11672294/invoking-an-asynchronous-method-inside-a-middleware-in-node-http-proxy

        dbg = (m) ->
            ## for low level debugging
            if DEBUG
                winston.debug("http_proxy_server(#{req_url}): #{m}")
        dbg('got request')

        cookies = new Cookies(req, res)
        remember_me = cookies.get(program.base_url + 'remember_me')

        if not remember_me?

            # before giving an error, check on possibility that file is public
            public_raw req_url, query, res, (err, is_public) ->
                if err or not is_public
                    res.writeHead(500, {'Content-Type':'text/html'})
                    res.end("Please login to <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a> with cookies enabled, then refresh this page.")

            return

        target remember_me, req_url, (err, location) ->
            dbg("got target: #{misc.walltime(tm)}")
            if err
                public_raw req_url, query, res, (err, is_public) ->
                    if err or not is_public
                        winston.debug("proxy denied -- #{err}")
                        res.writeHead(500, {'Content-Type':'text/html'})
                        res.end("Access denied. Please login to <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a> as a user with access to this project, then refresh this page.")
            else
                t = "http://#{location.host}:#{location.port}"
                if proxy_cache[t]?
                    # we already have the proxy server for this remote location in the cache, so use it.
                    proxy = proxy_cache[t]
                    dbg("used cached proxy object: #{misc.walltime(tm)}")
                else
                    dbg("make a new proxy server connecting to this remote location")
                    proxy = httpProxy.createProxyServer(ws:false, target:t, timeout:0)
                    # and cache it.
                    proxy_cache[t] = proxy
                    dbg("created new proxy: #{misc.walltime(tm)}")
                    # setup error handler, so that if something goes wrong with this proxy (it will,
                    # e.g., on project restart), we properly invalidate it.
                    proxy.on "error", (e) ->
                        dbg("http proxy error -- #{e}")
                        delete proxy_cache[t]
                        invalidate_target_cache(remember_me, req_url)
                    #proxy.on 'proxyRes', (res) ->
                    #    dbg("(mark: #{misc.walltime(tm)}) got response from the target")

                proxy.web(req, res)

    http_proxy_server.listen(program.proxy_port, program.host)

    _ws_proxy_servers = {}
    http_proxy_server.on 'upgrade', (req, socket, head) ->
        req_url = req.url.slice(program.base_url.length)  # strip base_url for purposes of determining project location/permissions
        dbg = (m) -> winston.debug("http_proxy_server websocket(#{req_url}): #{m}")
        target undefined, req_url, (err, location) ->
            if err
                dbg("websocket upgrade error -- #{err}")
            else
                dbg("websocket upgrade success -- ws://#{location.host}:#{location.port}")
                t = "ws://#{location.host}:#{location.port}"
                proxy = _ws_proxy_servers[t]
                if not proxy?
                    dbg("websocket upgrade #{t} -- not using cache")
                    proxy = httpProxy.createProxyServer(ws:true, target:t, timeout:0)
                    proxy.on "error", (e) ->
                        dbg("websocket proxy error, so clearing cache -- #{e}")
                        delete _ws_proxy_servers[t]
                        invalidate_target_cache(undefined, req_url)
                    _ws_proxy_servers[t] = proxy
                else
                    dbg("websocket upgrade -- using cache")
                proxy.ws(req, socket, head)

    public_raw_paths_cache = {}

    public_raw = (req_url, query, res, cb) ->
        # Determine if the requested path is public (and not too big).
        # If so, send content to the client and cb(undefined, true)
        # If not, cb(undefined, false)
        # req_url = /9627b34f-fefd-44d3-88ba-5b1fc1affef1/raw/a.html
        x = req_url.split('?')
        params = x[1]
        v = x[0].split('/')
        if v[2] != 'raw'
            cb(undefined, false)
            return
        project_id = v[1]
        if not misc.is_valid_uuid_string(project_id)
            cb(undefined, false)
            return
        path = decodeURI(v.slice(3).join('/'))
        winston.debug("public_raw: project_id=#{project_id}, path=#{path}")
        public_paths = undefined
        is_public = false
        async.series([
            (cb) ->
                # Get a list of public paths in the project, or use the cached list
                # The cached list is cached for a few seconds, since a typical access
                # pattern is that the client downloads a bunch of files from the same
                # project in parallel.  On the other hand, we don't want to cache for
                # too long, since the project user may add/remove public paths at any time.
                public_paths = public_raw_paths_cache[project_id]
                if public_paths?
                    cb()
                else
                    database.get_public_paths
                        project_id : project_id
                        cb         : (err, paths) ->
                            if err
                                cb(err)
                            else
                                public_paths = public_raw_paths_cache[project_id] = paths
                                setTimeout((()=>delete public_raw_paths_cache[project_id]), 15000)  # cache for 15s
                                cb()
            (cb) ->
                #winston.debug("public_raw -- path_is_in_public_paths(#{path}, #{misc.to_json(public_paths)})")
                if not misc.path_is_in_public_paths(path, public_paths)
                    # The requested path is not public, so nothing to do.
                    cb()
                else
                    # The requested path *is* public, so we get the file
                    # from one (of the potentially many) compute servers
                    # that has the file -- (right now this is implemented
                    # via sending/receiving JSON messages and using base64
                    # encoding, but that could change).
                    compute_server.project
                        project_id : project_id
                        cb         : (err, project) ->
                            if err
                                cb(err); return
                            project.read_file
                                path    : path
                                maxsize : 40000000   # 40MB for now
                                cb      : (err, data) ->
                                    if err
                                        cb(err)
                                    else
                                        if query.download?
                                            res.setHeader('Content-disposition', 'attachment')
                                        filename = path.slice(path.lastIndexOf('/') + 1)
                                        res.write(data)
                                        res.end()
                                        is_public = true
                                        cb()
            ], (err) ->
                cb(err, is_public)
        )


#############################################################
# Client = a client that is connected via a persistent connection to the hub
#############################################################
class Client extends EventEmitter
    constructor: (@conn) ->
        @_data_handlers = {}
        @_data_handlers[JSON_CHANNEL] = @handle_json_message_from_client

        @ip_address = @conn.address.ip

        # A unique id -- can come in handy
        @id = @conn.id

        # The variable account_id is either undefined or set to the
        # account id of the user that this session has successfully
        # authenticated as.  Use @account_id to decide whether or not
        # it is safe to carry out a given action.
        @account_id = undefined

        # The persistent sessions that this client started.
        @compute_session_uuids = []

        @remember_me_db = database.key_value_store(name: 'remember_me')

        # check every few seconds
        @_next_recent_activity_interval_s = RECENT_ACTIVITY_POLL_INTERVAL_MIN_S
        setTimeout(@push_recent_activity, @_next_recent_activity_interval_s*1000)

        @install_conn_handlers()

        # Setup remember-me related cookie handling
        @cookies = {}

        c = new Cookies(@conn.request)
        @_remember_me_value = c.get(program.base_url + 'remember_me')

        @check_for_remember_me()

        # Security measure: check every 5 minutes that remember_me
        # cookie used for login is still valid.  If the cookie is gone
        # and this fails, user gets a message, and see that they must sign in.
        @_remember_me_interval = setInterval(@check_for_remember_me, 1000*60*5)

    install_conn_handlers: () =>
        #winston.debug("install_conn_handlers")
        if @_destroy_timer?
            clearTimeout(@_destroy_timer)
            delete @_destroy_timer

        @conn.on "data", (data) =>
            @_next_recent_activity_interval_s = RECENT_ACTIVITY_POLL_INTERVAL_MIN_S
            @handle_data_from_client(data)

        @conn.on "end", () =>
            # Actually destroy Client in a few minutes, unless user reconnects
            # to this session.  Often the user may have a temporary network drop,
            # and we keep everything waiting for them for short time
            # in case this happens.
            winston.debug("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  -- CLOSED; starting destroy timer")
            @_destroy_timer = setTimeout(@destroy, 1000*60*10)

        winston.debug("connection: hub <--> client(id=#{@id}, address=#{@ip_address})  ESTABLISHED")

    dbg: (desc) =>
        if DEBUG
            return (m) => winston.debug("Client(#{@id}).#{desc}: #{m}")
        else
            return (m) =>

    destroy: () =>
        winston.debug("destroy connection: hub <--> client(id=#{@id}, address=#{@ip_address})  -- CLOSED")
        clearInterval(@_remember_me_interval)
        @_next_recent_activity_interval_s = 0
        @closed = true
        @emit 'close'
        @compute_session_uuids = []
        c = clients[@conn.id]
        delete clients[@conn.id]
        if c? and c.call_callbacks?
            for id,f of c.call_callbacks
                f("connection closed")
            delete c.call_callbacks
        for h in all_local_hubs
            h.free_resources_for_client_id(@id)

    remember_me_failed: (reason) =>
        #winston.debug("client(id=#{@id}): remember_me_failed(#{reason})")
        @signed_out()  # so can't do anything with projects, etc.
        @push_to_client(message.remember_me_failed(reason:reason))

    check_for_remember_me: () =>
        value = @_remember_me_value
        if not value?
            @remember_me_failed("no remember_me cookie")
            return
        x    = value.split('$')
        if x.length != 4
            @remember_me_failed("invalid remember_me cookie")
            return
        hash = generate_hash(x[0], x[1], x[2], x[3])
        winston.debug("checking for remember_me cookie with hash='#{hash.slice(0,10)}'") # don't put all in log -- could be dangerous
        @remember_me_db.get
            key         : hash
            #consistency : cql.types.consistencies.one
            cb          : (error, signed_in_mesg) =>
                winston.debug("remember_me: got error=#{error}, signed_in_mesg=#{misc.to_json(signed_in_mesg)}")
                if error
                    @remember_me_failed("error accessing database")
                    return
                if not signed_in_mesg?
                    @remember_me_failed("remember_me deleted or expired")
                    return
                # sign them in if not already signed in
                if @account_id != signed_in_mesg.account_id
                    signed_in_mesg.hub     = program.host + ':' + program.port
                    @hash_session_id = hash
                    @signed_in(signed_in_mesg)
                    @push_to_client(signed_in_mesg)
                ###
                database.is_banned_user
                    email_address : signed_in_mesg.email_address
                    cb            : (err, is_banned) =>
                        if err
                            @remember_me_failed("error checking whether or not user is banned -- {err}")
                        else if is_banned
                            # delete this auth key, since banned users are a waste of space.
                            # TODO: probably want to log this attempt...
                            @remember_me_failed("user is banned")
                            @remember_me_db.delete(key : hash)
                        else
                            # good -- sign them in if not already
                            if @account_id != signed_in_mesg.account_id
                                signed_in_mesg.hub     = program.host + ':' + program.port
                                @hash_session_id = hash
                                @signed_in(signed_in_mesg)
                                @push_to_client(signed_in_mesg)
                ###

    #######################################################
    # Capping resource limits; client can request anything.
    # We cap what they get based on the account type, etc...
    # This functions *modifies* the limits object in place.
    #######################################################
    cap_session_limits: (limits) ->
        if @account_id?  # logged in
            misc.min_object(limits, SESSION_LIMITS)  # TODO
        else
            misc.min_object(limits, SESSION_LIMITS_NOT_LOGGED_IN)  # TODO

    #######################################################
    # Pushing messages to this particular connected client
    #######################################################
    push_to_client: (mesg, cb) =>
        if @closed
            cb?("disconnected")
            return

        if mesg.event != 'pong'
            winston.debug("hub --> client (client=#{@id}): #{misc.trunc(to_safe_str(mesg),300)}")

        # If cb *is* given and mesg.id is *not* defined, then
        # we also setup a listener for a response from the client.
        listen = cb? and not mesg.id?
        if listen
            # This message is not a response to a client request.
            # Instead, we are initiating a request to the user and we
            # want a result back (hence cb? being defined).
            mesg.id = misc.uuid()
            if not @call_callbacks?
                @call_callbacks = {}
            @call_callbacks[mesg.id] = cb
            f = () =>
                g = @call_callbacks?[mesg.id]
                if g?
                    delete @call_callbacks[mesg.id]
                    g("timed out")
            setTimeout(f, 15000) # timeout after some seconds

        @push_data_to_client(JSON_CHANNEL, to_json(mesg))
        if not listen
            cb?()
            return

    push_data_to_client: (channel, data) ->
        if @closed
            return
        #winston.debug("inside push_data_to_client(#{channel},'#{data}')")
        @conn.write(channel + data)

    error_to_client: (opts) ->
        opts = defaults opts,
            id    : undefined
            error : required
        @push_to_client(message.error(id:opts.id, error:opts.error))

    success_to_client: (opts) ->
        opts = defaults opts,
            id    : required
        @push_to_client(message.success(id:opts.id))

    # Call this method when the user has successfully signed in.
    signed_in: (signed_in_mesg) =>

        @signed_in_mesg = signed_in_mesg  # save it, since the properties are handy to have.

        # Record that this connection is authenticated as user with given uuid.
        @account_id = signed_in_mesg.account_id

        record_sign_in
            ip_address    : @ip_address
            successful    : true
            remember_me   : signed_in_mesg.remember_me    # True if sign in accomplished via rememember me token.
            email_address : signed_in_mesg.email_address
            account_id    : signed_in_mesg.account_id


    # Return the full name if user has signed in; otherwise returns undefined.
    fullname: () =>
        if @account_settings?
            return @account_settings.first_name + " " + @account_settings.last_name

    signed_out: () =>
        @account_id = undefined

    #########################################################
    # Setting and getting HTTP-only cookies via Primus + AJAX
    #########################################################
    get_cookie: (opts) ->
        opts = defaults opts,
            name : required
            cb   : required   # cb(value)
        if not @conn?.id?
            # no connection or connection died
            return
        #winston.debug("!!!!  get cookie '#{opts.name}'")
        @once("get_cookie-#{opts.name}", (value) -> opts.cb(value))
        @push_to_client(message.cookies(id:@conn.id, get:opts.name, url:program.base_url+"/cookies"))

    set_cookie: (opts) ->
        opts = defaults opts,
            name  : required
            value : required
            ttl   : undefined    # time in seconds until cookie expires
        if not @conn?.id?
            # no connection or connection died
            return

        options = {}
        if opts.ttl?
            options.expires = new Date(new Date().getTime() + 1000*opts.ttl)
        @cookies[opts.name] = {value:opts.value, options:options}
        @push_to_client(message.cookies(id:@conn.id, set:opts.name, url:program.base_url+"/cookies", value:opts.value))

    remember_me: (opts) ->
        #############################################################
        # Remember me.  There are many ways to implement
        # "remember me" functionality in a web app. Here's how
        # we do it with SMC:    We generate a random uuid,
        # which along with salt, is stored in the user's
        # browser as an httponly cookie.  We password hash the
        # random uuid and store that in our database.  When
        # the user later visits the SMC site, their browser
        # sends the cookie, which the server hashes to get the
        # key for the database table, which has corresponding
        # value the mesg needed for sign in.  We then sign the
        # user in using that message.
        #
        # The reason we use a password hash is that if
        # somebody gains access to an entry in the key:value
        # store of the database, we want to ensure that they
        # can't use that information to login.  The only way
        # they could login would be by gaining access to the
        # cookie in the user's browser.
        #
        # There is no point in signing the cookie since its
        # contents are random.
        #
        # Regarding ttl, we use 1 year.  The database will forget
        # the cookie automatically at the same time that the
        # browser invalidates it.
        #
        #############################################################

        # WARNING: The code below is somewhat replicated in
        # passport_login.

        opts = defaults opts,
            email_address : required
            account_id    : required
            cb            : undefined

        opts.hub = program.host
        opts.remember_me = true

        opts0 = misc.copy(opts)
        delete opts0.cb
        signed_in_mesg   = message.signed_in(opts0)
        session_id       = uuid.v4()
        @hash_session_id = password_hash(session_id)
        ttl              = 24*3600 * 30     # 30 days

        x = @hash_session_id.split('$')    # format:  algorithm$salt$iterations$hash
        @_remember_me_value = [x[0], x[1], x[2], session_id].join('$')
        @set_cookie
            name  : program.base_url + 'remember_me'
            value : @_remember_me_value
            ttl   : ttl

        database.save_remember_me
            account_id : opts.account_id
            hash       : @hash_session_id
            value      : signed_in_mesg
            ttl        : ttl
            cb         : opts.cb

    invalidate_remember_me: (opts) ->
        opts = defaults opts,
            cb : required

        if @hash_session_id?
            @remember_me_db.delete
                key : @hash_session_id
                cb  : opts.cb
        else
            opts.cb()

    ######################################################################
    #
    # Our realtime socket connection might only supports one connection between the client and
    # server, so we multiplex multiple channels over the same
    # connection.  There is one base channel for JSON messages called
    # JSON_CHANNEL, which themselves can be routed to different
    # callbacks, etc., by the client code.  There are 16^4-1 other
    # channels, which are for sending raw data.  The raw data messages
    # are prepended with a UTF-16 character that identifies the
    # channel.  The channel character is random (which might be more
    # secure), and there is no relation between the channels for two
    # distinct clients.
    #
    ######################################################################

    handle_data_from_client: (data) =>

        ## Only enable this when doing low level debugging -- performance impacts
        if DEBUG
            winston.debug("handle_data_from_client('#{misc.trunc(data.toString(),200)}')")

        # TODO: THIS IS A SIMPLE anti-DOS measure; it might be too
        # extreme... we shall see.  It prevents a number of attacks,
        # e.g., users storing a multi-gigabyte worksheet title,
        # etc..., which would (and will) otherwise require care with
        # every single thing we store.

        # TODO: the two size things below should be specific messages (not generic error_to_client), and
        # be sensibly handled by the client.
        if data.length >= MESG_QUEUE_MAX_SIZE_MB * 10000000
            # We don't parse it, we don't look at it, we don't know it's id.  This shouldn't ever happen -- and probably would only
            # happen because of a malicious attacker.  JSON parsing arbitrarily large strings would
            # be very dangerous, and make crashing the server way too easy.
            # We just respond with this error below.   The client should display to the user all id-less errors.
            msg = "The server ignored a huge message since it exceeded the allowed size limit of #{MESG_QUEUE_MAX_SIZE_MB}MB.  Please report what caused this if you can."
            winston.error(msg)
            @error_to_client(error:msg)
            return

        if data.length == 0
            msg = "The server ignored a message since it was empty."
            winston.error(msg)
            @error_to_client(error:msg)
            return

        if not @_handle_data_queue?
            @_handle_data_queue = []

        channel = data[0]
        h = @_data_handlers[channel]

        if not h?
            winston.error("unable to handle data on an unknown channel: '#{channel}', '#{data}'")
            # Tell the client that they had better reconnect.
            @push_to_client( message.session_reconnect(data_channel : channel) )
            return

        # The rest of the function is basically the same as "h(data.slice(1))", except that
        # it ensure that if there is a burst of messages, then (1) we handle at most 1 message
        # per client every MESG_QUEUE_INTERVAL_MS, and we drop messages if there are too many.
        # This is an anti-DOS measure.

        @_handle_data_queue.push([h, data.slice(1)])

        if @_handle_data_queue_empty_function?
            return

        # define a function to empty the queue
        @_handle_data_queue_empty_function = () =>
            if @_handle_data_queue.length == 0
                # done doing all tasks
                delete @_handle_data_queue_empty_function
                return

            # drop oldest message to keep
            if @_handle_data_queue.length > MESG_QUEUE_MAX_COUNT
                winston.debug("MESG_QUEUE_MAX_COUNT(=#{MESG_QUEUE_MAX_COUNT}) exceeded (=#{@_handle_data_queue.length}) -- drop oldest messages")
                while @_handle_data_queue.length > MESG_QUEUE_MAX_COUNT
                    @_handle_data_queue.shift()

            # get task
            task = @_handle_data_queue.shift()
            # do task
            task[0](task[1])
            # do next one in >= MESG_QUEUE_INTERVAL_MS
            setTimeout( @_handle_data_queue_empty_function, MESG_QUEUE_INTERVAL_MS )

        @_handle_data_queue_empty_function()

    register_data_handler: (h) ->
        # generate a channel character that isn't already taken -- if these get too large,
        # this will break (see, e.g., http://blog.fgribreau.com/2012/05/how-to-fix-could-not-decode-text-frame.html);
        # however, this is a counter for *each* individual user connection, so they won't get too big.
        # Ultimately, we'll redo things to use primus/websocket channel support, which should be much more powerful
        # and faster.
        if not @_last_channel?
            @_last_channel = 1
        while true
            @_last_channel += 1
            channel = String.fromCharCode(@_last_channel)
            if not @_data_handlers[channel]?
                break
        @_data_handlers[channel] = h
        return channel

    ################################################################
    # Message handling functions:
    #
    # Each function below that starts with mesg_ handles a given
    # message type (an event).  The implementations of many of the
    # handlers are somewhat long/involved, so the function below
    # immediately calls another function defined elsewhere.  This will
    # make it easier to refactor code to other modules, etc., later.
    # This approach also clarifies what exactly about this object
    # is used to implement the relevant functionality.
    ################################################################

    handle_json_message_from_client: (data) =>
        try
            mesg = from_json(data)
        catch error
            winston.error("error parsing incoming mesg (invalid JSON): #{mesg}")
            return
        #winston.debug("got message: #{data}")
        if mesg.message?.event not in ['codemirror_bcast'] and mesg.event != 'ping'
            winston.debug("hub <-- client (client=#{@id}): #{misc.trunc(to_safe_str(mesg), 120)}")

        # check for message that is coming back in response to a request from the hub
        if @call_callbacks? and mesg.id?
            f = @call_callbacks[mesg.id]
            if f?
                delete @call_callbacks[mesg.id]
                f(undefined, mesg)
                return

        handler = @["mesg_#{mesg.event}"]
        if handler?
            handler(mesg)
        else
            @push_to_client(message.error(error:"Hub does not know how to handle a '#{mesg.event}' event.", id:mesg.id))

    ######################################################
    # Plug into an existing sage session
    ######################################################
    get_sage_session: (mesg, cb) ->    # if allowed to connect cb(false, session); if not, error sent to client and cb(true)
        if not mesg.session_uuid?
            err = "Invalid message -- does not have a session_uuid field."
            @error_to_client(id:mesg.id, error:err)
            cb?(err)
            return

        # Check if we already have a TCP connection to this session.
        session = compute_sessions[mesg.session_uuid]
        if not session?
            # Make a new connection -- this will connect to correct
            # running session if the session_uuid corresponds to one.
            # If nothing is running, it will make a new session.
            session = new SageSession
                client       : @
                project_id   : mesg.project_id
                session_uuid : mesg.session_uuid
                cb           : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                        cb?(err)
                    else
                        cb?(false, session)
            return

        # Connect client to existing connection.
        if session.is_client(@)
            cb?(false, session)
        else
            # add_client *DOES* check permissions
            session.add_client @, (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                    cb?(err)
                else
                    cb?(false, session)

    ######################################################
    # ping/pong
    ######################################################
    mesg_ping: (mesg) =>
        @push_to_client(message.pong(id:mesg.id))


    ######################################################
    # Messages: Sage compute sessions and code execution
    ######################################################
    mesg_execute_code: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to execute code."))
            return
        if not mesg.session_uuid?
            stateless_sage_exec(mesg, @push_to_client)
            return

        @get_sage_session mesg, (err, session) =>
            if err
                return
            else
                session.send_json(@, mesg)

    mesg_start_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return

        switch mesg.type
            when 'sage'
                # This also saves itself to persistent_sage_sessions and compute_sessions global dicts...
                session = new SageSession
                    client     : @
                    project_id : mesg.project_id
                    cb         : (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            winston.debug("sending #{misc.to_json(message.session_started(id:mesg.id, session_uuid:session.session_uuid))}")
                            @push_to_client(message.session_started(id:mesg.id, session_uuid:session.session_uuid))
            when 'console'
                @connect_to_console_session(mesg)
            else
                @error_to_client(id:mesg.id, error:"Unknown message type '#{mesg.type}'")

    mesg_connect_to_session: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to start a session."))
            return
        switch mesg.type
            when 'sage'
                # Getting the session with given mesg.session_uuid
                # adds this client to the session, if this client has
                # appropriate permissions.
                @get_sage_session mesg, (err, session) =>
                    if not err
                        @push_to_client(message.session_connected(id:mesg.id, session_uuid:mesg.session_uuid))
            when 'console'
                @connect_to_console_session(mesg)
            else
                # TODO
                @push_to_client(message.error(id:mesg.id, error:"Connecting to session of type '#{mesg.type}' not yet implemented"))

    connect_to_console_session: (mesg) =>
        # TODO -- implement read-only console sessions too (easy and amazing).
        @get_project mesg, 'write', (err, project) =>
            if not err  # get_project sends error to client
                project.console_session
                    client       : @
                    params       : mesg.params
                    session_uuid : mesg.session_uuid
                    cb           : (err, connect_mesg) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            connect_mesg.id = mesg.id
                            @push_to_client(connect_mesg)

    mesg_send_signal: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to send a signal."))
            return
        @get_sage_session mesg, (err, session) =>
            if err
                return
            else
                session.send_signal(mesg.signal)

    mesg_restart_session: (mesg) =>
        @get_sage_session mesg, (err, session) =>
            if err
                return
            session.restart  @, mesg, (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_terminate_session: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if not err  # get_project sends error to client
                project.terminate_session
                    session_uuid : mesg.session_uuid
                    cb           : (err, resp) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(mesg)  # same message back.

    ######################################################
    # Message: introspections
    #   - completions of an identifier / methods on an object (may result in code evaluation)
    #   - docstring of function/object
    #   - source code of function/class
    ######################################################
    mesg_introspect: (mesg) =>
        if REQUIRE_ACCOUNT_TO_EXECUTE_CODE and not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to send a signal."))
            return
        @get_sage_session mesg, (err, session) =>
            if err
                return
            else
                session.send_json(@, mesg)

    ######################################################
    # Messages: Account creation, sign in, sign out
    ######################################################
    mesg_create_account: (mesg) =>
        create_account(@, mesg)

    mesg_sign_in: (mesg) => sign_in(@,mesg)

    mesg_sign_out: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"Not signed in."))
            return

        if mesg.everywhere
            # invalidate all remeber_me cookies
            database.invalidate_all_remember_me
                account_id : @account_id
        @signed_out()  # deletes @account_id... so must be below database call above
        # invalidate the remember_me on this browser
        @invalidate_remember_me
            cb:(error) =>
                winston.debug("signing out: #{mesg.id}, #{error}")
                if not error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.signed_out(id:mesg.id))

    ######################################################
    # Messages: Password/email address management
    ######################################################
    mesg_password_reset: (mesg) =>
        password_reset(mesg, @ip_address, @push_to_client)

    mesg_change_password: (mesg) =>
        change_password(mesg, @ip_address, @push_to_client)

    mesg_forgot_password: (mesg) =>
        forgot_password(mesg, @ip_address, @push_to_client)

    mesg_reset_forgot_password: (mesg) =>
        reset_forgot_password(mesg, @ip_address, @push_to_client)

    mesg_change_email_address: (mesg) =>
        change_email_address(mesg, @ip_address, @push_to_client)

    mesg_unlink_passport: (mesg) =>
        if not @account_id
            @error_to_client(id:mesg.id, error:"must be logged in")
        else
            database.delete_passport
                account_id : @account_id
                strategy   : mesg.strategy
                id         : mesg.id
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @success_to_client(id:mesg.id)

    ######################################################
    # Messages: Account settings
    ######################################################
    mesg_get_account_settings: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"not yet signed in"))
        else if @account_id != mesg.account_id
            @push_to_client(message.error(id:mesg.id, error:"not signed in as user with id #{mesg.account_id}."))
        else
            if @get_account_settings_lock?
                # there is a bug in the client that is causing a burst of these messages
                winston.debug("ignoring too many account_settings request")
                #@push_to_client(message.error(id:mesg.id, error:"too many requests"))
                return

            @get_account_settings_lock = true
            f = () =>
                delete @get_account_settings_lock
            setTimeout(f, 2000)

            database.get_account
                account_id : @account_id
                cb : (err, data) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        # delete password hash -- user doesn't want/need to see/know that.
                        delete data['password_hash']

                        # Set defaults for unset keys.  We do this so that in the
                        # long run it will always be easy to migrate the database
                        # forward (with new columns).
                        for key, val of message.account_settings_defaults
                            if not data[key]?
                                data[key] = val

                        # Cache the groups of this user, so we don't have to look
                        # them up for other permissions.  Caveat: user may have to refresh
                        # their browser to update group membership, in case their
                        # groups change.  If this is an issue, make this property get
                        # deleted automatically.
                        @groups = data.groups
                        @account_settings = data

                        # Send account settings back to user.
                        data.id = mesg.id
                        @push_to_client(message.account_settings(data))

    get_groups: (cb) =>
        # see note above about our "infinite caching".  Maybe a bad idea.
        if @groups?
            cb(undefined, @groups)
            return
        database.get_account
            columns    : ['groups']
            account_id : @account_id
            cb         : (err, r) =>
                if err
                    cb(err)
                else
                    @groups = r['groups']
                    cb(undefined, @groups)

    mesg_account_settings: (mesg) =>
        if @account_id != mesg.account_id
            @push_to_client(message.error(id:mesg.id, error:"Not signed in as user with id #{mesg.account_id}."))
        else
            save_account_settings(mesg, @push_to_client)

    ######################################################
    # Messages: Saving/loading scratch worksheet
    ######################################################
    mesg_save_scratch_worksheet: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to save the scratch worksheet to the server."))
            return

        database.uuid_value_store(name:"scratch_worksheets").set
            uuid  : @account_id
            value : mesg.data
            cb    : (error, result) =>
                if error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_load_scratch_worksheet: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to load the scratch worksheet from the server."))
            return
        database.uuid_value_store(name:"scratch_worksheets").get
            uuid : @account_id
            cb   : (error, data) =>
                if error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.scratch_worksheet_loaded(id:mesg.id, data:data))

    mesg_delete_scratch_worksheet: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"You must be signed in to delete your scratch worksheet from the server."))
            return
        database.uuid_value_store(name:"scratch_worksheets").delete
            uuid : @account_id
            cb   : (error, data) =>
                if error
                    @push_to_client(message.error(id:mesg.id, error:error))
                else
                    @push_to_client(message.success(id:mesg.id))

    ######################################################
    # Messages: Client feedback
    ######################################################
    mesg_report_feedback: (mesg) =>
        report_feedback(mesg, @push_to_client, @account_id)

    mesg_get_all_feedback_from_user: (mesg) =>
        get_all_feedback_from_user(mesg, @push_to_client, @account_id)

    mesg_log_client_error: (mesg) =>
        winston.debug("log_client_error: #{misc.to_json(mesg.error)}")
        now = cass.now()
        if not mesg.type?
            mesg.type = "error"
        database.update
            table : 'client_error_log'
            where :
                type       : mesg.type
                timestamp  : now
            set   :
                error      : mesg.error
                account_id : @account_id
            json : ['error']

    ######################################################
    # Messages: Project Management
    ######################################################

    # Either call the callback with the project, or if an error err
    # occured, call @error_to_client(id:mesg.id, error:err) and *NEVER*
    # call the callback.  This function is meant to be used in a bunch
    # of the functions below for handling requests.
    get_project: (mesg, permission, cb) =>
        # mesg -- must have project_id field
        # permission -- must be "read" or "write"
        # cb(err, project)
        #   *NOTE*:  on failure, if mesg.id is defined, then client will receive an error message; the function
        #            calling get_project does *NOT* have to send the error message back to the client!
        dbg = (m) -> winston.debug("get_project(client=#{@id}, #{mesg.project_id}): #{m}")

        err = undefined
        if not mesg.project_id?
            err = "mesg must have project_id attribute -- #{to_safe_str(mesg)}"
        else if not @account_id?
            err = "user must be signed in before accessing projects"

        if err
            if mesg.id?
                @error_to_client(id:mesg.id, error:err)
            cb(err)
            return

        key = mesg.project_id + permission
        project = @_project_cache?[key]
        if project?
            # Use the cached project so we don't have to re-verify authentication
            # for the user again below, which
            # is very expensive.  This cache does expire, in case user
            # is kicked out of the project.
            cb(undefined, project)
            project.local_hub.update_host()
            return

        dbg()
        async.series([
            (cb) =>
                switch permission
                    when 'read'
                        user_has_read_access_to_project
                            project_id     : mesg.project_id
                            account_id     : @account_id
                            account_groups : @groups
                            cb             : (err, result) =>
                                if err
                                    cb("Internal error determining user permission -- #{err}")
                                else if not result
                                    cb("User #{@account_id} does not have read access to project #{mesg.project_id}")
                                else
                                    # good to go
                                    cb()
                    when 'write'
                        user_has_write_access_to_project
                            project_id     : mesg.project_id
                            account_groups : @groups
                            account_id     : @account_id
                            cb             : (err, result) =>
                                if err
                                    cb("Internal error determining user permission -- #{err}")
                                else if not result
                                    cb("User #{@account_id} does not have write access to project #{mesg.project_id}")
                                else
                                    # good to go
                                    cb()
                    else
                        cb("Internal error -- unknown permission type '#{permission}'")
        ], (err) =>
            if err
                if mesg.id?
                    @error_to_client(id:mesg.id, error:err)
                dbg("error -- #{err}")
                cb(err)
            else
                project = new_project(mesg.project_id)
                database.touch_project(project_id:mesg.project_id)
                if not @_project_cache?
                    @_project_cache = {}
                @_project_cache[key] = project
                # cache for a while
                setTimeout((()=>delete @_project_cache[key]), CACHE_PROJECT_AUTH_MS)
                dbg("got project; caching and returning")
                cb(undefined, project)
        )

    # Mark a project as "deleted" in the database.  This is non-destructive by design --
    # as is almost everything in SMC.  Projects cannot be permanently deleted.
    mesg_delete_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to delete a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return # error handled in get_project
            project.delete_project
                cb : (err, ok) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_undelete_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to undelete a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return # error handled in get_project
            project.undelete_project
                cb : (err, ok) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_hide_project_from_user: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "you must be signed in to hide a project")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            async.series([
                (cb) =>
                    if mesg.account_id? and mesg.account_id != @account_id
                        # trying to hide project from another user -- @account_id must be owner of project
                        user_owns_project
                            project_id : mesg.project_id
                            account_id : @account_id
                            cb         : (err, is_owner) =>
                                if err
                                    cb(err)
                                else if not is_owner
                                    cb("only the owner of a project may hide it from collaborators")
                                else
                                    cb()
                    else
                        mesg.account_id = @account_id
                        cb()
                (cb) =>
                    project.hide_project_from_user
                        account_id : mesg.account_id
                        cb         : cb
            ], (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))
            )

    mesg_unhide_project_from_user: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "you must be signed in to unhide a project")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            async.series([
                (cb) =>
                    if mesg.account_id? and mesg.account_id != @account_id
                        # trying to unhide project from another user -- @account_id must be owner of project
                        user_owns_project
                            project_id : mesg.project_id
                            account_id : @account_id
                            cb         : (err, is_owner) =>
                                if err
                                    cb(err)
                                else if not is_owner
                                    cb("only the owner of a project may unhide it from collaborators")
                                else
                                    cb()
                    else
                        mesg.account_id = @account_id
                        cb()
                (cb) =>
                    project.unhide_project_from_user
                        account_id : mesg.account_id
                        cb         : cb
            ], (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))
            )

    mesg_move_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to move a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return # error handled in get_project
            project.move_project
                target : mesg.target
                cb : (err, location) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.project_moved(id:mesg.id, location:location))

    mesg_create_project: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to create a new project.")
            return

        dbg = (m) -> winston.debug("mesg_create_project(#{misc.to_json(mesg)}): #{m}")

        project_id = uuid.v4()
        project    = undefined
        location   = undefined

        async.series([
            (cb) =>
                dbg("create project entry in database")
                database.create_project
                    project_id  : project_id
                    account_id  : @account_id
                    title       : mesg.title
                    description : mesg.description
                    public      : mesg.public
                    cb          : cb
            (cb) =>
                dbg("start project opening so that when user tries to open it in a moment it opens more quickly")
                hub = new_local_hub(project_id)
                hub.local_hub_socket (err, socket) =>
                    if err
                        dbg("failed to open socket -- #{err}")
                    else
                        dbg("opened socket")
                cb() # don't wait for socket to open!
        ], (err) =>
            if err
                dbg("error; project #{project_id} -- #{err}")
                @error_to_client(id: mesg.id, error: "Failed to create new project '#{mesg.title}' -- #{misc.to_json(err)}")
            else
                dbg("SUCCESS: project #{project_id}")
                @push_to_client(message.project_created(id:mesg.id, project_id:project_id))
                push_to_clients  # push a message to all other clients logged in as this user.
                    where : {account_id:@account_id,  exclude: [@conn.id]}
                    mesg  : message.project_list_updated()
                # As an optimization, we start the process of opening the project, since the user is likely
                # to open the project soon anyways.
                dbg("start process of opening project")
                @get_project {project_id:project_id}, 'write', (err, project) =>
        )



    mesg_get_projects: (mesg) =>
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must sign in.")
            return

        database.get_projects_with_user
            account_id : @account_id
            hidden     : mesg.hidden
            cb         : (error, projects) =>
                if error
                    @error_to_client(id: mesg.id, error: "There was a problem getting your projects (please try again) -- #{misc.to_json(error)}")
                else
                    # sort them by last_edited (something db doesn't do)
                    projects.sort((a,b) -> if a.last_edited < b.last_edited then +1 else -1)
                    @push_to_client(message.all_projects(id:mesg.id, projects:projects))

    mesg_get_project_info: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                process = (info) =>
                    if info.hide_from_accounts?
                        info.hidden = @account_id in info.hide_from_accounts
                        delete info.hide_from_accounts
                    info.public_access = false
                    return info

                project.get_info (err, info) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        if not info.location
                            # This is what would happen if the project were shelved after being created;
                            # suddenly the location would be null, even though in some hubs the Project
                            # instance would exist.  In this case, we need to recreate the project, which
                            # will deploy it somewhere.
                            delete _project_cache[project.project_id]
                            @get_project mesg, 'read', (err, project) =>
                                # give it this one try only this time.
                                project.get_info (err, info) =>
                                    if err
                                        @error_to_client(id:mesg.id, error:err)
                                    else
                                        @push_to_client(message.project_info(id:mesg.id, info:process(info)))
                        else
                            @push_to_client(message.project_info(id:mesg.id, info:process(info)))

    mesg_project_session_info: (mesg) =>
        assert mesg.event == 'project_session_info'
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                project.call
                    mesg : mesg
                    cb   : (err, info) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.project_session_info(id:mesg.id, info:info))

    mesg_project_status: (mesg) =>
        winston.debug("mesg_project_status")
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                project.local_hub.status (err, status) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        if status?
                            delete status.secret_token
                            @push_to_client(message.project_status(id:mesg.id, status:status))


    mesg_project_get_state: (mesg) =>
        winston.debug("mesg_project_get_state")
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            else
                project.local_hub.state (err, state) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                            @push_to_client(message.project_get_state(id:mesg.id, state:state))

    mesg_update_project_data: (mesg) =>
        winston.debug("mesg_update_project_data")
        if not @account_id?
            @error_to_client(id: mesg.id, error: "You must be signed in to set data about a project.")
            return

        user_has_write_access_to_project
            project_id     : mesg.project_id
            account_id     : @account_id
            account_groups : @groups
            cb: (error, ok) =>
                winston.debug("mesg_update_project_data -- cb")
                if error
                    @error_to_client(id:mesg.id, error:error)
                    return
                else if not ok
                    @error_to_client(id:mesg.id, error:"You do not own the project with id #{mesg.project_id}.")
                else
                    # sanatize the mesg.data object -- we don't want client to just be able to set anything about a project.
                    data = {}
                    for field in ['title', 'description', 'public', 'dropbox_folder', 'dropbox_token']
                        if mesg.data[field]?
                            data[field] = mesg.data[field]
                    winston.debug("mesg_update_project_data -- about to call update")
                    database.update
                        table   : "projects"
                        where   : {project_id:mesg.project_id}
                        set     : data
                        cb      : (error, result) =>
                            winston.debug("mesg_update_project_data -- cb2 #{error}, #{result}")
                            if error
                                @error_to_client(id:mesg.id, error:"Database error changing properties of the project with id #{mesg.project_id}.")
                            else
                                push_to_clients
                                    where : {project_id:mesg.project_id, account_id:@account_id}
                                    mesg  : message.project_data_updated(id:mesg.id, project_id:mesg.project_id)

    mesg_write_text_file_to_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.write_file
                path : mesg.path
                data : mesg.content
                cb   : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.file_written_to_project(id:mesg.id))

    mesg_read_text_file_from_project: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            project.read_file
                path : mesg.path
                cb   : (err, content) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        t = content.blob.toString()
                        @push_to_client(message.text_file_read_from_project(id:mesg.id, content:t))

    mesg_read_file_from_project: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            project.read_file
                path    : mesg.path
                archive : mesg.archive
                cb      : (err, content) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        # Store content in uuid:blob store and provide a temporary link to it.
                        u = misc_node.uuidsha1(content.blob)
                        save_blob
                            uuid  : u
                            value : content.blob
                            ttl   : BLOB_TTL
                            check : false       # trusted hub generated the uuid above.
                            cb    : (err) =>
                                if err
                                    @error_to_client(id:mesg.id, error:err)
                                else
                                    if content.archive?
                                        the_url = program.base_url + "/blobs/#{mesg.path}.#{content.archive}?uuid=#{u}"
                                    else
                                        the_url = program.base_url + "/blobs/#{mesg.path}?uuid=#{u}"
                                    @push_to_client(message.temporary_link_to_file_read_from_project(id:mesg.id, url:the_url))

    mesg_move_file_in_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.move_file mesg.src, mesg.dest, (err, content) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.file_moved_in_project(id:mesg.id))

    mesg_make_directory_in_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.make_directory mesg.path, (err, content) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.directory_made_in_project(id:mesg.id))

    mesg_remove_file_from_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.remove_file mesg.path, (err, resp) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    resp.id = mesg.id
                    @push_to_client(resp)

    mesg_project_exec: (mesg) =>
        if mesg.command == "ipython-notebook"
            # we just drop these messages, which are from old non-updated clients (since we haven't
            # written code yet to not allow them to connect -- TODO!).
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.call
                mesg    : mesg
                timeout : mesg.timeout
                cb      : (err, resp) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(resp)

    mesg_project_restart: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.local_hub.restart (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_close_project: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            project.local_hub.close (err) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.success(id:mesg.id))

    mesg_linked_projects: (mesg) =>
        if not mesg.add? and not mesg.remove?
            # get list of linked projects
            @get_project mesg, 'read', (err, project) =>
                if err
                    return
                # we have read access to this project, so we can see list of linked projects
                database.linked_projects
                    project_id : project.project_id
                    cb         : (err, list) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.linked_projects(id:mesg.id, list:list))
        else
            @get_project mesg, 'write', (err, project) =>
                if err
                    return
                # we have read/write access to this project, so we can add/remove linked projects
                database.linked_projects
                    add        : mesg.add
                    remove     : mesg.remove
                    project_id : project.project_id
                    cb         : (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.success(id:mesg.id))



    mesg_copy_path_between_projects: (mesg) =>
        if not mesg.src_project_id?
            @error_to_client(id:mesg.id, error:"src_project_id must be defined")
            return
        if not mesg.target_project_id?
            @error_to_client(id:mesg.id, error:"target_project_id must be defined")
            return
        if not mesg.src_path?
            @error_to_client(id:mesg.id, error:"src_path must be defined")
            return

        async.series([
            (cb) =>
                # Check permissions for the source and target projects (in parallel) --
                # need read access to the source and write access to the target.
                async.parallel([
                    (cb) =>
                        user_has_read_access_to_project
                            project_id     : mesg.src_project_id
                            account_id     : @account_id
                            account_groups : @groups
                            cb         : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have read access to source project #{mesg.src_project_id}")
                                else
                                    cb()
                    (cb) =>
                        user_has_write_access_to_project
                            project_id     : mesg.target_project_id
                            account_id     : @account_id
                            account_groups : @groups
                            cb             : (err, result) =>
                                if err
                                    cb(err)
                                else if not result
                                    cb("user must have write access to target project #{mesg.target_project_id}")
                                else
                                    cb()
                ], cb)

            (cb) =>
                # do the copy
                compute_server.project
                    project_id : mesg.src_project_id
                    cb         : (err, project) =>
                        if err
                            cb(err); return
                        else
                            project.copy_path
                                path              : mesg.src_path
                                target_project_id : mesg.target_project_id
                                target_path       : mesg.target_path
                                overwrite_newer   : mesg.overwrite_newer
                                delete_missing    : mesg.delete_missing
                                timeout           : mesg.timeout
                                cb                : cb
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.success(id:mesg.id))
        )


    ################################################
    # Directly communicate with the local hub.  If the
    # client has write access to the local hub, there's no
    # reason they shouldn't be allowed to send arbitrary
    # messages directly (they could anyways from the terminal).
    ################################################
    mesg_local_hub: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            if not mesg.message?
                # in case the message itself is invalid -- is possible
                @error_to_client(id:mesg.id, error:"message must be defined")
                return

            if mesg.message.event == 'project_exec' and mesg.message.command == "ipython-notebook"
                # we just drop these messages, which are from old non-updated clients (since we haven't
                # written code yet to not allow them to connect -- TODO!).
                return

            # It's extremely useful if the local hub has a way to distinguish between different clients who are
            # being proxied through the same hub.
            mesg.message.client_id = @id

            # Tag broadcast messages with identifying info.
            if mesg.message.event == 'codemirror_bcast'
                if @signed_in_mesg?
                    if not mesg.message.name?
                        mesg.message.name = @fullname()
                    if not mesg.message.color?
                        # Use first 6 digits of uuid... one color per session, NOT per username.
                        # TODO: this could be done client side in a way that respects their color scheme...?
                        mesg.message.color = @id.slice(0,6)

            if mesg.message.event == 'codemirror_write_to_disk'
                # Record that a client is actively doing something with this session, but
                # use a timeout to give local hub a chance to actually do the above save...
                f = () =>
                    # record that project is active in the database
                    database.touch_project(project_id : project.project_id)
                    # snapshot/save project if enough time has passed.
                    project.local_hub.save () => # don't care
                setTimeout(f, 10000)  # 10 seconds later, possibly replicate.

            # Record eaching opening of a file in the database log
            if mesg.message.event == 'codemirror_get_session' and mesg.message.path? and mesg.message.path != '.sagemathcloud.log' and @account_id? and mesg.message.project_id?
                database.log_file_access
                    project_id : mesg.message.project_id
                    account_id : @account_id
                    filename   : mesg.message.path

            # Scan message for activity
            if @account_id?
                scan_local_hub_message_for_activity
                    account_id    : @account_id
                    project_id    : mesg.project_id
                    message       : mesg.message

            # Make the actual call
            project.call
                mesg           : mesg.message
                timeout        : mesg.timeout
                multi_response : mesg.multi_response
                cb             : (err, resp) =>
                    if err
                        winston.debug("ERROR: #{err} calling message #{to_json(mesg.message)}")
                        @error_to_client(id:mesg.id, error:err)
                    else
                        if not mesg.multi_response
                            resp.id = mesg.id
                        @push_to_client(resp)

                        if resp.event == 'codemirror_session' and typeof(resp.path) == 'string'
                            # track this so it can be used by
                            # scan_local_hub_message_for_activity
                            key = "#{mesg.project_id}-#{resp.session_uuid}"
                            if resp.path.slice(0,2) == './'
                                path = resp.path.slice(2)
                            codemirror_sessions[key] = {path:path, readonly:resp.readonly}

    ## -- user search
    mesg_user_search: (mesg) =>
        if not mesg.limit? or mesg.limit > 50
            # hard cap at 50...
            mesg.limit = 50
        database.user_search
            query : mesg.query
            limit : mesg.limit
            cb    : (err, results) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.user_search_results(id:mesg.id, results:results))

    mesg_get_project_users: (mesg) =>
        @get_project mesg, 'read', (err, project) =>
            if err
                return
            database.get_project_users
                project_id : mesg.project_id
                cb         : (err, users) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.project_users(id:mesg.id, users:users))

    mesg_invite_collaborator: (mesg) =>
        if mesg.account_id == @account_id
            @error_to_client(id:mesg.id, error:"You cannot add yourself as a collaborator on a project.")
            return
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            # SECURITY NOTE: mesg.project_id is valid and the client has write access, since otherwise,
            # the @get_project function above wouldn't have returned without err...
            database.add_user_to_project
                project_id : mesg.project_id
                account_id : mesg.account_id
                group      : 'collaborator'  # in future will be "invite_collaborator", once implemented
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    mesg_invite_noncloud_collaborators: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return

            if mesg.to.length > 1024
                @error_to_client(id:mesg.id, error:"Specify less recipients when adding collaborators to project.")
                return

            # users to invite
            to = (x for x in mesg.to.replace(/\s/g,",").replace(/;/g,",").split(',') when x)
            #winston.debug("invite users: to=#{misc.to_json(to)}")

            # invitation template
            email = mesg.email
            if email.indexOf("https://cloud.sagemath.com") == -1
                # User deleted the link template for some reason.
                email += "\nhttps://cloud.sagemath.com\n"

            invite_user = (email_address, cb) =>
                winston.debug("inviting #{email_address}")
                if not client_lib.is_valid_email_address(email_address)
                    cb("invalid email address '#{email_address}'")
                    return
                email_address = misc.lower_email_address(email_address)
                if email_address.length >= 128
                    # if an attacker tries to embed a spam in the email address itself (e.g, wstein+spam_message@gmail.com), then
                    # at least we can limit its size.
                    cb("email address must be at most 128 characters: '#{email_address}'")
                    return
                done  = false
                account_id = undefined
                async.series([
                    # already have an account?
                    (cb) =>
                        database.account_exists
                            email_address : email_address
                            cb            : (err, _account_id) =>
                                winston.debug("account_exists: #{err}, #{_account_id}")
                                account_id = _account_id
                                cb(err)
                    (cb) =>
                        if account_id
                            winston.debug("user #{email_address} already has an account -- add directly")
                            # user has an account already
                            done = true
                            database.add_user_to_project
                                project_id : mesg.project_id
                                account_id : account_id
                                group      : 'collaborator'
                                cb         : cb
                        else
                            winston.debug("user #{email_address} doesn't have an account yet -- will send email")
                            # create trigger so that when user eventually makes an account,
                            # they will be added to the project.
                            database.account_creation_actions
                                email_address : email_address
                                action        : {action:'add_to_project', group:'collaborator', project_id:mesg.project_id}
                                ttl           : 60*60*24*14  # valid for 14 days
                                cb            : cb
                    (cb) =>
                        if done
                            cb()
                        else
                            cb()
                            # send an email to the user -- async, not blocking user.
                            # TODO: this can take a while -- we need to take some action
                            # if it fails, e.g., change a setting in the projects table!
                            if @account_settings?
                                fullname = "#{@account_settings.first_name} #{@account_settings.last_name}"
                                subject  = "#{fullname} has invited you to SageMathCloud"
                            else
                                fullname = ""
                                subject  = "SageMathCloud invitation"
                            opts =
                                to      : email_address
                                bcc     : 'invites@sagemath.com'
                                from    : "SageMathCloud <invites@sagemath.com>"
                                subject : subject
                                body    : email.replace("https://cloud.sagemath.com", "Sign up at https://cloud.sagemath.com using the email address #{email_address}.")
                                cb      : (err) =>
                                    winston.debug("send_email to #{email_address} -- done -- err={misc.to_json(err)}")

                            send_email(opts)

                ], cb)

            async.map to, invite_user, (err, results) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.invite_noncloud_collaborators_resp(id:mesg.id, mesg:"Invited #{mesg.to} to collaborate on a project."))

    mesg_remove_collaborator: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if err
                return
            # See "Security note" in mesg_invite_collaborator
            database.remove_user_from_project
                project_id : mesg.project_id
                account_id : mesg.account_id
                group      : 'collaborator'
                cb         : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))


    ######################################################
    # Blobs
    ######################################################
    mesg_remove_blob_ttls: (mesg) =>
        if not @account_id?
            @push_to_client(message.error(id:mesg.id, error:"not yet signed in"))
        else
            remove_blob_ttls
                uuids : mesg.uuids
                cb    : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:err)
                    else
                        @push_to_client(message.success(id:mesg.id))

    ################################################
    # Project snapshots -- interface to the snap servers
    ################################################
    mesg_snap: (mesg) =>
        if mesg.command not in ['ls', 'restore', 'log', 'last', 'status']
            @error_to_client(id:mesg.id, error:"invalid snap command '#{mesg.command}'")
            return
        user_has_write_access_to_project
            project_id     : mesg.project_id
            account_id     : @account_id
            account_groups : @groups
            cb             : (err, result) =>
                if err or not result
                    @error_to_client(id:mesg.id, error:"access to project #{mesg.project_id} denied")
                else
                    snap_command
                        command    : mesg.command
                        project_id : mesg.project_id
                        snapshot   : mesg.snapshot
                        path       : mesg.path
                        timeout    : mesg.timeout
                        timezone_offset : mesg.timezone_offset
                        cb         : (err, list) =>
                            if err
                                @error_to_client(id:mesg.id, error:err)
                            else
                                mesg.list = list
                                @push_to_client(mesg)

    ################################################
    # The version of the running server.
    ################################################
    mesg_get_version: (mesg) =>
        mesg.version = SALVUS_VERSION
        @push_to_client(mesg)

    ################################################
    # Stats about cloud.sagemath
    ################################################
    mesg_get_stats: (mesg) =>
        server_stats (err, stats) =>
            mesg.stats = stats
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(mesg)

    ################################################
    # Administration functionality
    ################################################
    user_is_in_group: (group) =>
        return @groups? and 'admin' in @groups

    mesg_project_set_quotas: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to set project quotas")
        else if not misc.is_valid_uuid_string(mesg.project_id)
            @error_to_client(id:mesg.id, error:"invalid project_id")
        else
            project = undefined
            async.series([
                (cb) =>
                    compute_server.project
                        project_id : mesg.project_id
                        cb         : (err, p) =>
                            project = p; cb(err)
                (cb) =>
                    project.set_quotas
                        disk_quota : mesg.disk
                        cores      : mesg.cores
                        memory     : mesg.memory
                        cpu_shares : mesg.cpu_shares
                        network    : mesg.network
                        mintime    : mesg.mintime
                        cb         : cb
            ], (err) =>
                if err
                    @error_to_client(id:mesg.id, error:"problem setting project quota -- #{err}")
                else
                    @push_to_client(message.success(id:mesg.id))
            )

    mesg_set_account_creation_token: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to set account creation token")
        else
            s = database.key_value_store(name:'global_admin_settings')
            s.set
                key   : 'account_creation_token'
                value : mesg.token
                cb    : (err) =>
                    if err
                        @error_to_client(id:mesg.id, error:"problem setting account creation token -- #{err}")
                    else
                        @push_to_client(message.success(id:mesg.id))


    mesg_get_account_creation_token: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to get account creation token")
        else
            s = database.key_value_store(name:'global_admin_settings')
            s.get
                key   : 'account_creation_token'
                cb    : (err, val) =>
                    if err
                        @error_to_client(id:mesg.id, error:"problem getting account creation token -- #{err}")
                    else
                        if not val?
                            val = ''
                        @push_to_client(message.get_account_creation_token(id:mesg.id, token:val))

    ################################################
    # Public/published projects data
    ################################################
    path_is_in_public_paths: (path, paths) =>
        #winston.debug("path_is_in_public_paths('#{path}', #{misc.to_json(paths)})")
        return misc.path_is_in_public_paths(path, paths)

    get_public_project: (opts) =>
        opts = defaults opts,
            project_id : undefined
            path       : undefined
            use_cache  : true
            cb         : required

        if not opts.project_id?
            opts.cb("project_id must be defined")
            return

        if not opts.use_cache
            # determine if path is public in given project, without using cache to determine paths; this *does* cache the result.
            database.get_public_paths
                project_id : opts.project_id
                cb         : (err, paths) =>
                    if err
                        opts.cb(err)
                    else
                        if not @_public_project_cache?
                            @_public_project_cache = {}
                        project = @_public_project_cache[opts.project_id]?.project  # save in case project known from before
                        x = @_public_project_cache[opts.project_id] = {paths:paths}
                        setTimeout((()=>delete @_public_project_cache[opts.project_id]), CACHE_PROJECT_PUBLIC_MS)
                        if @path_is_in_public_paths(opts.path, paths)
                            # yes
                            if project?
                                x.project = project
                                opts.cb(undefined, x.project)
                            else
                                compute_server.project
                                    project_id : opts.project_id
                                    cb         : (err, p) =>
                                        if err
                                            opts.cb(err)
                                        else
                                            x.project = p
                                            opts.cb(undefined, x.project)
                        else
                            # no
                            opts.cb("path #{opts.path} of project #{opts.project_id} is not public")
        else
            # first check if path is public using the cache; if not, will try again not using cache
            x = @_public_project_cache?[opts.project_id]
            if x? and @path_is_in_public_paths(opts.path, x.paths)  # cache sufficient to conclude path is public
                if x.project?
                    opts.cb(undefined, x.project)
                else
                    compute_server.project
                        project_id : opts.project_id
                        cb         : (err, p) =>
                            if err
                                opts.cb(err)
                            else
                                x.project = p
                                opts.cb(undefined, x.project)
            else
                # At this point opts.path isn't in the list in the cache or cache is empty.
                # We try querying database, since cache isn't good enough to decide.
                # Note that we are caching a positive decision for CACHE_PROJECT_PUBLIC_MS, but
                # we always query the database in order to make a negative decision.  This is so
                # publishing works instantly right after the user makes the path public.
                @get_public_project
                    project_id : opts.project_id
                    path       : opts.path
                    use_cache  : false
                    cb         : opts.cb


    mesg_public_get_project_info: (mesg) =>
        @get_public_project
            project_id : mesg.project_id
            cb         :  (err, project) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                    return
                database.get_project_data
                    project_id : mesg.project_id
                    objectify  : true
                    columns    : cass.PUBLIC_PROJECT_COLUMNS
                    cb         : (err, info) =>
                        if err
                            @error_to_client(id:mesg.id, error:"no project with id #{mesg.project_id} available")
                        else
                            info.public_access = true
                            @push_to_client(message.public_project_info(id:mesg.id, info:info))

    mesg_public_get_directory_listing: (mesg) =>
        if not mesg.path?
            @error_to_client(id:mesg.id, error:'must specify path')
            return
        @get_public_project
            project_id : mesg.project_id
            path       : mesg.path
            cb         : (err, project) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                    return
                 project.directory_listing
                    path    : mesg.path
                    hidden  : mesg.hidden
                    time    : mesg.time
                    start   : mesg.start
                    limit   : mesg.limit
                    cb      : (err, result) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            @push_to_client(message.public_directory_listing(id:mesg.id, result:result))

    mesg_public_get_text_file: (mesg) =>
        if not mesg.path?
            @error_to_client(id:mesg.id, error:'must specify path')
            return
        @get_public_project
            project_id : mesg.project_id
            path       : mesg.path
            cb         : (err, project) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                    return
                project.read_file
                    path    : mesg.path
                    maxsize : 20000000  # restrict to 20MB limit
                    cb      : (err, data) =>
                        if err
                            @error_to_client(id:mesg.id, error:err)
                        else
                            # since this is get_text_file
                            data = data.toString('utf-8')
                            @push_to_client(message.public_text_file_contents(id:mesg.id, data:data))


    mesg_publish_path: (mesg) =>
        if mesg.path == '.snapshots' or misc.startswith(mesg.path,'.snapshots/')
            @error_to_client(id:mesg.id, error:"you may not publish anything in the snapshots directory")
            return
        @get_project mesg, 'write', (err, project) =>
            if not err
                database.publish_path
                    project_id  : mesg.project_id
                    path        : mesg.path
                    description : mesg.description
                    cb          : (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:"error publishing path -- #{err}")
                        else
                            @push_to_client(message.success(id:mesg.id))

    mesg_unpublish_path: (mesg) =>
        @get_project mesg, 'write', (err, project) =>
            if not err
                database.unpublish_path
                    project_id  : mesg.project_id
                    path        : mesg.path
                    cb          : (err) =>
                        if err
                            @error_to_client(id:mesg.id, error:"error publishing path -- #{err}")
                        else
                            @push_to_client(message.success(id:mesg.id))

    mesg_get_public_paths: (mesg) =>
        database.get_public_paths
            project_id : mesg.project_id
            cb         : (err, paths) =>
                if err
                    @error_to_client(id:mesg.id, error:"error getting published paths -- #{err}")
                else
                    @push_to_client(message.public_paths(id:mesg.id, paths:paths))


    mesg_copy_public_path_between_projects: (mesg) =>
        if not mesg.src_project_id?
            @error_to_client(id:mesg.id, error:"src_project_id must be defined")
            return
        if not mesg.target_project_id?
            @error_to_client(id:mesg.id, error:"target_project_id must be defined")
            return
        if not mesg.src_path?
            @error_to_client(id:mesg.id, error:"src_path must be defined")
            return
        project = undefined
        async.series([
            (cb) =>
                # ensure user can write to the target project
                user_has_write_access_to_project
                    project_id     : mesg.target_project_id
                    account_id     : @account_id
                    account_groups : @groups
                    cb             : (err, result) =>
                        if err
                            cb(err)
                        else if not result
                            cb("user must have write access to target project #{mesg.target_project_id}")
                        else
                            cb()
            (cb) =>
                @get_public_project
                    project_id : mesg.src_project_id
                    path       : mesg.src_path
                    cb         : (err, x) =>
                        project = x
                        cb(err)
            (cb) =>
                project.copy_path
                    path            : mesg.src_path
                    target_project_id : mesg.target_project_id
                    target_path     : mesg.target_path
                    overwrite_newer : mesg.overwrite_newer
                    delete_missing  : mesg.delete_missing
                    timeout         : mesg.timeout
                    cb              : cb
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.success(id:mesg.id))
        )


    ################################################
    # Activity
    ################################################
    mesg_get_all_activity: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        #dbg = (a,m) => winston.debug("mesg_get_all_activity -- #{a} -- #{misc.to_json(m)}")
        activity    = undefined
        events      = undefined
        t0 = misc.mswalltime()
        async.series([
            (cb) =>
                #dbg("get all projects that user collaborates on")
                database.get_project_ids_with_user
                    hidden     : true
                    account_id : @account_id
                    cb         : (err, x) =>
                        if err
                            cb(err)
                        else
                            @_activity_project_ids = x
                            @_activity_project_ids_map = {}
                            for project_id in x
                                @_activity_project_ids_map[project_id] = true
                            setTimeout((()=>delete @_activity_project_ids), 5*60*1000)  # cache for 5 minutes
                            #dbg("got", x)
                            cb()
            (cb) =>
                if not @_activity_project_ids? or @_activity_project_ids.length == 0
                    events = []
                    cb()
                    return
                #dbg("get activity logs for those projects")
                database.select
                    table     : 'activity_by_project2'
                    columns   : ['project_id', 'timestamp', 'path', 'account_id', 'action', 'seen_by', 'read_by']
                    objectify : true
                    where     :
                        project_id : {'in':@_activity_project_ids}
                        timestamp  : {'>=':cass.hours_ago(ACTIVITY_LOG_DEFAULT_LENGTH_HOURS)}
                    limit     : ACTIVITY_LOG_DEFAULT_MAX_LENGTH
                    cb        : (err, x) =>
                        if err
                            cb(err)
                        else
                            events = x
                            cb()
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                # success: send result to client
                winston.debug("activity_log(account_id=#{@account_id}): nonblocking query time to get #{events.length} took #{misc.mswalltime(t0)}ms")
                t0 = misc.mswalltime()
                obj = misc.activity_log(account_id:@account_id, events:events).obj()
                winston.debug("activity_log(account_id=#{@account_id}): *blocking* parse of #{events.length} events took #{misc.mswalltime(t0)}ms to parse")
                @push_to_client(message.all_activity(id:mesg.id, activity_log:obj))
        )

    # when called, this will query for new activity
    # and send message to user if there is any
    push_recent_activity: (cb) =>
        if @_push_recent_activity_is_being_called
            winston.debug("push_recent_activity(id=#{@id}): hit lock")
            return
        @_push_recent_activity_is_being_called = true
        if @_next_recent_activity_interval_s
            @_next_recent_activity_interval_s = Math.min(RECENT_ACTIVITY_POLL_DECAY_RATIO*@_next_recent_activity_interval_s, RECENT_ACTIVITY_POLL_INTERVAL_MAX_S)
            winston.debug("push_recent_activity(id=#{@id}): will call @push_recent_activity in #{@_next_recent_activity_interval_s}s")
            setTimeout(@push_recent_activity, @_next_recent_activity_interval_s*1000)
        else
            winston.debug("push_recent_activity(id=#{@id}): canceled @push_recent_activity")
            delete @_push_recent_activity_is_being_called
            return
        if not @account_id?
            delete @_push_recent_activity_is_being_called
            return
        events = undefined

        async.series([
            (cb) =>
                if @_activity_project_ids?
                    cb()
                else
                    database.get_project_ids_with_user
                        hidden     : true
                        account_id : @account_id
                        cb         : (err, x) =>
                            if err
                                cb(err)
                            else
                                @_activity_project_ids = x
                                @_activity_project_ids_map = {}
                                for project_id in x
                                    @_activity_project_ids_map[project_id] = true
                                setTimeout((()=>delete @_activity_project_ids), 5*60*1000)  # cache for 5 minutes
                                cb()
            (cb) =>
                if not @_activity_project_ids? or @_activity_project_ids.length == 0
                    events = []
                    cb()
                    return
                database.select
                    table       : 'recent_activity_by_project2'
                    columns     : ['project_id', 'timestamp', 'path', 'account_id', 'action', 'seen_by', 'read_by']
                    objectify   : true
                    consistency : 1  # less server load
                    where       :
                        project_id : {'in':@_activity_project_ids}
                    cb    : (err, x) =>
                        if err
                            cb?(err)
                        else
                            events = x
                            cb()
        ], (err) =>
            delete @_push_recent_activity_is_being_called
            if err
                cb?(err)
            else
                if events.length == 0
                    cb?()
                    return
                if not @_recent_activity_sent?
                    @_recent_activity_sent = {}
                updates = []
                for event in events
                    ##if event.account_id == @account_id  # don't report our own events
                    ##   continue
                    j = misc.to_json(event)
                    h = misc.hash_string(j)
                    if @_recent_activity_sent[h]
                        continue
                    @_recent_activity_sent[h] = true
                    updates.push(event)
                if updates.length > 0
                    @push_to_client(message.recent_activity(updates:updates))
                cb?()
        )

    mesg_mark_activity: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        mark = mesg.mark
        if mark != 'seen' and mark != 'read'
            @error_to_client(id:mesg.id, error:"mark must be seen or read")
        f = (event, cb) =>
            # event = {path:'project_id/filesystem_path', timestamp:number}
            try
                project_id = event.path.slice(0,36)
                if not @_activity_project_ids_map[project_id]?   # security
                    cb()
                    return
                path = event.path.slice(37)
                timestamp = event.timestamp
            catch e
                cb(e)
            where = " WHERE project_id=? AND path=? AND timestamp=?"
            param = [project_id, path, timestamp]
            async.parallel([
                (cb) =>
                    query = "UPDATE activity_by_project2 SET #{mark}_by=#{mark}_by+{#{@account_id}}"
                    database.cql
                        query : query+where
                        vals  : param
                        cb    : cb
                (cb) =>
                    query = "UPDATE recent_activity_by_project2 USING TTL #{RECENT_ACTIVITY_TTL_S} SET #{mark}_by=#{mark}_by+{#{@account_id}}"
                    database.cql
                        query : query+where
                        vals  : param
                        cb    : cb
            ], (err) =>
                if not err
                   @push_recent_activity()
            )

        async.map mesg.events, f, (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.success(id:mesg.id))



    mesg_path_activity: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        if not mesg.project_id
            @error_to_client(id:mesg.id, error:"project_id must be specified")
        if not mesg.path
            @error_to_client(id:mesg.id, error:"path must be specified")
        user_has_write_access_to_project
            project_id     : mesg.project_id
            account_id     : mesg.account_id
            cb             : (err, result) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else if not result
                    @error_to_client(id:mesg.id, error:"user must have write access to project")
                else
                    path_activity
                        account_id : @account_id
                        project_id : mesg.project_id
                        path       : mesg.path
                        cb         : (err) =>
                            if err
                                @error_to_client(id:mesg.id, error:"error recording path activity -- #{err}")
                            else
                                @push_to_client(message.success(id:mesg.id))

    mesg_add_comment_to_activity_notification_stream: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        if not mesg.project_id?
            @error_to_client(id:mesg.id, error:"project_id must be set")
        if not mesg.path?
            @error_to_client(id:mesg.id, error:"path must be set")
        if not mesg.comment?
            @error_to_client(id:mesg.id, error:"comment must be set")
        add_comment_to_activity_notification_stream
            account_id : @account_id
            project_id : mesg.project_id
            path       : mesg.path
            comment    : mesg.comment
            cb         : (err) =>
                if err
                    @error_to_client(id:mesg.id, error:"error marking #{path} as read -- #{err}")
                else
                    @push_to_client(message.success(id:mesg.id))

    ############################################
    # Bulk information about several projects or accounts
    # (may be used by activity notifications, chat, etc.)
    #############################################
    mesg_get_project_titles: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        database.get_project_titles
            project_ids : mesg.project_ids
            use_cache   : true
            cb          : (err, titles) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.project_titles(titles:titles, id:mesg.id))

    mesg_get_user_names: (mesg) =>
        if not @account_id?
            @error_to_client(id:mesg.id, error:"user must be signed in")
            return
        database.get_user_names
            account_ids : mesg.account_ids
            use_cache   : true
            cb          : (err, user_names) =>
                if err
                    @error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.user_names(user_names:user_names, id:mesg.id))

    ######################################################
    #Stripe-integration billing code
    ######################################################
    ensure_fields: (mesg, fields) =>
        if not mesg.id?
            return false
        if typeof(fields) == 'string'
            fields = fields.split(' ')
        for f in fields
            if not mesg[f.trim()]?
                err = "invalid message; must have #{f} field"
                @error_to_client(id:mesg.id, error:err)
                return false
        return true

    stripe_get_customer_id: (id, cb) =>  # id = message id
        # cb(err, customer_id)
        #  - if err, then an error message with id the given id is sent to the
        #    user, so client code doesn't have to
        #  - if no customer info yet with stripe, then NOT an error; instead,
        #    customer_id is undefined.
        dbg = @dbg("stripe_get_customer_id")
        if not stripe?
            err = "stripe billing not configured"
            dbg(err)
            @error_to_client(id:id, error:err)
            cb(err)
        else
            if @stripe_customer_id?
                dbg("using cached @stripe_customer_id")
                cb(undefined, @stripe_customer_id)
            else
                dbg('getting stripe_customer_id from db...')
                database.get_account
                    columns    : ['stripe_customer_id']
                    account_id : @account_id
                    cb         : (err, r) =>
                        if err
                            dbg("fail -- #{err}")
                            @error_to_client(id:id, error:err)
                            cb(err)
                        else
                            dbg("got result #{r.stripe_customer_id}")
                            cb(undefined, r.stripe_customer_id)

    # like stripe_get_customer_id, except sends an error to the
    # user if they aren't registered yet, instead of returning undefined.
    stripe_need_customer_id: (id, cb) =>
        @dbg("stripe_need_customer_id")()
        @stripe_get_customer_id id, (err, customer_id) =>
            if err
                cb(err); return
            if not customer_id?
                err = "customer not defined"
                @stripe_error_to_client(id:id, error:err)
                cb(err); return
            cb(undefined, customer_id)

    stripe_get_customer: (id, cb) =>
        dbg = @dbg("stripe_get_customer")
        dbg("getting id")
        @stripe_get_customer_id id, (err, customer_id) =>
            if err
                dbg("failed -- #{err}")
                cb(err)
                return
            if not customer_id?
                dbg("no customer_id set yet")
                cb(undefined, undefined)
                return
            dbg("now getting stripe customer object")
            stripe.customers.retrieve customer_id, (err, customer) =>
                if err
                    dbg("failed -- #{err}")
                    @error_to_client(id:id, error:err)
                    cb(err)
                else
                    dbg("got it")
                    cb(undefined, customer)

    stripe_error_to_client: (opts) =>
        opts = defaults opts,
            id    : required
            error : required
        err = opts.error
        if typeof(err) != 'string'
            if err.stack?
                err = err.stack.split('\n')[0]
            else
                err = misc.to_json(err)
        @dbg("stripe_error_to_client")(err)
        @error_to_client(id:opts.id, error:err)

    mesg_stripe_get_customer: (mesg) =>
        dbg = @dbg("mesg_stripe_get_customer")
        dbg("get information from stripe about this customer, e.g., subscriptions, payment methods, etc.")
        @stripe_get_customer mesg.id, (err, customer) =>
            if err
                return
            resp = message.stripe_customer
                id                     : mesg.id
                stripe_publishable_key : if stripe? then stripe.publishable_key
                customer               : customer
            @push_to_client(resp)

    mesg_stripe_create_source: (mesg) =>
        dbg = @dbg("mesg_stripe_get_customer")
        dbg("create a payment method (credit card) in stripe for this user")
        if not @ensure_fields(mesg, 'token')
            dbg("missing token field -- bailing")
            return
        dbg("looking up customer")
        @stripe_get_customer_id mesg.id, (err, customer_id) =>
            if err  # database or other major error (e.g., no stripe conf)
                    # @get_stripe_customer sends error message to user
                dbg("failed -- #{err}")
                return
            if not customer_id?
                dbg("create new stripe customer (from card token)")
                description = undefined
                email = undefined
                async.series([
                    (cb) =>
                        dbg("get identifying info about user")
                        database.get_account
                            columns    : ['email_address', 'first_name', 'last_name']
                            account_id : @account_id
                            cb         : (err, r) =>
                                if err
                                    cb(err)
                                else
                                    email = r.email_address
                                    description = "#{r.first_name} #{r.last_name}"
                                    dbg("they are #{description} with email #{email}")
                                    cb()
                    (cb) =>
                        dbg("creating stripe customer")
                        stripe.customers.create
                            source      : mesg.token
                            description : description
                            email       : email
                            metadata    :
                                account_id : @account_id
                         ,
                            (err, customer) =>
                                if err
                                    cb(err)
                                else
                                    customer_id = customer.id
                                    cb()
                    (cb) =>
                        dbg("success; now save customer id token to database")
                        database.update
                            table : 'accounts'
                            set   : {stripe_customer_id : customer_id}
                            where : {account_id         : @account_id}
                            cb    : cb
                ], (err) =>
                    if err
                        dbg("failed -- #{err}")
                        @stripe_error_to_client(id:mesg.id, error:err)
                    else
                        @success_to_client(id:mesg.id)
                )
            else
                dbg("add card to existing stripe customer")
                stripe.customers.createCard customer_id, {card:mesg.token}, (err, card) =>
                    if err
                        @stripe_error_to_client(id:mesg.id, error:err)
                    else
                        @success_to_client(id:mesg.id)

    mesg_stripe_delete_source: (mesg) =>
        dbg = @dbg("mesg_stripe_delete_source")
        dbg("delete a payment method for this user")
        if not @ensure_fields(mesg, 'card_id')
            dbg("missing card_id field")
            return
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                dbg("couldn't find customer")
                return
            stripe.customers.deleteCard customer_id, mesg.card_id, (err, confirmation) =>
                if err
                    dbg("failed to delete -- #{err}")
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    dbg("successfully deleted card")
                    @success_to_client(id:mesg.id)

    mesg_stripe_set_default_source: (mesg) =>
        dbg = @dbg("mesg_stripe_set_default_source")
        dbg("set a payment method for this user to be the default")
        if not @ensure_fields(mesg, 'card_id')
            dbg("missing field card_id")
            return
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                dbg("failed -- #{err}")
                return
            dbg("now setting the default in stripe")
            stripe.customers.update customer_id, {default_source:mesg.card_id}, (err, confirmation) =>
                if err
                    dbg("failed -- #{err}")
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    dbg("success")
                    @success_to_client(id:mesg.id)


    mesg_stripe_update_source: (mesg) =>
        dbg = @dbg("mesg_stripe_update_source")
        dbg("modify a payment method")

        if not @ensure_fields(mesg, 'card_id info')
            return
        if mesg.info.metadata?
            @error_to_client(id:mesg.id, error:"you may not change card metadata")
            return
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            stripe.customers.updateCard customer_id, mesg.card_id, mesg.info, (err, confirmation) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)

    mesg_stripe_get_plans: (mesg) =>
        dbg = @dbg("mesg_stripe_get_plans")
        dbg("get descriptions of the available plans that the user might subscribe to")
        stripe.plans.list (err, plans) =>
            if err
                @stripe_error_to_client(id:mesg.id, error:err)
            else
                @push_to_client(message.stripe_plans(id: mesg.id, plans: plans))

    mesg_stripe_create_subscription: (mesg) =>
        dbg = @dbg("mesg_stripe_create_subscription")
        dbg("create a subscription for this user, using some billing method")
        if not @ensure_fields(mesg, 'plan')
            dbg("missing field 'plan'")
            return
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                dbg("fail -- #{err}")
                return
            projects = mesg.projects
            if not mesg.quantity?
                mesg.quantity = 1
            dbg("sanity check that each thing in project is a project_id")
            if projects?
                for project_id in projects
                    if not misc.is_valid_uuid_string(project_id)
                        err = "invalid project id #{project_id}"
                        dbg("fail -- #{err}")
                        @error_to_client(id:mesg.id, error:err)
                        return
                # TODO: may need more sophisticated sanity check that number
                # of projects is within the subscription bound, i.e.,
                # that mesg.quantity * number of projects for this plan is at most the number
                # of projects specified.  At least, would need this if allow more than
                # one project for a plan (not sure yet).
                if projects.length > mesg.quantity
                    err = "number of projects must be less than quantity"
                    dbg("fail -- #{err}")
                    @error_to_client(id:mesg.id, error:err)
                    return

            options =
                plan     : mesg.plan
                quantity : mesg.quantity
                coupon   : mesg.coupon
                metadata :
                    projects : misc.to_json(projects)
            subscription = undefined
            async.series([
                (cb) =>
                    dbg("get customer subscription from stripe")
                    stripe.customers.createSubscription customer_id, options, (err, s) =>
                        if err
                            cb(err)
                        else
                            subscription = s
                            cb()
                (cb) =>
                    dbg("Successfully added subscription; now save info in our database about subscriptions.")
                    database.cql
                        query : "UPDATE projects SET stripe_subscriptions=stripe_subscriptions+{'#{subscription.id}'} WHERE project_id IN (#{projects.join(',')})"
                        cb : (err) =>
                            if err
                                cb(err)
                                dbg("BAD unlikely situation -- adding to our database failed.")
                                # Try to at least cancel the subscription to stripe - likely to work, since
                                # creating subscription above just worked.
                                stripe.customers.cancelSubscription customer_id, subscription.id, (err, s) =>
                                    if err
                                        # OK, this is really bad.  We made a subscription, but couldn't
                                        # record that in our database.
                                        dbg("bad situation!")
                                        send_email
                                            to      : 'help@sagemath.com'
                                            subject : "Stripe billing issue **needing** human inspection"
                                            body    : "Issue creating subscription from database.  mesg=#{misc.to_json(mesg)}, customer_id=#{customer_id}, subscription_id=#{subscription.id} -- #{err}"
                            else
                                cb()
            ], (err) =>
                if err
                    dbg("fail -- #{err}")
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)
            )

    mesg_stripe_cancel_subscription: (mesg) =>
        dbg = @dbg("mesg_stripe_cancel_subscription")
        dbg("cancel a subscription for this user")
        if not @ensure_fields(mesg, 'subscription_id')
            dbg("missing field subscription_id")
            return
        if mesg.at_period_end
            dbg("at_period_end not yet supported")
            # don't support this yet, since we first have to make
            # sure projects don't get unsubscribed immediately.
            @error_to_client(id:mesg.id, error:"stripe cancel subscription at_period_end option net yet supported")
            return
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return

            projects        = undefined
            subscription_id = mesg.subscription_id
            async.series([
                (cb) =>
                    dbg("cancel the subscription at stripe")
                    # This also returns the subscription, which lets
                    # us easily get the metadata of all projects associated to this subscription.
                    stripe.customers.cancelSubscription customer_id, subscription_id, (err, subscription) =>
                        if err
                            cb(err)
                        else
                            if subscription.metadata?.projects?
                                projects = misc.from_json(subscription.metadata.projects)
                            cb()
                (cb) =>
                    if not projects?
                        cb(); return
                    dbg("remove subscription from projects")
                    database.cql
                        query : "UPDATE projects SET stripe_subscriptions=stripe_subscriptions-{'#{subscription_id}'} WHERE project_id IN (#{projects.join(',')})"
                        cb : (err) =>
                            if err
                                cb(err)
                                dbg("BAD unlikely situation -- removing from our database failed.")
                                send_email
                                    to      : 'help@sagemath.com'
                                    subject : "Stripe billing issue **needing** human inspection"
                                    body    : "Issue removing subscription from database.  mesg=#{misc.to_json(mesg)}, customer_id=#{customer_id}, subscription_id=#{subscription_id} -- #{err}"
                            else
                                cb()
            ], (err) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)
            )


    mesg_stripe_update_subscription: (mesg) =>
        dbg = @dbg("mesg_stripe_update_subscription")
        dbg("edit a subscription for this user")
        if not @ensure_fields(mesg, 'subscription_id')
            dbg("missing field subscription_id")
            return
        subscription_id = mesg.subscription_id
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            dbg("sanity check that each thing in mesg.project is a uuid.")
            if mesg.projects?
                for project_id in mesg.projects
                    if not misc.is_valid_uuid_string(project_id)
                        dbg("invalid project id #{project_id}")
                        @error_to_client(id:mesg.id, error:err)
                        return
            subscription = undefined
            projects0    = undefined
            projects     = undefined
            quantity     = undefined

            async.series([
                (cb) =>
                    if mesg.projects? or mesg.quantity?
                        dbg("changing the projects or quantity, so get the current subscription.")
                        stripe.customers.retrieveSubscription  customer_id, subscription_id, (err, s) =>
                            if err
                                cb(err)
                            else
                                dbg("Do consistency check")
                                projects0 = if s.metadata.projects? then misc.from_json(s.metadata.projects) else []
                                projects  = if mesg.projects? then mesg.projects else projects0
                                quantity  = if mesg.quantity? then mesg.quantity else s.quantity
                                if projects? and projects.length > quantity
                                    cb("number of projects (=#{projects.length}) must be less than quantity (=#{quantity})")
                                else
                                    subscription = s
                                    cb()
                    else
                        cb()
                (cb) =>
                    dbg("Update the subscription.")
                    # This also returns the subscription, which lets
                    # us easily get the metadata of all projects associated to this subscription.
                    changes =
                        quantity : mesg.quantity
                        plan     : mesg.plan
                        coupon   : mesg.coupon
                    if mesg.projects?
                        changes.metadata = {projects:misc.to_json(mesg.projects)}
                    stripe.customers.updateSubscription customer_id, subscription_id, changes, (err, subscription) =>
                        if err
                            cb(err)
                        else
                            cb()
                (cb) =>
                    to_delete = (project_id for project_id in projects0 when project_id not in projects)
                    if to_delete.length == 0
                        cb(); return
                    dbg("remove subscription from projects")
                    database.cql
                        query : "UPDATE projects SET stripe_subscriptions=stripe_subscriptions-{'#{subscription_id}'} WHERE project_id IN (#{to_delete.join(',')})"
                        cb : (err) =>
                            if err
                                cb() # still want to try adding
                                send_email
                                    to      : 'help@sagemath.com'
                                    subject : "Stripe billing issue **needing** human inspection"
                                    body    : "Issue removing subscription from database.  mesg=#{misc.to_json(mesg)}, customer_id=#{customer_id}, subscription_id=#{subscription_id} -- #{err}"
                            else
                                cb()
                (cb) =>
                    to_add = (project_id for project_id in projects when project_id not in projects0)
                    if to_add.length == 0
                        cb(); return
                    dbg("add subscriptions to projects")
                    database.cql
                        query : "UPDATE projects SET stripe_subscriptions=stripe_subscriptions+{'#{subscription_id}'} WHERE project_id IN (#{to_add.join(',')})"
                        cb : (err) =>
                            if err
                                cb(err)
                                send_email
                                    to      : 'help@sagemath.com'
                                    subject : "Stripe billing issue **needing** human inspection"
                                    body    : "Issue adding subscription from database.  mesg=#{misc.to_json(mesg)}, customer_id=#{customer_id}, subscription_id=#{subscription_id} -- #{err}"
                            else
                                cb()
            ], (err) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @success_to_client(id:mesg.id)
            )

    mesg_stripe_get_subscriptions: (mesg) =>
        dbg = @dbg("mesg_stripe_get_subscriptions")
        dbg("get a list of all the subscriptions that this customer has")
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            options =
                limit          : mesg.limit
                ending_before  : mesg.ending_before
                starting_after : mesg.starting_after
            stripe.customers.listSubscriptions customer_id, options, (err, subscriptions) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_subscriptions(id:mesg.id, subscriptions:subscriptions))

    mesg_stripe_get_charges: (mesg) =>
        dbg = @dbg("mesg_stripe_get_charges")
        dbg("get a list of charges for this customer.")
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            options =
                customer       : customer_id
                limit          : mesg.limit
                ending_before  : mesg.ending_before
                starting_after : mesg.starting_after
            stripe.charges.list options, (err, charges) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_charges(id:mesg.id, charges:charges))

    mesg_stripe_get_invoices: (mesg) =>
        dbg = @dbg("mesg_stripe_get_invoices")
        dbg("get a list of invoices for this customer.")
        @stripe_need_customer_id mesg.id, (err, customer_id) =>
            if err
                return
            options =
                customer       : customer_id
                limit          : mesg.limit
                ending_before  : mesg.ending_before
                starting_after : mesg.starting_after
            stripe.invoices.list options, (err, invoices) =>
                if err
                    @stripe_error_to_client(id:mesg.id, error:err)
                else
                    @push_to_client(message.stripe_invoices(id:mesg.id, invoices:invoices))

    mesg_stripe_admin_create_invoice_item: (mesg) =>
        if not @user_is_in_group('admin')
            @error_to_client(id:mesg.id, error:"must be logged in and a member of the admin group to create invoice items")
            return
        dbg = @dbg("mesg_stripe_admin_create_invoice_item")
        customer_id = undefined
        description = undefined
        email       = undefined
        new_customer = true
        async.series([
            (cb) =>
                dbg("check for existing stripe customer_id")
                database.get_account
                    columns       : ['stripe_customer_id', 'email_address', 'first_name', 'last_name', 'account_id']
                    account_id    : mesg.account_id
                    email_address : mesg.email_address
                    cb            : (err, r) =>
                        if err
                            cb(err)
                        else
                            customer_id = r.stripe_customer_id
                            email = r.email_address
                            description = "#{r.first_name} #{r.last_name}"
                            mesg.account_id = r.account_id
                            cb()
            (cb) =>
                if customer_id?
                    new_customer = false
                    dbg("already signed up for stripe")
                    cb()
                else
                    dbg("create stripe entry for this customer")
                    stripe.customers.create
                        description : description
                        email       : email
                        metadata    :
                            account_id : mesg.account_id
                     ,
                        (err, customer) =>
                            if err
                                cb(err)
                            else
                                customer_id = customer.id
                                cb()
            (cb) =>
                if not new_customer
                    cb()
                else
                    dbg("store customer id in our database")
                    database.update
                        table : 'accounts'
                        set   : {stripe_customer_id : customer_id}
                        where : {account_id         : mesg.account_id}
                        cb    : cb
            (cb) =>
                dbg("now create the invoice item")
                stripe.invoiceItems.create
                    customer    : customer_id
                    amount      : mesg.amount*100
                    currency    : "usd"
                    description : mesg.description
                ,
                    (err, invoice_item) =>
                        if err
                            cb(err)
                        else
                            cb()
        ], (err) =>
            if err
                @error_to_client(id:mesg.id, error:err)
            else
                @success_to_client(id:mesg.id)
        )

##############################
# User activity tracking
##############################

RECENT_ACTIVITY_POLL_INTERVAL_MIN_S = 30
RECENT_ACTIVITY_POLL_INTERVAL_MAX_S = 90
RECENT_ACTIVITY_POLL_DECAY_RATIO    = 1.4
RECENT_ACTIVITY_TTL_S = 30 + RECENT_ACTIVITY_POLL_INTERVAL_MAX_S

ACTIVITY_LOG_DEFAULT_LENGTH_HOURS = 24*2  # 2 days
ACTIVITY_LOG_DEFAULT_MAX_LENGTH = 1500    # at most this many events


# update notifications about non-comment activity on a file with at most this frequency.

MIN_ACTIVITY_INTERVAL_S = 60*10  # 10 minutes
#MIN_ACTIVITY_INTERVAL_S = 10   # short for testing

# prioritize notify when somebody edits a file that you edited within this many days
RECENT_NOTIFICATION_D = 14

MAX_ACTIVITY_NAME_LENGTH  = 50
MAX_ACTIVITY_TITLE_LENGTH = 60

normalize_path = (path) ->
    # Rules:
    # kdkd/tmp/.test.sagews.sage-chat --> kdkd/tmp/test.sagews, comment "chat"
    # foo/bar/.2014-11-01-175408.ipynb.syncdoc --> foo/bar/2014-11-01-175408.ipynb
    path = path.slice(0,10000)  # prevent potential attacks involving a huge path breaking things (?)
    ext = misc.filename_extension(path)
    action = 'edit'
    if ext == "sage-chat"
        action = 'comment'
        path = path.slice(0, path.length-'.sage-chat'.length)
        {head, tail} = misc.path_split(path)
        tail = tail.slice(1) # get rid of .
        if head
            path = head + '/' + tail
        else
            path = tail
    else if ext.slice(0,7) == 'syncdoc'   # for IPython, and possibly other things later
        path = path.slice(0, path.length - ext.length - 1)
        {head, tail} = misc.path_split(path)
        tail = tail.slice(1) # get rid of .
        if head
            path = head + '/' + tail
        else
            path = tail
    else if ext == "sage-history"
        path = undefined
    #else if ext == '.sagemathcloud.log'  # ignore for now
    #    path = undefined
    return {path:path, action:action}

_activity_get_project_users_cache = {}
activity_get_project_users = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required
    users = _activity_get_project_users_cache[opts.project_id]
    if users?
        opts.cb(undefined, users); return

    database.select_one
        table       : 'projects'
        columns     : misc.PROJECT_GROUPS
        objectify   : false
        consistency : 1
        where       : {project_id : opts.project_id}
        cb          : (err, x) ->
            if err
                opts.cb(err); return
            users = _.flatten([g for g in x when g?])
            _activity_get_project_users_cache[opts.project_id] = users
            # timeout after a few minutes
            setTimeout( (()->delete _activity_get_project_users_cache[opts.project_id]), 60*1000*5 )
            opts.cb(undefined, users)

NOTIFICATIONS_DELETE_OLD_DAYS = 30
delete_old_notifications = (opts) ->
    opts = defaults opts,
        db         : required
        min_delete : 0      # always delete at least this many notifications, mainly to clear up space
        cb         : undefined
    v = undefined
    dbg = (m, obj) -> winston.debug("delete_old_notifications: #{m}, #{misc.to_json(obj)}")
    dbg("min_delete ", opts.min_delete)
    async.series([
        (cb) ->
            opts.db.select
                where : {table:'activity'}
                cb    : (err, _v) ->
                    if err
                        cb(err)
                    else
                        v = _v
                        dbg("select all, got", v.length)
                        cb()
        (cb) ->
            v.sort(misc.timestamp_cmp)
            too_old = new Date() - 1000*60*60*24*NOTIFICATIONS_DELETE_OLD_DAYS
            to_delete = (x for x in v when not x.timestamp?)  # get rid of any of these
            v = (x for x in v when x.timestamp?)
            i = v.length-1
            while i >= 0 and v[i].timestamp <= too_old
                to_delete.push(v[i])
                i -= 1
            while i >= 0 and to_delete.length < opts.min_delete
                to_delete.push(v[i])
                i -= 1
            f = (x, cb) ->
                opts.db.delete
                    where : {table:'activity', project_id:x.project_id, path:x.path}
                    cb    : cb
            async.mapSeries(to_delete, f, (err) -> cb(err))
    ], (err) ->
        if err
            dbg("ERROR -- ", err)
        opts.cb?(err)
    )

path_activity_cache = {}
path_activity = (opts) ->
    opts = defaults opts,
        account_id    : required
        project_id    : required
        path          : required
        cb            : undefined

    ## completely disable notifications and login by uncommenting this:
    ##opts.cb?(); return

    dbg = (m) -> winston.debug("path_activity(#{opts.account_id},#{opts.project_id},#{opts.path}): #{m}")

    {path, action} = normalize_path(opts.path)
    if not path?
        opts.cb?()
        return

    key = "#{opts.account_id}-#{opts.project_id}-#{path}"
    #dbg("checking local cache")
    if action != 'comment' and path_activity_cache[key]?
        opts.cb?()
        return

    dbg("recording new activity")
    path_activity_cache[key] = true
    setTimeout( (()=>delete path_activity_cache[key]), MIN_ACTIVITY_INTERVAL_S*1000)

    now_time        = cass.now()
    min_time        = cass.seconds_ago(MIN_ACTIVITY_INTERVAL_S)
    recent_time     = cass.days_ago(RECENT_NOTIFICATION_D)

    recent_activity = undefined
    is_new_activity = true

    # who gets notified
    targets = undefined
    async.series([
        (cb) ->
            #dbg("get recent activity")
            if action == 'comment'
                is_new_activity = true # comments always count as new activity
                cb(); return

            database.select
                table   : 'activity_by_path'
                where   : {project_id:opts.project_id, path:path, timestamp:{'>=':recent_time}}
                columns : ['timestamp', 'account_id']
                cb      : (err, result) ->
                    if err
                        cb(err)
                    else
                        result.sort (a,b) ->
                            if a[0] < b[0]
                                return -1
                            else if a[0] > b[0]
                                return 1
                            else
                                return 0
                        recent_activity = result
                        for x in result
                            if x[0] < min_time
                                break
                            else if x[1] == opts.account_id
                                is_new_activity = false
                                break
                        cb()
        (cb) ->
            #dbg("record new activity and notification")
            where = {project_id:opts.project_id, path:path, timestamp:now_time}
            async.parallel([
                (cb) ->
                    #dbg('set activity_by_path')
                    database.update
                        table : 'activity_by_path'
                        where : where
                        set   : {account_id:opts.account_id}
                        cb    : cb
                (cb) ->
                    #dbg('set activity_by_project2')
                    database.update
                        table : 'activity_by_project2'
                        where : where
                        set   : {account_id:opts.account_id, action:action}
                        cb    : cb
                (cb) ->
                    #dbg('set recent_activity_by_project2')
                    database.update
                        table : 'recent_activity_by_project2'
                        where : where
                        set   : {account_id:opts.account_id, action:action}
                        ttl   : RECENT_ACTIVITY_TTL_S
                        cb    : cb
                (cb) ->
                    #dbg('set activity_by_user')
                    database.update
                        table : 'activity_by_user'
                        where : {account_id:opts.account_id, timestamp:now_time}
                        set   : {project_id:opts.project_id, path:path}
                        cb    : cb
            ], (err) -> cb(err))
    ], (err) -> opts.cb?(err))


codemirror_sessions = {} # this is updated in mesg_local_hub

scan_local_hub_message_for_activity = (opts) ->
    opts = defaults opts,
        account_id    : required
        project_id    : required
        message       : required
        cb            : undefined
    #dbg = (m) -> winston.debug("scan_local_hub_message_for_activity(#{opts.account_id},#{opts.project_id}): #{m}")
    #dbg(misc.to_json(codemirror_sessions))
    if opts.message.event == 'codemirror_diffsync' and opts.message.edit_stack?
        if opts.message.edit_stack.length > 0 and opts.message.session_uuid?
            key = "#{opts.project_id}-#{opts.message.session_uuid}"
            path = codemirror_sessions[key]?.path
            if path?
                path_activity
                    account_id    : opts.account_id
                    project_id    : opts.project_id
                    path          : path
                    cb            : opts.cb
                return
    opts.cb?()


##############################
# Server Statistics
##############################
_server_stats_cache = undefined
server_stats = (cb) ->
    if _server_stats_cache?
        cb(false, _server_stats_cache)
    else
        cb("server stats not yet computed")

update_server_stats = () ->
    database.get_stats
        cb : (err, stats) ->
            if not err
                _server_stats_cache = stats


number_of_clients = () ->
    v = (C for id,C of clients when not C._destroy_timer? and not C.closed)
    return v.length

database_is_working = false
register_hub = (cb) ->
    database.update
        table : 'hub_servers'
        where : {host : program.host, port : program.port, dummy: true}
        set   : {clients: number_of_clients()}
        ttl   : 2*REGISTER_INTERVAL_S
        cb    : (err) ->
            if err
                database_is_working = false
                winston.debug("Error registering with database - #{err}")
            else
                database_is_working = true
                winston.debug("Successfully registered with database.")
            cb?(err)

##-------------------------------
#
# Interaction with snap servers
#
##-------------------------------

snap_command = (opts) ->
    opts.cb("snap_command is deprecated")


##############################
# Create the Primus realtime socket server
##############################
primus_server = undefined
init_primus_server = (http_server) ->
    Primus = require('primus')
    # change also requires changing head.html
    opts =
        transformer : 'engine.io'    # 'websockets', 'engine.io','sockjs'
        pathname    : '/hub'
    primus_server = new Primus(http_server, opts)
    winston.debug("primus_server: listening on #{opts.pathname}")
    primus_server.on "connection", (conn) ->
        winston.debug("primus_server: new connection from #{conn.address.ip} -- #{conn.id}")
        f = (data) ->
            id = data.toString()
            winston.debug("primus_server: got id='#{id}'")
            conn.removeListener('data',f)
            C = clients[id]
            #winston.debug("primus client ids=#{misc.to_json(misc.keys(clients))}")
            if C?
                if C.closed
                    winston.debug("primus_server: '#{id}' matches expired Client -- deleting")
                    delete clients[id]
                    C = undefined
                else
                    winston.debug("primus_server: '#{id}' matches existing Client -- re-using")
                    cookies = new Cookies(conn.request)
                    if C._remember_me_value == cookies.get(program.base_url + 'remember_me')
                        old_id = C.conn.id
                        C.conn.removeAllListeners()
                        C.conn = conn
                        conn.id = id
                        conn.write(conn.id)
                        C.install_conn_handlers()
                    else
                        winston.debug("primus_server: '#{id}' matches but cookies do not match, so not re-using")
                        C = undefined
            if not C?
                winston.debug("primus_server: '#{id}' unknown, so making a new Client with id #{conn.id}")
                conn.write(conn.id)
                clients[conn.id] = new Client(conn)

        conn.on("data",f)

#######################################################
# Pushing a message to clients; querying for clients
# This is (or will be) subtle, due to having
# multiple HUBs running on different computers.
#######################################################

# get_client_ids -- given query parameters, returns a list of id's,
#   where the id is the connection id, which we assume is
#   globally unique across all of space and time.
get_client_ids = (opts) ->
    opts = defaults opts,
        account_id : undefined      # include connected clients logged in under this account
        project_id : undefined      # include connected clients that are a user of this project
        exclude    : undefined      # array of id's to exclude from results
        cb         : required

    result = []   # will have list of client id's in it

    # include a given client id in result, if it isn't in the exclude array
    include = (id) ->
        if id not in result
            if opts.exclude?
                if id in opts.exclude
                    return
            result.push(id)

    account_ids = {}   # account_id's to consider

    if opts.account_id?
        account_ids[opts.account_id] = true

    async.series([
        # If considering a given project, then get all the relevant account_id's.
        (cb) ->
            if opts.project_id?
                database.get_account_ids_using_project
                    project_id : opts.project_id
                    cb         : (err, result) ->
                        if err
                            cb(err); return
                        for r in result
                            account_ids[r] = true
                        cb()
            else
                cb()
        # Now get the corresponding connected client id's.
        (cb) ->
            for id, client of clients
                if account_ids[client.account_id]?
                    include(id)
            cb()
    ], (err) ->
        opts.cb(err, result)
    )


# Send a message to a bunch of clients connected to this hub.
# This does not send anything to other hubs or clients at other hubs; the only
# way for a message to go to a client at another hub is via some local hub.
# This design means that we do not have to track which hubs which
# clients are connected to in a database or registry, which wold be a nightmare
# especially due to synchronization issues (some TODO comments might refer to such
# a central design, because that *was* the non-implemented design at some point).
push_to_clients = (opts) ->
    opts = defaults opts,
        mesg     : required
        where    : undefined  # see the get_client_ids function
        to       : undefined
        cb       : undefined

    dest = []

    async.series([
        (cb) ->
            if opts.where?
                get_client_ids(misc.merge(opts.where, cb:(error, result) ->
                    if error
                        opts.cb?(true)
                        cb(true)
                    else
                        dest = dest.concat(result)
                        cb()
                ))
            else
                cb()

        (cb) ->
            # include all clients explicitly listed in "to"
            if opts.to?
                dest = dest.concat(opts.to)

            for id in dest
                client = clients[id]
                if client?
                    winston.debug("pushing a message to client #{id}")
                    client.push_to_client(opts.mesg)
                else
                    winston.debug("not pushing message to client #{id} since not actually connected")
            opts.cb?(false)
            cb()


    ])



##############################
# LocalHub
##############################

connect_to_a_local_hub = (opts) ->    # opts.cb(err, socket)
    opts = defaults opts,
        port         : required
        host         : required
        secret_token : required
        timeout      : 10
        cb           : required

    misc_node.connect_to_locked_socket
        port    : opts.port
        host    : opts.host
        token   : opts.secret_token
        timeout : opts.timeout
        cb      : (err, socket) =>
            if err
                opts.cb(err)
            else
                misc_node.enable_mesg(socket, 'connection_to_a_local_hub')
                socket.on 'data', (data) ->
                    misc_node.keep_portforward_alive(opts.port)
                opts.cb(undefined, socket)


_local_hub_cache = {}
new_local_hub = (project_id) ->    # cb(err, hub)
    H    = _local_hub_cache[project_id]
    if H?
        winston.debug("new_local_hub (#{project_id}) -- using cached version")
    else
        winston.debug("new_local_hub (#{project_id}) -- creating new one")
        H = new LocalHub(project_id)
        _local_hub_cache[project_id] = H
    return H

all_local_hubs = () ->
    v = []
    for k, h of _local_hub_cache
        if h?
            v.push(h)
    return v

MIN_HOST_CHANGED_FAILOVER_TIME_MS = 20000

class LocalHub # use the function "new_local_hub" above; do not construct this directly!
    constructor: (@project_id) ->
        @_local_hub_socket_connecting = false
        @_sockets = {}  # key = session_uuid:client_id
        @_sockets_by_client_id = {}   #key = client_id, value = list of sockets for that client
        @_multi_response = {}
        @path = '.'    # should deprecate - *is* used by some random code elsewhere in this file
        @dbg("getting deployed running project")

    # Query database to find out where the project is currently hosted.
    # If it moves, this will trigger the host_changed event that we listen
    # for in project below, which kills all connections to the local hub.
    # Client code should call this frequently in an event driven way.
    update_host: () =>
        if not @_update_host_recently_called
            @_update_host_recently_called = true
            setTimeout((()=>@_update_host_recently_called=false),
                       MIN_HOST_CHANGED_FAILOVER_TIME_MS)
            winston.debug("calling update_host")
            @_project?.update_host()

    project: (cb) =>
        if @_project?
            cb(undefined, @_project)
        else
            compute_server.project
                project_id : @project_id
                cb         : (err, project) =>
                    if err
                        cb(err)
                    else
                        @_project = project
                        @_project.on 'host_changed', (new_host) =>
                            winston.debug("local_hub(#{@project_id}): host_changed to #{new_host} -- closing all connections")
                            @free_resources()
                        cb(undefined, project)

    dbg: (m) =>
        ## only enable when debugging
        if DEBUG
            winston.debug("local_hub(#{@project_id} on #{@_project?.host}): #{misc.to_json(m)}")

    move: (opts) =>
        opts = defaults opts,
            target : undefined
            cb     : undefined          # cb(err, {host:hostname})
        @dbg("move")
        @project (err, project) =>
            if err
                cb?(err)
            else
                project.move(opts)

    restart: (cb) =>
        @dbg("restart")
        @free_resources()
        @project (err, project) =>
            if err
                cb(err)
            else
                project.restart(cb:cb)

    close: (cb) =>
        @dbg("close: stop the project and delete from disk (but leave in cloud storage)")
        @project (err, project) =>
            if err
                cb(err)
            else
                project.ensure_closed(cb:cb)

    save: (cb) =>
        @dbg("save: save a snapshot of the project")
        @project (err, project) =>
            if err
                cb(err)
            else
                project.save(cb:cb)

    status: (cb) =>
        @dbg("status: get status of a project")
        @project (err, project) =>
            if err
                cb(err)
            else
                project.status(cb:cb)

    state: (cb) =>
        @dbg("state: get state of a project")
        @project (err, project) =>
            if err
                cb(err)
            else
                project.state(cb:cb)

    free_resources: () =>
        @dbg("free_resources")
        delete @address  # so we don't continue trying to use old address
        delete @_status
        try
            @_socket?.end()
            winston.debug("free_resources: closed main local_hub socket")
        catch e
            winston.debug("free_resources: exception closing main _socket: #{e}")
        delete @_socket
        for k, s of @_sockets
            try
                s.end()
                winston.debug("free_resources: closed #{k}")
            catch e
                winston.debug("free_resources: exception closing a socket: #{e}")
        @_sockets = {}
        @_sockets_by_client_id = {}

    free_resources_for_client_id: (client_id) =>
        v = @_sockets_by_client_id[client_id]
        if v?
            @dbg("free_resources_for_client_id(#{client_id}) -- #{v.length} sockets")
            for socket in v
                try
                    socket.end()
                    socket.destroy()
                catch e
                    # do nothing
            delete @_sockets_by_client_id[client_id]

    # handle incoming JSON messages from the local_hub that do *NOT* have an id tag,
    # except those in @_multi_response.
    handle_mesg: (mesg) =>
        #@dbg("local_hub --> hub: received mesg: #{to_json(mesg)}")
        if mesg.id?
            @_multi_response[mesg.id]?(false, mesg)
            return
        if mesg.client_id?
            # Should we worry about ensuring that message from this local hub are allowed to
            # send messages to this client?  NO.  For them to send a message, they would have to
            # know the client's id, which is a random uuid, assigned each time the user connects.
            # It obviously is known to the local hub -- but if the user has connected to the local
            # hub then they should be allowed to receive messages.
            clients[mesg.client_id]?.push_to_client(mesg)

    handle_blob: (opts) =>
        opts = defaults opts,
            uuid : required
            blob : required

        @dbg("local_hub --> global_hub: received a blob with uuid #{opts.uuid}")
        # Store blob in DB.
        save_blob
            uuid  : opts.uuid
            value : opts.blob
            ttl   : BLOB_TTL
            check : true         # if malicious user tries to overwrite a blob with given sha1 hash, they get an error.
            cb    : (err, ttl) =>
                if err
                    resp = message.save_blob(sha1:opts.uuid, error:err)
                    @dbg("handle_blob: error! -- #{err}")
                else
                    resp = message.save_blob(sha1:opts.uuid, ttl:ttl)

                @local_hub_socket  (err,socket) =>
                     socket.write_mesg('json', resp)

    # Connection to the remote local_hub daemon that we use for control.
    local_hub_socket: (cb) =>
        if @_socket?
            @dbg("local_hub_socket: re-using existing socket")
            cb(undefined, @_socket)
            return

        if @_local_hub_socket_connecting
            @_local_hub_socket_queue.push(cb)
            @dbg("local_hub_socket: added socket request to existing queue, which now has length #{@_local_hub_socket_queue.length}")
            return
        @_local_hub_socket_connecting = true
        @_local_hub_socket_queue = [cb]
        connecting_timer = undefined

        cancel_connecting = () =>
            @_local_hub_socket_connecting = false
            @_local_hub_socket_queue = []
            clearTimeout(connecting_timer)

        # If below fails for 20s for some reason, cancel everything to allow for future attempt.
        connecting_timer = setTimeout(cancel_connecting, 20000)

        @dbg("local_hub_socket: getting new socket")
        @new_socket (err, socket) =>
            @_local_hub_socket_connecting = false
            @dbg("local_hub_socket: new_socket returned #{err}")
            if err
                for c in @_local_hub_socket_queue
                    c(err)
            else
                socket.on 'mesg', (type, mesg) =>
                    switch type
                        when 'blob'
                            @handle_blob(mesg)
                        when 'json'
                            @handle_mesg(mesg)

                socket.on('end', @free_resources)
                socket.on('close', @free_resources)
                socket.on('error', @free_resources)

                for c in @_local_hub_socket_queue
                    c(undefined, socket)

                @_socket = socket
            cancel_connecting()

    # Get a new connection to the local_hub,
    # authenticated via the secret_token, and enhanced
    # to be able to send/receive json and blob messages.
    new_socket: (cb) =>     # cb(err, socket)
        @dbg("new_socket")
        f = (cb) =>
            connect_to_a_local_hub
                port         : @address.port
                host         : @address.host
                secret_token : @address.secret_token
                cb           : cb
        socket = undefined
        async.series([
            (cb) =>
                if not @address?
                    @dbg("get address of a working local hub")
                    @project (err, project) =>
                        if err
                            cb(err)
                        else
                            @dbg("get address")
                            project.address
                                cb : (err, address) =>
                                    @address = address; cb(err)
                else
                    cb()
            (cb) =>
                @dbg("try to connect to local hub socket using last known address")
                f (err, _socket) =>
                    if not err
                        socket = _socket
                        cb()
                    else
                        @dbg("failed so get address of a working local hub")
                        @project (err, project) =>
                            if err
                                cb(err)
                            else
                                @dbg("get address")
                                project.address
                                    cb : (err, address) =>
                                        @address = address; cb(err)
            (cb) =>
                if not socket?
                    @dbg("still don't have our connection -- try again")
                    f (err, _socket) =>
                       socket = _socket; cb(err)
                else
                    cb()
        ], (err) =>
            cb(err, socket)
        )

    remove_multi_response_listener: (id) =>
        delete @_multi_response[id]

    call: (opts) =>
        opts = defaults opts,
            mesg           : required
            timeout        : undefined  # NOTE: a nonzero timeout MUST be specified, or we will not even listen for a response from the local hub!  (Ensures leaking listeners won't happen.)
            multi_response : false   # if true, timeout ignored; call @remove_multi_response_listener(mesg.id) to remove
            cb             : undefined
        @dbg("call")
        if not opts.mesg.id?
            if opts.timeout or opts.multi_response   # opts.timeout being undefined or 0 both mean "don't do it"
                opts.mesg.id = uuid.v4()

        @local_hub_socket (err, socket) =>
            if err
                @dbg("call: failed to get socket -- #{err}")
                opts.cb?(err)
                return
            @dbg("call: get socket -- now writing message to the socket -- #{misc.trunc(misc.to_json(opts.mesg),200)}")
            socket.write_mesg 'json', opts.mesg, (err) =>
                if err
                    @free_resources()   # at least next time it will get a new socket
                    opts.cb?(err)
                    return
                if opts.multi_response
                    @_multi_response[opts.mesg.id] = opts.cb
                else if opts.timeout
                    socket.recv_mesg
                        type    : 'json'
                        id      : opts.mesg.id
                        timeout : opts.timeout
                        cb      : (mesg) =>
                            @dbg("call: received message back")
                            if mesg.event == 'error'
                                opts.cb(mesg.error)
                            else
                                opts.cb(false, mesg)

    ####################################################
    # Session management
    #####################################################

    _open_session_socket: (opts) =>
        opts = defaults opts,
            client_id    : required
            session_uuid : required
            type         : required  # 'sage', 'console'
            params       : required
            project_id   : required
            timeout      : 10
            cb           : required  # cb(err, socket)
        @dbg("_open_session_socket")
        # We do not currently have an active open socket connection to this session.
        # We make a new socket connection to the local_hub, then
        # send a connect_to_session message, which will either
        # plug this socket into an existing session with the given session_uuid, or
        # create a new session with that uuid and plug this socket into it.

        key = "#{opts.session_uuid}:#{opts.client_id}"
        socket = @_sockets[key]
        if socket?
            try
                winston.debug("ending local_hub socket for #{key}")
                socket.end()
            catch e
                @dbg("_open_session_socket: exception ending existing socket: #{e}")
            delete @_sockets[key]

        socket = undefined
        async.series([
            (cb) =>
                @dbg("_open_session_socket: getting new socket connection to a local_hub")
                @new_socket (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        @_sockets[key] = socket
                        if not @_sockets_by_client_id[opts.client_id]?
                            @_sockets_by_client_id[opts.client_id] = [socket]
                        else
                            @_sockets_by_client_id[opts.client_id].push(socket)
                        cb()
            (cb) =>
                mesg = message.connect_to_session
                    id           : uuid.v4()   # message id
                    type         : opts.type
                    project_id   : opts.project_id
                    session_uuid : opts.session_uuid
                    params       : opts.params
                @dbg("_open_session_socket: send the message asking to be connected with a #{opts.type} session.")
                socket.write_mesg('json', mesg)
                # Now we wait for a response for opt.timeout seconds
                f = (type, resp) =>
                    clearTimeout(timer)
                    #@dbg("Getting #{opts.type} session -- get back response type=#{type}, resp=#{to_json(resp)}")
                    if resp.event == 'error'
                        cb(resp.error)
                    else
                        if opts.type == 'console'
                            # record the history, truncating in case the local_hub sent something really long (?)
                            if resp.history?
                                socket.history = resp.history.slice(resp.history.length - 100000)
                            else
                                socket.history = ''
                            # Console -- we will now only use this socket for binary communications.
                            misc_node.disable_mesg(socket)
                        cb()
                socket.once('mesg', f)
                timed_out = () =>
                    socket.removeListener('mesg', f)
                    socket.end()
                    cb("Timed out after waiting #{opts.timeout} seconds for response from #{opts.type} session server. Please try again later.")
                timer = setTimeout(timed_out, opts.timeout*1000)

        ], (err) =>
            if err
                @dbg("_open_session_socket: error getting a socket -- (declaring total disaster) -- #{err}")
                # This @_socket.destroy() below is VERY important, since just deleting the socket might not send this,
                # and the local_hub -- if the connection were still good -- would have two connections
                # with the global hub, thus doubling sync and broadcast messages.  NOT GOOD.
                @_socket?.destroy()
                delete @_status; delete @_socket
            else if socket?
                opts.cb(false, socket)
        )

    # Connect the client with a console session, possibly creating a session in the process.
    console_session: (opts) =>
        opts = defaults opts,
            client       : required
            project_id   : required
            params       : {command: 'bash'}
            session_uuid : undefined   # if undefined, a new session is created; if defined, connect to session or get error
            cb           : required    # cb(err, [session_connected message])
        @dbg("console_session: connect client to console session -- session_uuid=#{opts.session_uuid}")

        # Connect to the console server
        if not opts.session_uuid?
            # Create a new session
            opts.session_uuid = uuid.v4()

        @_open_session_socket
            client_id    : opts.client.id
            session_uuid : opts.session_uuid
            project_id   : opts.project_id
            type         : 'console'
            params       : opts.params
            cb           : (err, console_socket) =>
                if err
                    opts.cb(err)
                    return

                console_socket._ignore = false
                console_socket.on 'end', () =>
                    winston.debug("console_socket (session_uuid=#{opts.session_uuid}): received 'end' so setting ignore=true")
                    console_socket._ignore = true
                    delete @_sockets[opts.session_uuid]

                # Plug the two consoles together
                #
                # client --> console:
                # Create a binary channel that the client can use to write to the socket.
                # (This uses our system for multiplexing JSON and multiple binary streams
                #  over one single connection.)
                recently_sent_reconnect = false
                #winston.debug("installing data handler -- ignore='#{console_socket._ignore}")
                channel = opts.client.register_data_handler (data) =>
                    #winston.debug("handling data -- ignore='#{console_socket._ignore}")
                    if not console_socket._ignore
                        console_socket.write(data)
                        @update_host()
                    else
                        # send a reconnect message, but at most once every 5 seconds.
                        if not recently_sent_reconnect
                            recently_sent_reconnect = true
                            setTimeout( (()=>recently_sent_reconnect=false), 5000 )
                            winston.debug("console -- trying to write to closed console_socket with session_uuid=#{opts.session_uuid}")
                            opts.client.push_to_client(message.session_reconnect(session_uuid:opts.session_uuid))

                mesg = message.session_connected
                    session_uuid : opts.session_uuid
                    data_channel : channel
                    history      : console_socket.history

                delete console_socket.history  # free memory occupied by history, which we won't need again.
                opts.cb(false, mesg)

                # console --> client:
                # When data comes in from the socket, we push it on to the connected
                # client over the channel we just created.
                f = (data) ->
                    # Never push more than 20000 characters at once to client, since display is slow, etc.
                    if data.length > 20000
                        data = "[...]" + data.slice(data.length - 20000)
                    #winston.debug("push_data_to_client('#{data}')")
                    opts.client.push_data_to_client(channel, data)
                console_socket.on('data', f)

    terminate_session: (opts) =>
        opts = defaults opts,
            session_uuid : required
            project_id   : required
            cb           : undefined
        @dbg("terminate_session")
        @call
            mesg :
                message.terminate_session
                    session_uuid : opts.session_uuid
                    project_id   : opts.project_id
            timeout : 30
            cb      : opts.cb

    # Read a file from a project into memory on the hub.  This is
    # used, e.g., for client-side editing, worksheets, etc.  This does
    # not pull the file from the database; instead, it loads it live
    # from the project_server virtual machine.
    read_file: (opts) => # cb(err, content_of_file)
        {path, project_id, archive, cb} = defaults opts,
            path       : required
            project_id : required
            archive    : 'tar.bz2'   # for directories; if directory, then the output object "data" has data.archive=actual extension used.
            cb         : required
        @dbg("read_file '#{path}'")
        socket    = undefined
        id        = uuid.v4()
        data      = undefined
        data_uuid = undefined
        result_archive   = undefined

        async.series([
            # Get a socket connection to the local_hub.
            (cb) =>
                @local_hub_socket (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
            (cb) =>
                socket.write_mesg 'json', message.read_file_from_project(id:id, project_id:project_id, path:path, archive:archive)
                socket.recv_mesg type:'json', id:id, timeout:60, cb:(mesg) =>
                    switch mesg.event
                        when 'error'
                            cb(mesg.error)
                        when 'file_read_from_project'
                            data_uuid = mesg.data_uuid
                            result_archive = mesg.archive
                            cb()
                        else
                            cb("Unknown mesg event '#{mesg.event}'")

            (cb) =>
                socket.recv_mesg type: 'blob', id:data_uuid, timeout:60, cb:(_data) =>
                    data = _data
                    data.archive = result_archive
                    cb()

        ], (err) =>
            if err
                cb(err)
            else
                cb(false, data)
        )

    # Write a file
    write_file: (opts) => # cb(err)
        {path, project_id, cb, data} = defaults opts,
            path       : required
            project_id : required
            data       : required   # what to write
            cb         : required
        @dbg("write_file '#{path}'")
        socket    = undefined
        id        = uuid.v4()
        data_uuid = uuid.v4()

        async.series([
            (cb) =>
                @local_hub_socket (err, _socket) =>
                    if err
                        cb(err)
                    else
                        socket = _socket
                        cb()
            (cb) =>
                mesg = message.write_file_to_project
                    id         : id
                    project_id : project_id
                    path       : path
                    data_uuid  : data_uuid
                socket.write_mesg 'json', mesg
                socket.write_mesg 'blob', {uuid:data_uuid, blob:data}
                cb()

            (cb) =>
                socket.recv_mesg type: 'json', id:id, timeout:10, cb:(mesg) =>
                    switch mesg.event
                        when 'file_written_to_project'
                            cb()
                        when 'error'
                            cb(mesg.error)
                        else
                            cb("Unexpected message type '#{mesg.event}'")
        ], cb)


##############################
# Projects
##############################

# Create a project object that is connected to a local hub (using
# appropriate port and secret token), login, and enhance socket
# with our message protocol.

_project_cache = {}
new_project = (project_id) ->
    P = _project_cache[project_id]
    if not P?
        P = new Project(project_id)
        _project_cache[project_id] = P
    P.local_hub.update_host()
    return P

class Project
    constructor: (@project_id) ->
        @dbg("instantiating Project class")
        @local_hub = new_local_hub(@project_id)
        # we always look this up and cache it; it can be useful, e.g., in
        # the activity table.
        @get_info()

    dbg: (m) =>
        winston.debug("project(#{@project_id}): #{m}")

    _fixpath: (obj) =>
        if obj? and @local_hub?
            if obj.path?
                if obj.path[0] != '/'
                    obj.path = @local_hub.path+ '/' + obj.path
            else
                obj.path = @local_hub.path

    owner: (cb) =>
        database.get_project_data
            project_id : @project_id
            columns : ['account_id']
            cb      : (err, result) =>
                if err
                    cb(err)
                else
                    cb(err, result[0])

    # get latest info about project from database
    get_info: (cb) =>
        database.get_project_data
            project_id : @project_id
            objectify  : true
            columns    : cass.PROJECT_COLUMNS
            cb         : (err, result) =>
                if err
                    cb?(err)
                else
                    @cached_info = result
                    cb?(undefined, result)

    call: (opts) =>
        opts = defaults opts,
            mesg    : required
            multi_response : false
            timeout : 15
            cb      : undefined
        #@dbg("call")
        @_fixpath(opts.mesg)
        opts.mesg.project_id = @project_id
        @local_hub.call(opts)

    jupyter_port: (opts) =>
        opts = defaults opts,
            cb : required
        @dbg("jupyter_port")
        @call
            mesg    : message.jupyter_port()
            timeout : 30
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    @dbg("jupyter_port -- #{resp.port}")
                    opts.cb(undefined, resp.port)

    # Set project as deleted (which sets a flag in the database)
    delete_project: (opts) =>
        opts = defaults opts,
            cb : undefined
        @dbg("delete_project")
        async.series([
            (cb) =>
                database.delete_project
                    project_id : @project_id
                    cb         : cb
            (cb) =>
                # this frees up disk space but doesn't permanently
                # delete project from cloud storage (that needs to
                # be implemented as a different step using destroy).
                @local_hub.close(cb)
        ], opts.cb)

    move_project: (opts) =>
        opts = defaults opts,
            target : undefined   # optional prefered target
            cb : undefined
        @dbg("move_project")
        @local_hub.move(opts)

    undelete_project: (opts) =>
        opts = defaults opts,
            cb : undefined
        @dbg("undelete_project")
        database.undelete_project
            project_id : @project_id
            cb         : opts.cb

    hide_project_from_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        @dbg("hide_project_from_user")
        database.hide_project_from_user
            account_id : opts.account_id
            project_id : @project_id
            cb         : opts.cb

    unhide_project_from_user: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        @dbg("unhide_project_from_user")
        database.unhide_project_from_user
            account_id : opts.account_id
            project_id : @project_id
            cb         : opts.cb

    # Get current session information about this project.
    session_info: (cb) =>
        @dbg("session_info")
        @call
            message : message.project_session_info(project_id:@project_id)
            cb : cb

    read_file: (opts) =>
        @dbg("read_file")
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.read_file(opts)

    write_file: (opts) =>
        @dbg("write_file")
        @_fixpath(opts)
        opts.project_id = @project_id
        @local_hub.write_file(opts)

    console_session: (opts) =>
        @dbg("console_session")
        @_fixpath(opts.params)
        opts.project_id = @project_id
        @local_hub.console_session(opts)

    terminate_session: (opts) =>
        opts = defaults opts,
            session_uuid : required
            cb           : undefined
        @dbg("terminate_session")
        opts.project_id = @project_id
        @local_hub.terminate_session(opts)


########################################
# Permissions related to projects
########################################

user_owns_project = (opts) ->
    opts = defaults opts,
        project_id : required
        account_id : required
        cb         : required         # input: (error, result) where if defined result is true or false
    opts.groups = ['owner']
    database.user_is_in_project_group(opts)

user_is_in_project_group = (opts) ->
    opts = defaults opts,
        project_id     : required
        account_id     : undefined
        account_groups : undefined
        groups         : required
        consistency    : cql.types.consistencies.one
        cb             : required        # cb(err, true or false)
    dbg = (m) -> winston.debug("user_is_in_project_group -- #{m}")
    dbg()
    if not opts.account_id?
        dbg("not logged in, so for now we just say 'no' -- this may change soon.")
        opts.cb(undefined, false) # do not have access
        return

    access = false
    async.series([
        (cb) ->
            dbg("check if admin or in appropriate group -- #{misc.to_json(opts.account_groups)}")
            if opts.account_groups? and 'admin' in opts.account_groups  # check also done below!
                access = true
                cb()
            else
                database.user_is_in_project_group
                    project_id     : opts.project_id
                    account_id     : opts.account_id
                    groups         : opts.groups
                    consistency    : cql.types.consistencies.one
                    cb             : (err, x) ->
                        access = x
                        cb(err)
        (cb) ->
            if access
                cb() # done
            else if opts.account_groups?
                # already decided above
                cb()
            else
                # User does not have access in normal way and account_groups not provided, so
                # we do an extra group check before denying user.
                database.get_account
                    columns    : ['groups']
                    account_id : opts.account_id
                    cb         : (err, r) ->
                        if err
                            cb(err)
                        else
                            access = 'admin' in r['groups']
                            cb()
        ], (err) ->
            dbg("done with tests -- now access=#{access}, err=#{err}")
            opts.cb(err, access)
        )

user_has_write_access_to_project = (opts) ->
    opts.groups = ['owner', 'collaborator']
    user_is_in_project_group(opts)

user_has_read_access_to_project = (opts) ->
    # Read access is granted if user is in any of the groups listed below (owner, collaborator, or *viewer*).
    #dbg = (m) -> winston.debug("user_has_read_access_to_project #{opts.project_id}, #{opts.account_id}; #{m}")
    main_cb = opts.cb
    done = false
    async.parallel([
        (cb)->
            opts.groups = ['owner', 'collaborator', 'viewer']
            opts.cb = (err, in_group) ->
                if err
                    cb(err)
                else
                    if not done and in_group
                        #dbg("yes, since in group")
                        done = true
                        main_cb(undefined, true)
                    cb()
            user_is_in_project_group(opts)
    ], (err) ->
        #dbg("nope, since neither in group nor public")
        if not done
            done = true
            main_cb(err, false)
    )

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
generate_hash = (algorithm, salt, iterations, password) ->
    iterations = iterations || 1
    hash = password
    for i in [1..iterations]
        hash = crypto.createHmac(algorithm, salt).update(hash).digest('hex')
    return algorithm + '$' + salt + '$' + iterations + '$' + hash

exports.password_hash = password_hash = (password) ->
    return password_hash_library.generate(password,
        algorithm  : HASH_ALGORITHM
        saltLength : HASH_SALT_LENGTH
        iterations : HASH_ITERATIONS   # This blocks the server for about 10 milliseconds...
    )

reset_password = (email_address, cb) ->
    read = require('read')
    passwd0 = passwd1 = undefined
    account_id = undefined
    async.series([
        (cb) ->
            connect_to_database(cb)
        (cb) ->
            database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (err, data) ->
                    if err
                        cb(err)
                    else
                        account_id = data.account_id
                        cb()
        (cb) ->
            read {prompt:'Password: ', silent:true}, (err, passwd) ->
                passwd0 = passwd; cb(err)
        (cb) ->
            read {prompt:'Retype password: ', silent:true}, (err, passwd) ->
                if err
                    cb(err)
                else
                    passwd1 = passwd
                    if passwd1 != passwd0
                        cb("Passwords do not match.")
                    else
                        cb()
        (cb) ->
            # change the user's password in the database.
            database.change_password
                account_id    : account_id
                password_hash : password_hash(passwd0)
                cb            : cb
    ], (err) ->
        if err
            winston.debug("Error -- #{err}")
        else
            winston.debug("Password changed for #{email_address}")
        cb?()
    )


# Password checking.  opts.cb(false, true) if the
# password is correct, opts.cb(true) on error (e.g., loading from
# database), and opts.cb(false, false) if password is wrong.  You must
# specify exactly one of password_hash, account_id, or email_address.
# In case you specify password_hash, in addition to calling the
# callback (if specified), this function also returns true if the
# password is correct, and false otherwise; it can do this because
# there is no async IO when the password_hash is specified.
is_password_correct = (opts) ->
    opts = defaults opts,
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
        database.get_account
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


########################################
# Account Management
########################################

password_crack_time = (password) -> Math.floor(zxcvbn.zxcvbn(password).crack_time/(3600*24.0)) # time to crack in days

#############################################################################
# User sign in
#
# Anti-DOS cracking throttling policy is basically like this, except we reset the counters
# each minute and hour, so a crafty attacker could get twice as many tries by finding the
# reset interval and hitting us right before and after.  This is an acceptable tradeoff
# for making the data structure trivial.
#
#   * POLICY 1: A given email address is allowed at most 3 failed login attempts per minute.
#   * POLICY 2: A given email address is allowed at most 30 failed login attempts per hour.
#   * POLICY 3: A given ip address is allowed at most 10 failed login attempts per minute.
#   * POLICY 4: A given ip address is allowed at most 50 failed login attempts per hour.
#############################################################################
sign_in_fails = {email_m:{}, email_h:{}, ip_m:{}, ip_h:{}}

clear_sign_in_fails_m = () ->
    sign_in_fails.email_m = {}
    sign_in_fails.ip_m = {}

clear_sign_in_fails_h = () ->
    sign_in_fails.email_h = {}
    sign_in_fails.ip_h = {}

_sign_in_fails_intervals = undefined

record_sign_in_fail = (opts) ->
    {email, ip} = defaults opts,
        email : required
        ip    : required
    if not _sign_in_fails_intervals?
        # only start clearing if there has been a failure...
        _sign_in_fails_intervals = [setInterval(clear_sign_in_fails_m, 60000), setInterval(clear_sign_in_fails_h, 60*60000)]

    winston.debug("WARNING: record_sign_in_fail(#{email}, #{ip})")
    s = sign_in_fails
    if not s.email_m[email]?
        s.email_m[email] = 0
    if not s.ip_m[ip]?
        s.ip_m[ip] = 0
    if not s.email_h[email]?
        s.email_h[email] = 0
    if not s.ip_h[ip]?
        s.ip_h[ip] = 0
    s.email_m[email] += 1
    s.email_h[email] += 1
    s.ip_m[ip] += 1
    s.ip_h[ip] += 1
    ### old database approach
        database.update
            table       : 'failed_sign_ins_by_ip_address'
            set         : {email_address:opts.email_address}
            where       : {time:cass.now(), ip_address:opts.ip_address}
            consistency : cql.types.consistencies.one
        database.update
            table       : 'failed_sign_ins_by_email_address'
            set         : {ip_address:opts.ip_address}
            where       : {time:cass.now(), email_address:opts.email_address}
            consistency : cql.types.consistencies.one

    ###

sign_in_check = (opts) ->
    {email, ip} = defaults opts,
        email : required
        ip    : required
    s = sign_in_fails
    if s.email_m[email] > 3
        # A given email address is allowed at most 3 failed login attempts per minute
        return "Wait a minute, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    if s.email_h[email] > 30
        # A given email address is allowed at most 30 failed login attempts per hour.
        return "Wait an hour, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    if s.ip_m[ip] > 10
        # A given ip address is allowed at most 10 failed login attempts per minute.
        return "Wait a minute, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    if s.ip_h[ip] > 50
        # A given ip address is allowed at most 50 failed login attempts per hour.
        return "Wait an hour, then try to login again.  If you can't remember your password, reset it or email help@sagemath.com."
    return false

sign_in = (client, mesg, cb) ->
    dbg = (m) -> winston.debug("sign_in(#{mesg.email_address}): #{m}")
    dbg()
    tm = misc.walltime()

    sign_in_error = (error) ->
        dbg("sign_in_error -- #{error}")
        record_sign_in
            ip_address    : client.ip_address
            successful    : false
            email_address : mesg.email_address
            account_id    : account?.account_id
        client.push_to_client(message.sign_in_failed(id:mesg.id, email_address:mesg.email_address, reason:error))
        cb?(error)

    if not mesg.email_address
        sign_in_error("Empty email address.")
        return

    if not mesg.password
        sign_in_error("Empty password.")
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    m = sign_in_check
        email : mesg.email_address
        ip    : client.ip_address
    if m
        sign_in_error("sign_in_check fail(ip=#{client.ip_address}): #{m}")
        return

    signed_in_mesg = undefined
    account = undefined
    async.series([
        (cb) ->
            dbg("get account and check credentials")
            # NOTE: Despite people complaining, we do give away info about whether
            # the e-mail address is for a valid user or not.
            # There is no security in not doing this, since the same information
            # can be determined via the invite collaborators feature.
            database.get_account
                email_address : mesg.email_address
                columns       : ['password_hash', 'account_id', 'passports']
                cb            : (err, _account) ->
                    if err
                        cb(err)
                    else
                        account = _account
                        cb()
        (cb) ->
            dbg("got account; now checking if password is correct...")
            is_password_correct
                account_id    : account.account_id
                password      : mesg.password
                password_hash : account.password_hash
                cb            : (err, is_correct) ->
                    if err
                        cb("Error checking correctness of password -- #{err}")
                        return
                    if not is_correct
                        if not account.password_hash
                            cb("The account #{mesg.email_address} exists but doesn't have a password. Either set your password by clicking 'Forgot your password?' or log in using #{misc.keys(account.passports).join(', ')}.  If that doesn't work, email help@sagemath.com and we will sort this out.")
                        else
                            cb("Incorrect password for #{mesg.email_address}.  You can reset your password by clicking the 'Forgot your password?' link.   If that doesn't work, email help@sagemath.com and we will sort this out.")
                    else
                        cb()
        # remember me
        (cb) ->
            if mesg.remember_me
                dbg("remember_me -- setting the remember_me cookie")
                signed_in_mesg = message.signed_in
                    id            : mesg.id
                    account_id    : account.account_id
                    email_address : mesg.email_address
                    remember_me   : false
                    hub           : program.host + ':' + program.port
                client.remember_me
                    account_id    : signed_in_mesg.account_id
                    email_address : signed_in_mesg.email_address
                    cb            : cb
            else
                cb()
    ], (err) ->
        if err
            dbg("send error to user (in #{misc.walltime(tm)}seconds) -- #{err}")
            sign_in_error(err)
            cb?(err)
        else
            dbg("user got signed in fine (in #{misc.walltime(tm)}seconds) -- sending them a message")
            client.signed_in(signed_in_mesg)
            client.push_to_client(signed_in_mesg)
            cb?()
    )


# Record to the database a failed and/or successful login attempt.
record_sign_in = (opts) ->
    opts = defaults opts,
        ip_address    : required
        successful    : required
        email_address : undefined
        account_id    : undefined
        remember_me   : false
    if not opts.successful
        record_sign_in_fail
            email : opts.email_address
            ip    : opts.ip_address
    else
        database.update
            table       : 'successful_sign_ins'
            set         : {ip_address:opts.ip_address, email_address:opts.email_address, remember_me:opts.remember_me}
            where       : {time:cass.now(), account_id:opts.account_id}
            consistency : cql.types.consistencies.one



# We cannot put the zxcvbn password strength checking in
# client.coffee since it is too big (~1MB).  The client
# will async load and use this, of course, but a broken or
# *hacked* client might not properly verify this, so we
# do it in the server too.  NOTE: I tested Dropbox and
# they have a GUI to warn against week passwords, but still
# allow them anyways!
zxcvbn = require('../static/zxcvbn/zxcvbn')  # this require takes about 100ms!


# Current policy is to allow all but trivial passwords for user convenience.
# To change this, just increase this number.
MIN_ALLOWED_PASSWORD_STRENGTH = 1

is_valid_password = (password) ->
    [valid, reason] = client_lib.is_valid_password(password)
    if not valid
        return [valid, reason]
    password_strength = zxcvbn.zxcvbn(password)  # note -- this is synchronous (but very fast, I think)
    #winston.debug("password strength = #{password_strength}")
    if password_strength.score < MIN_ALLOWED_PASSWORD_STRENGTH
        return [false, "Choose a password that isn't very weak."]
    return [true, '']




create_account = (client, mesg, cb) ->
    id = mesg.id
    account_id = null
    dbg = (m) -> winston.debug("create_account (#{mesg.email_address}): #{m}")
    tm = misc.walltime()
    if mesg.email_address?
        mesg.email_address = misc.lower_email_address(mesg.email_address)
    async.series([
        (cb) ->
            dbg("run tests on generic validity of input")
            issues = client_lib.issues_with_create_account(mesg)

            # Do not allow *really* stupid passwords.
            [valid, reason] = is_valid_password(mesg.password)
            if not valid
                issues['password'] = reason

            # TODO -- only uncomment this for easy testing to allow any password choice.
            # the client test suite will then fail, which is good, so we are reminded to comment this out before release!
            # delete issues['password']

            if misc.len(issues) > 0
                cb(issues)
            else
                cb()

        # make sure this ip address hasn't requested more than 5000
        # accounts in the last 6 hours (just to avoid really nasty
        # evils, but still allow for demo registration behind a wifi
        # router -- say)
        (cb) ->
            dbg("ip_tracker test")
            ip_tracker = database.key_value_store(name:'create_account_ip_tracker')
            ip_tracker.get
                key : client.ip_address
                cb  : (error, value) ->
                    if error
                        cb({'other':"Internal error creating account -- #{error}.  Please try later."})
                        return
                    if not value?
                        ip_tracker.set(key: client.ip_address, value:1, ttl:3600)
                        cb()
                    else if value < 1000
                        ip_tracker.set(key: client.ip_address, value:value+1, ttl:3600)
                        cb()
                    else # bad situation
                        database.log
                            event : 'create_account'
                            value : {ip_address:client.ip_address, reason:'too many requests'}
                        cb({'other':"There were too many account creation requests from the ip address #{client.ip_address} in the last hour."})

        (cb) ->
            dbg("query database to determine whether the email address is available")
            database.is_email_address_available mesg.email_address, (error, available) ->
                if error
                    cb({'other':"Unable to create account.  Please try later."})
                else if not available
                    cb({email_address:"This e-mail address is already taken."})
                else
                    cb()

        #(cb) ->
        #    dbg("check that account is not banned")
        #    database.is_banned_user
        #        email_address : mesg.email_address
        #        cb            : (err, is_banned) ->
        #            if err
        #                cb({'other':"Unable to create account.  Please try later."})
        #            else if is_banned
        #                cb({email_address:"This e-mail address is banned."})
        #            else
        #                cb()

        (cb) ->
            dbg("check if a registration token is required")
            database.key_value_store(name:'global_admin_settings').get
                key : 'account_creation_token'
                cb  : (err, token) =>
                    if not token
                        cb()
                    else
                        if token != mesg.token
                            cb({token:"Incorrect registration token."})
                        else
                            cb()

        (cb) ->
            dbg("create new account")
            database.create_account
                first_name:    mesg.first_name
                last_name:     mesg.last_name
                email_address: mesg.email_address
                password_hash: password_hash(mesg.password)
                cb: (error, result) ->
                    if error
                        cb({'other':"Unable to create account right now.  Please try later."})
                    else
                        account_id = result
                        database.log
                            event : 'create_account'
                            value :
                                account_id : account_id
                                first_name : mesg.first_name
                                last_name  : mesg.last_name
                                email_address : mesg.email_address
                        cb()

        (cb) ->
            dbg("check for account creation actions")
            account_creation_actions
                email_address : mesg.email_address
                account_id    : account_id
                cb            : cb

        (cb) ->
            dbg("set remember_me cookie...")
            # so that proxy server will allow user to connect and
            # download images, etc., the very first time right after they make a new account.
            client.remember_me
                email_address : mesg.email_address
                account_id    : account_id
                cb            : cb
    ], (reason) ->
        if reason
            dbg("send message to user that there was an error (in #{misc.walltime(tm)}seconds) -- #{misc.to_json(reason)}")
            client.push_to_client(message.account_creation_failed(id:id, reason:reason))
            cb?("error creating account -- #{misc.to_json(reason)}")
        else
            dbg("send message back to user that they are logged in as the new user (in #{misc.walltime(tm)}seconds)")
            mesg1 = message.signed_in
                id            : mesg.id
                account_id    : account_id
                email_address : mesg.email_address
                first_name    : mesg.first_name
                last_name     : mesg.last_name
                remember_me   : false
                hub           : program.host + ':' + program.port
            client.signed_in(mesg1)
            client.push_to_client(mesg1)
            cb?()
    )




account_creation_actions = (opts) ->
    opts = defaults opts,
        email_address : required
        account_id    : required
        cb            : required
    winston.debug("account_creation_actions for #{opts.email_address}")
    database.account_creation_actions
        email_address : opts.email_address
        cb            : (err, actions) ->
            if err
                opts.cb(err); return
            f = (action, cb) ->
                winston.debug("account_creation_actions: action = #{misc.to_json(action)}")
                if action.action == 'add_to_project'
                    database.add_user_to_project
                        project_id : action.project_id
                        account_id : opts.account_id
                        group      : action.group
                        cb         : (err) =>
                            if err
                                winston.debug("Error adding user to project: #{err}")
                            cb(err)
                else
                    # TODO: need to report this some better way, maybe email?
                    winston.debug("skipping unknown action -- #{action.action}")
                    cb()
            async.map(actions, f, (err) -> opts.cb(err))

run_all_account_creation_actions = (cb) ->
    dbg = (m) -> winston.debug("all_account_creation: #{m}")

    email_addresses = undefined
    users           = undefined

    async.series([
        (cb) ->
            dbg("connect to database...")
            connect_to_database(cb)
        (cb) ->
            dbg("get all email addresses in the account creation actions table")
            database.select
                table   : 'account_creation_actions'
                columns : ['email_address']
                cb      : (err, results) ->
                    if err
                        cb(err)
                    else
                        dbg("got #{results.length} creation actions from database")
                        email_addresses = (x[0] for x in results)
                        cb()
        (cb) ->
            dbg("for each action, determine if the account has been created (most probably won't be) and get account_id")
            database.select
                table     : 'email_address_to_account_id'
                columns   : ['email_address', 'account_id']
                where     : {email_address:{'in':email_addresses}}
                objectify : true
                cb        : (err, results) ->
                    if err
                        cb(err)
                    else
                        dbg("got #{results.length} of these accounts have already been created")
                        users = results
                        cb()
        (cb) ->
            dbg("for each of the #{users.length} for which the account has been created, do all the actions")
            i = 0
            f = (user, cb) ->
                i += 1
                dbg("considering user #{i} of #{users.length}")
                account_creation_actions
                    email_address : user.email_address
                    account_id    : user.account_id
                    cb            : cb
            # We use mapSeries instead of map, so that the log output is clearer, and since this is fairly small.
            # We could do it in parallel and be way faster, but not necessary.
            async.mapSeries(users, f, (err) -> cb(err))
    ], cb)


change_password = (mesg, client_ip_address, push_to_client) ->
    account = null
    mesg.email_address = misc.lower_email_address(mesg.email_address)
    async.series([
        # make sure there hasn't been a password change attempt for this
        # email address in the last 5 seconds
        (cb) ->
            tracker = database.key_value_store(name:'change_password_tracker')
            tracker.get
                key : mesg.email_address
                cb : (error, value) ->
                    if error
                        cb()  # DB error, so don't bother with the tracker
                        return
                    if value?  # is defined, so problem -- it's over
                        push_to_client(message.changed_password(id:mesg.id, error:{'too_frequent':'Please wait at least 5 seconds before trying to change your password again.'}))
                        database.log
                            event : 'change_password'
                            value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:"attack?"}
                        cb(true)
                        return
                    else
                        # record change in tracker with ttl (don't care about confirming that this succeeded)
                        tracker.set
                            key   : mesg.email_address
                            value : client_ip_address
                            ttl   : 5
                        cb()

        # get account and validate the password
        (cb) ->
            database.get_account
              email_address : mesg.email_address
              columns       : ['password_hash', 'account_id']
              cb : (error, result) ->
                if error
                    push_to_client(message.changed_password(id:mesg.id, error:{other:error}))
                    cb(true)
                    return
                account = result
                is_password_correct
                    account_id           : result.account_id
                    password             : mesg.old_password
                    password_hash        : account.password_hash
                    allow_empty_password : true
                    cb                   : (err, is_correct) ->
                        if err
                            cb(err)
                        else
                            if not is_correct
                                err = "invalid old password"
                                push_to_client(message.changed_password(id:mesg.id, error:{old_password:err}))
                                database.log
                                    event : 'change_password'
                                    value : {email_address:mesg.email_address, client_ip_address:client_ip_address, message:err}
                                cb(err)
                            else
                                cb()

        # check that new password is valid
        (cb) ->
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                push_to_client(message.changed_password(id:mesg.id, error:{new_password:reason}))
                cb(true)
            else
                cb()

        # record current password hash (just in case?) and that we are changing password and set new password
        (cb) ->
            database.log
                event : "change_password"
                value :
                    account_id : account.account_id
                    client_ip_address : client_ip_address
                    previous_password_hash : account.password_hash

            database.change_password
                account_id    : account.account_id
                password_hash : password_hash(mesg.new_password),
                cb : (error, result) ->
                    if error
                        push_to_client(message.changed_password(id:mesg.id, error:{misc:error}))
                    else
                        push_to_client(message.changed_password(id:mesg.id, error:false)) # finally, success!
                    cb()
    ])

change_email_address = (mesg, client_ip_address, push_to_client) ->

    dbg = (m) -> winston.debug("change_email_address(mesg.account_id, mesg.old_email_address, mesg.new_email_address): #{m}")
    dbg()

    mesg.old_email_address = misc.lower_email_address(mesg.old_email_address)
    mesg.new_email_address = misc.lower_email_address(mesg.new_email_address)

    if mesg.old_email_address == mesg.new_email_address  # easy case
        dbg("easy case -- no change")
        push_to_client(message.changed_email_address(id:mesg.id))
        return

    if not client_lib.is_valid_email_address(mesg.new_email_address)
        dbg("invalid email address")
        push_to_client(message.changed_email_address(id:mesg.id, error:'email_invalid'))
        return

    async.series([
        # Make sure there hasn't been an email change attempt for this
        # email address in the last 5 seconds:
        (cb) ->
            dbg("limit email address change attempts")
            WAIT = 5
            tracker = database.key_value_store(name:'change_email_address_tracker')
            tracker.get(
                key : mesg.old_email_address
                cb : (err, value) ->
                    if err
                        push_to_client(message.changed_email_address(id:mesg.id, error:err))
                        dbg("err: #{err}")
                        cb(err)
                        return
                    if value?  # is defined, so problem -- it's over
                        dbg("limited!")
                        err = "too_frequent"
                        push_to_client(message.changed_email_address(id:mesg.id, error:err, ttl:WAIT))
                        database.log
                            event : 'change_email_address'
                            value : {email_address:mesg.old_email_address, client_ip_address:client_ip_address, message:"attack?"}
                        cb(err)
                        return
                    else
                        # record change in tracker with ttl (don't care about confirming that this succeeded)
                        tracker.set
                            key   : mesg.old_email_address
                            value : client_ip_address
                            ttl   : WAIT    # seconds
                        cb()
            )

        (cb) ->
            dbg("no limit issues, so validate the password")
            is_password_correct
                account_id           : mesg.account_id
                password             : mesg.password
                allow_empty_password : true  # in case account created using a linked passport only
                cb                   : (err, is_correct) ->
                    if err
                        err = "Error checking password -- please try again in a minute -- #{err}."
                        push_to_client(message.changed_email_address(id:mesg.id, error:err))
                        cb(err)
                    else if not is_correct
                        err = "invalid_password"
                        push_to_client(message.changed_email_address(id:mesg.id, error:err))
                        cb(err)
                    else
                        cb()

        # Record current email address (just in case?) and that we are
        # changing email address to the new one.  This will make it
        # easy to implement a "change your email address back" feature
        # if I need to at some point.
        (cb) ->
            dbg("log change to db")

            database.log(event : 'change_email_address', value : {client_ip_address : client_ip_address, old_email_address : mesg.old_email_address, new_email_address : mesg.new_email_address})

            #################################################
            # TODO: At this point, we should send an email to
            # old_email_address with a hash-code that can be used
            # to undo the change to the email address.
            #################################################

            dbg("actually make change in db")
            database.change_email_address
                account_id    : mesg.account_id
                email_address : mesg.new_email_address
                cb : (error, success) ->
                    dbg("db change; got #{error}, #{success}")
                    if error
                        push_to_client(message.changed_email_address(id:mesg.id, error:error))
                    else
                        push_to_client(message.changed_email_address(id:mesg.id)) # finally, success!
                    cb()

        (cb) ->
            # If they just changed email to an address that has some actions, carry those out...
            # TODO: move to hook this only after validation of the email address.
            account_creation_actions
                email_address : mesg.new_email_address
                account_id    : mesg.account_id
                cb            : cb
    ])


#############################################################################
# Send an email message to the given email address with a code that
# can be used to reset the password for a certain account.
#
# Anti-use-salvus-to-spam/DOS throttling policies:
#   * a given email address can be sent at most 30 password resets per hour
#   * a given ip address can send at most 100 password reset request per minute
#   * a given ip can send at most 250 per hour
#############################################################################
forgot_password = (mesg, client_ip_address, push_to_client) ->
    if mesg.event != 'forgot_password'
        push_to_client(message.error(id:mesg.id, error:"Incorrect message event type: #{mesg.event}"))
        return

    # This is an easy check to save work and also avoid empty email_address, which causes CQL trouble.
    if not client_lib.is_valid_email_address(mesg.email_address)
        push_to_client(message.error(id:mesg.id, error:"Invalid email address."))
        return

    mesg.email_address = misc.lower_email_address(mesg.email_address)

    id = null
    async.series([
        # record this password reset attempt in our database
        (cb) ->
            database.update
                table   : 'password_reset_attempts_by_ip_address'
                set     : {email_address:mesg.email_address}
                where   : {ip_address:client_ip_address, time:cass.now()}
                cb      : (error, result) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    else
                        cb()
        (cb) ->
            database.update
                table   : 'password_reset_attempts_by_email_address'
                set     : {ip_address:client_ip_address}
                where   : {email_address:mesg.email_address, time:cass.now()}
                cb      : (error, result) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    else
                        cb()

        # POLICY 1: We limit the number of password resets that an email address can receive
        (cb) ->
            database.count
                table   : "password_reset_attempts_by_email_address"
                where   : {email_address:mesg.email_address, time:{'>=':cass.hours_ago(1)}}
                cb      : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 31
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Will not send more than 30 password resets to #{mesg.email_address} per hour."))
                        cb(true)
                        return
                    cb()

        # POLICY 2: a given ip address can send at most 100 password reset request per minute
        (cb) ->
            database.count
                table   : "password_reset_attempts_by_ip_address"
                where   : {ip_address:client_ip_address,  time:{'>=':cass.hours_ago(1)}}
                cb      : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 101
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Please wait a minute before sending another password reset requests."))
                        cb(true); return
                    cb()


        # POLICY 3: a given ip can send at most 1000 per hour
        (cb) ->
            database.count
                table : "password_reset_attempts_by_ip_address"
                where : {ip_address:client_ip_address, time:{'>=':cass.hours_ago(1)}}
                cb    : (error, count) ->
                    if error
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Database error: #{error}"))
                        cb(true); return
                    if count >= 1001
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"There have been too many password resets.  Wait an hour before sending any more password reset requests."))
                        cb(true); return
                    cb()

        (cb) ->
            database.get_account
                email_address : mesg.email_address
                columns       : ['account_id']   # have to get something
                cb            : (error, account) ->
                    if error # no such account
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"No account with e-mail address #{mesg.email_address}."))
                        cb(true); return
                    else
                        cb()

        # We now know that there is an account with this email address.
        # put entry in the password_reset uuid:value table with ttl of
        # 1 hour, and send an email
        (cb) ->
            id = database.uuid_value_store(name:"password_reset").set(
                value : mesg.email_address
                ttl   : 60*60,
                cb    : (err, results) ->
                    if err
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Internal error generating password reset for #{mesg.email_address} -- #{err}"))
                        cb(err); return
                    else
                        cb()
            )

        # send an email to mesg.email_address that has a link to
        (cb) ->
            body = """
                Hello,

                Somebody just requested to change the password on your SageMathCloud account.
                If you requested this password change, please click this link:

                     https://cloud.sagemath.com#forgot-#{id}

                If you don't want to change your password, ignore this message.

                In case of problems, email help@sagemath.com immediately (or just reply to this email).











                ---
                """

            send_email
                subject : 'SageMathCloud password reset confirmation'
                body    : body
                from    : 'SageMath Help <help@sagemath.com>'
                to      : mesg.email_address
                cb      : (err) ->
                    if err
                        push_to_client(message.forgot_password_response(id:mesg.id, error:"Internal error sending password reset email to #{mesg.email_address} -- #{err}."))
                        cb(true)
                    else
                        push_to_client(message.forgot_password_response(id:mesg.id))
                        cb()
    ])


reset_forgot_password = (mesg, client_ip_address, push_to_client) ->
    if mesg.event != 'reset_forgot_password'
        push_to_client(message.error(id:mesg.id, error:"incorrect message event type: #{mesg.event}"))
        return

    email_address = account_id = db = null

    async.series([
        # check that request is valid
        (cb) ->
            db = database.uuid_value_store(name:"password_reset")
            db.get
                uuid : mesg.reset_code
                cb   : (error, value) ->
                    if error
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:error))
                        cb(true); return
                    if not value?
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:"This password reset request is no longer valid."))
                        cb(true); return
                    email_address = value
                    cb()

        # Verify password is valid and compute its hash.
        (cb) ->
            [valid, reason] = is_valid_password(mesg.new_password)
            if not valid
                push_to_client(message.reset_forgot_password_response(id:mesg.id, error:reason))
                cb(true)
            else
                cb()

        # Get the account_id.
        (cb) ->
            database.get_account
                email_address : email_address
                columns       : ['account_id']
                cb            : (error, account) ->
                    if error
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:error))
                        cb(true)
                    else
                        account_id = account.account_id
                        cb()

        # Make the change
        (cb) ->
            database.change_password
                account_id: account_id
                password_hash : password_hash(mesg.new_password)
                cb : (error, account) ->
                    if error
                        push_to_client(message.reset_forgot_password_response(id:mesg.id, error:error))
                        cb(true)
                    else
                        push_to_client(message.reset_forgot_password_response(id:mesg.id)) # success
                        db.delete(uuid: mesg.reset_code)  # only allow successful use of this reset token once
                        cb()
    ])

# mesg is an account_settings message.  We save everything in the
# message to the database.  The restricted settings are completely
# ignored if mesg.password is not set and correct.
save_account_settings = (mesg, push_to_client) ->
    if mesg.event != 'account_settings'
        push_to_client(message.error(id:mesg.id, error:"Wrong message type: #{mesg.event}"))
        return
    settings = {}
    for key of message.unrestricted_account_settings
        settings[key] = mesg[key]
    database.update_account_settings
        account_id : mesg.account_id
        settings   : settings
        cb         : (error, results) ->
            if error
                push_to_client(message.error(id:mesg.id, error:error))
            else
                push_to_client(message.account_settings_saved(id:mesg.id))


########################################
# User Feedback
########################################
report_feedback = (mesg, push_to_client, account_id) ->
    data = {}  # TODO -- put interesting info here
    database.report_feedback
        account_id  : account_id
        category    : mesg.category
        description : mesg.description
        data        : data
        nps         : mesg.nps
        cb          : (err, results) -> push_to_client(message.feedback_reported(id:mesg.id, error:err))

get_all_feedback_from_user = (mesg, push_to_client, account_id) ->
    if account_id == null
        push_to_client(message.all_feedback_from_user(id:mesg.id, error:true, data:to_json("User not signed in.")))
        return
    database.get_all_feedback_from_user
        account_id  : account_id
        cb          : (err, results) -> push_to_client(message.all_feedback_from_user(id:mesg.id, data:to_json(results), error:err))


########################################
# Blobs
########################################

MAX_BLOB_SIZE = 15000000
MAX_BLOB_SIZE_HUMAN = "15B"

blobs = {}

# increase ttl of a blob in the blobstore database with given misc_node.uuidsha1 hash.
remove_blob_ttls = (opts) ->
    opts = defaults opts,
        uuids : required   # uuid=sha1-based from value; actually *required*, but instead of a traceback, get opts.cb(err)
        cb    : required    # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl

    winston.debug("remove_blob_ttls(uuid=#{misc.trunc(misc.to_json(opts.uuids),300)})")
    database.uuid_blob_store(name:"blobs").set_ttls
        uuids : opts.uuids
        ttl   : 0
        cb    : opts.cb


# save a blob in the blobstore database with given misc_node.uuidsha1 hash.
save_blob = (opts) ->
    opts = defaults opts,
        uuid  : undefined  # uuid=sha1-based from value; actually *required*, but instead of a traceback, get opts.cb(err)
        value : undefined  # actually *required*, but instead of a traceback, get opts.cb(err)
        ttl   : undefined  # object in blobstore will have *at least* this ttl in seconds;
                           # if there is already something, in blobstore with longer ttl, we leave it; undefined = infinite ttl
        check : true       # if true, return an error (via cb) if misc_node.uuidsha1(opts.value) != opts.uuid.
                           # This is a check against bad user-supplied data.
        cb    : required   # cb(err, ttl actually used in seconds); ttl=0 for infinite ttl

    dbg = (m) -> winston.debug("save_blob(uuid=#{opts.uuid}): #{m}")
    dbg()

    if false  # enable this for testing -- HOWEVER, don't do this in production with
              # more than one hub, or things will break in subtle ways (obviously).
        blobs[opts.uuid] = opts.value
        opts.cb()
        return

    err = undefined

    if not opts.value?
        err = "save_blob: UG -- error in call to save_blob (uuid=#{opts.uuid}); received a save_blob request with undefined value"

    else if not opts.uuid?
        err = "save_blob: BUG -- error in call to save_blob; received a save_blob request without corresponding uuid"

    else if opts.value.length > MAX_BLOB_SIZE
        err = "save_blob: blobs are limited to #{MAX_BLOB_SIZE_HUMAN} and you just tried to save one of size #{opts.value.length/1000000}MB"

    else if opts.check and opts.uuid != misc_node.uuidsha1(opts.value)
        err = "save_blob: uuid=#{opts.uuid} must be derived from the Sha1 hash of value, but it is not (possible malicious attack)"

    if err
        dbg(err)
        opts.cb(err)
        return

    # Store the blob in the database, if it isn't there already.
    db = database.uuid_blob_store(name:"blobs")
    db.get_ttl
        uuid : opts.uuid
        cb   : (err, ttl) ->
            if err
                dbg("failed to get ttl -- #{err}")
                opts.cb(err); return
            dbg("got ttl=#{ttl}")
            if ttl? and (ttl == 0 or ttl >= opts.ttl)
                dbg("nothing to store -- done.")
                opts.cb(false, ttl)
            else
                dbg("storing #{opts.value.length/1000}KB blob in the database with new ttl...")
                if not opts.ttl?
                    opts.ttl = 0
                # TODO: on a 12MB blob, I recorded this blocking for 26s in production!
                db.set
                    uuid  : opts.uuid
                    value : opts.value
                    ttl   : opts.ttl
                    cb    : (err) ->
                        if err
                            dbg("failed to store blob -- #{err}")
                        else
                            dbg("successfully stored blob")
                        opts.cb(err, ttl)

get_blob = (opts) ->
    opts = defaults opts,
        uuid        : required
        cb          : required
        max_retries : 5
        # if blob isn't in the database yet, we retry up to max_retries many times, after waiting 300ms for it.
        # We do this since Cassandra is only eventually consistent, and clients can be querying other nodes.
    if false
        opts.cb(false, blobs[opts.uuid])
        winston.debug("get_blob #{opts.uuid}")
        return
    dbg = (m) -> winston.debug("get_blob(uuid=#{opts.uuid}): #{m}")
    dbg()

    database.uuid_blob_store(name:"blobs").get
        uuid : opts.uuid
        cb   : (err, result) ->
            if err
                dbg("database call error getting blob -- #{err}")
                opts.cb(err)
            else if not result? and opts.max_retries >= 1
                dbg("failed to get blob since not available yet and max_retries={opts.max_retries}>=1, so retrying in 300ms.")
                f = () ->
                    get_blob(uuid:opts.uuid, cb:opts.cb, max_retries:opts.max_retries-1)
                setTimeout(f, 300)
            else
                if not result?
                    dbg("no such blob")
                opts.cb(undefined, result)


# For each element of the array blob_ids, remove its ttl.
_make_blobs_permanent_cache = {}
make_blobs_permanent = (opts) ->
    opts = defaults opts,
        blob_ids   : required
        cb         : required
    uuids = (id for id in opts.blob_ids when not _make_blobs_permanent_cache[id]?)
    database.uuid_blob_store(name:"blobs").set_ttls
        uuids : uuids
        ttl   : 0
        cb    : (err) ->
            if not err
                for id in uuids
                    _make_blobs_permanent_cache[id] = true
            opts.cb(err)

########################################
# Compute Sessions (of various types)
########################################
compute_sessions = {}



########################################
# Persistent Sage Sessions
########################################
persistent_sage_sessions = {}

# The walltime and cputime are severly limited for not-logged in users, for now:
SESSION_LIMITS_NOT_LOGGED_IN = {cputime:3*60, walltime:5*60, vmem:2000, numfiles:1000, quota:128}

# The walltime and cputime are not limited for logged in users:
SESSION_LIMITS = {cputime:0, walltime:0, vmem:2000, numfiles:1000, quota:128}



#####################################################################
# SageSession -- a specific Sage process running inside a deployed
# project.  This typically corresponds to a worksheet.
#####################################################################

class SageSession
    constructor : (opts) ->
        opts = defaults opts,
            client       : required
            project_id   : required
            session_uuid : undefined
            cb           : undefined   # cb(err)

        @project_id = opts.project_id

        @clients    = [opts.client]   # start with our 1 *local* client (connected to this particular hub)

        if not opts.session_uuid?
            opts.session_uuid = uuid.v4()
        @session_uuid = opts.session_uuid

        @restart(opts.client, opts.cb)

    # handle incoming messages from sage server
    _recv: (type, mesg) =>
        switch type
            when 'json'
                winston.debug("sage_server --> hub: (session=#{@session_uuid}) #{to_safe_str(mesg)}")
                for client in @clients
                    switch mesg.event
                        when "output", "terminate_session", "execute_javascript"
                            mesg.session_uuid = @session_uuid  # tag with session uuid
                            client.push_to_client(mesg)
                        when "session_description"
                            @pid = mesg.pid
                            @limits = mesg.limits
                            client.push_to_client(message.session_started(id:@_mesg_id, session_uuid:@session_uuid, limits:mesg.limits))
                        else
                            client.push_to_client(mesg)
            when 'blob'
                save_blob
                    uuid  : mesg.uuid
                    value : mesg.blob
                    ttl   : BLOB_TTL  # deleted after this long
                    check : true      # guard against malicious users trying to fake a sha1 hash to goatse somebody else's worksheet
                    cb    : (err, ttl) ->
                        if err
                            winston.debug("Error saving blob for Sage Session -- #{err}")
            else
                raise("unknown message type '#{type}'")


    # add a new client to listen/use this session
    add_client : (client, cb) =>
        for c in @clients
            if c == client
                cb?()  # already known
                return
        mesg = {project_id : @project.project_id, id : uuid.v4() }  # id not used
        client.get_project mesg, 'write', (err, proj) =>
            if err
                cb?(err)
            else
                @clients.push(client)
                cb?()

    is_client: (client) =>
        return client in @clients

    # remove a client from listening/using this session
    remove_client: (client) =>
        @clients = (c for c in @clients if c != client)

    send_signal: (signal) =>
        if @pid? and @conn?
            sage.send_signal
                host         : @host
                port         : @port
                secret_token : @secret_token
                pid          : @pid
                signal       : signal

    kill: () =>
        @send_signal(9)
        @conn?.close()
        @conn = undefined

    send_json: (client, mesg) ->
        winston.debug("hub --> sage_server: #{misc.trunc(to_safe_str(mesg),300)}")
        async.series([
            (cb) =>
                if @conn?
                    cb()
                else
                    @restart(client, cb)
            (cb) =>
                @conn.send_json(mesg)
        ])

    send_blob: (client, uuid, blob) ->
        async.series([
            (cb) =>
                if @conn?
                    cb()
                else
                    @restart(client, cb)
            (cb) =>
                @conn.send_blob(uuid, blob)
        ])

    restart: (client, cb) =>
        winston.debug("Restarting a Sage session...")
        @kill()

        async.series([
            (cb) =>
                winston.debug("Getting project with id #{@project_id}")
                client.get_project {project_id:@project_id}, 'write', (err, project) =>
                    if err
                        cb(err)
                    else
                        @project = project
                        cb()
            (cb) =>
                winston.debug("Ensure that project is opened on a host.")
                @project.local_hub.open (err, port, secret_token) =>
                    if err
                        cb(err)
                    else
                        @port = port
                        @secret_token = secret_token
                        cb()

            (cb) =>
                winston.debug("Make connection to sage server.")
                @conn = new sage.Connection
                    port         : @port
                    secret_token : @secret_token
                    recv         : @_recv
                    cb           : cb

            (cb) =>
                mesg = message.connect_to_session
                    type         : 'sage'
                    project_id   : @project_id
                    session_uuid : @session_uuid
                @conn.send_json(mesg)
                cb()

            (cb) =>
                winston.debug("Registering the session.")
                persistent_sage_sessions[@session_uuid] = @
                compute_sessions[@session_uuid] = @
                if @session_uuid not in client.compute_session_uuids
                    client.compute_session_uuids.push(@session_uuid)
                cb()

        ], (err) => cb?(err))


##########################################
# Stateless Sage Sessions
##########################################
stateless_exec_cache = null

init_stateless_exec = () ->
    stateless_exec_cache = database.key_value_store(name:'stateless_exec')

stateless_sage_exec = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec #{to_safe_str(input_mesg)}")
    exec_nocache = () ->
        output_messages = []
        stateless_sage_exec_nocache(input_mesg,
            (mesg) ->
                if mesg.event == "output"
                    output_messages.push(mesg)
                output_message_callback(mesg)
                if mesg.done and input_mesg.allow_cache
                    winston.info("caching result")
                    stateless_exec_cache.set(key:[input_mesg.code, input_mesg.preparse], value:output_messages)
        )
    if not input_mesg.allow_cache
        exec_nocache()
        return
    stateless_exec_cache.get(key:[input_mesg.code, input_mesg.preparse], cb:(err, output) ->
        if output?
            winston.info("(hub) -- using cache")
            for mesg in output
                mesg.id = input_mesg.id
                output_message_callback(mesg)
        else
            exec_nocache()
    )

stateless_sage_exec_fake = (input_mesg, output_message_callback) ->
    # test mode to eliminate all of the calls to sage_server time/overhead
    output_message_callback({"stdout":eval(input_mesg.code),"done":true,"event":"output","id":input_mesg.id})

stateless_exec_using_server = (input_mesg, output_message_callback, host, port) ->
    sage_conn = new sage.Connection(
        secret_token: secret_token
        port:port
        recv:(type, mesg) ->
            winston.info("(hub) sage_conn -- received message #{to_safe_str(mesg)}")
            if type == 'json'
                output_message_callback(mesg)
            # TODO: maybe should handle 'blob' type?
        cb: ->
            winston.info("(hub) sage_conn -- sage: connected.")
            sage_conn.send_json(message.start_session(limits:{walltime:5, cputime:5, numfiles:1000, vmem:2048}))
            winston.info("(hub) sage_conn -- send: #{to_safe_str(input_mesg)}")
            sage_conn.send_json(input_mesg)
            sage_conn.send_json(message.terminate_session())
    )

# TODO: delete -- no longer makes sense
stateless_sage_exec_nocache = (input_mesg, output_message_callback) ->
    winston.info("(hub) stateless_sage_exec_nocache #{to_safe_str(input_mesg)}")
    database.random_compute_server(type:'sage', cb:(err, sage_server) ->
        if sage_server?
            stateless_exec_using_server(input_mesg, output_message_callback, sage_server.host, sage_server.port)
        else
            winston.error("(hub) no sage servers!")
            output_message_callback(message.terminate_session(reason:'no Sage servers'))
    )


#############################################
# Clean up on shutdown
#############################################

clean_up_on_shutdown = () ->
    # No point in keeping the port forwards around, since they are only *known* in RAM locally.
    winston.debug("Unforwarding ports...")
    misc_node.unforward_all_ports()


#############################################
# Connect to database
#############################################
#
# load database password from 'data/secrets/cassandra/hub'
#

connect_to_database = (cb) ->
    if database? # already did this
        cb(); return
    dbg = (m) -> winston.debug("connect_to_database: #{m}")
    password_file = "#{SALVUS_HOME}/data/secrets/cassandra/hub"
    dbg("reading '#{password_file}'")
    fs.readFile password_file, (err, password) ->
        if err
            dbg("error reading password file -- #{err}")
            setTimeout((()->cb(err)), 5000)
        else
            dbg("got password; now connecting to database")
            new cass.Salvus
                hosts       : program.database_nodes.split(',')
                keyspace    : program.keyspace
                username    : 'hub'
                password    : password.toString().trim()
                consistency : cql.types.consistencies.localQuorum
                cb          : (err, _db) ->
                    if err
                        dbg("Error connecting to database -- #{err}")
                        cb(err)
                    else
                        dbg("Successfully connected to database.")
                        database = _db
                        reconnect = () ->
                            dbg("RECONNECTING to the database.")
                            database.connect()
                        # We reset database connection every 30 minutes.
                        # This is to see how this correlates with it suddenly stopping working after days (maybe there is a leak?)
                        setInterval(reconnect, 1000*60*30)
                        cb()

# client for compute servers
compute_server = undefined
init_compute_server = (cb) ->
    winston.debug("init_compute_server: creating compute_server client")
    require('compute').compute_server
        database : database
        cb       : (err, x) ->
            if not err
                winston.debug("compute server created")
            else
                winston.debug("FATAL ERROR creating compute server -- #{err}")
            compute_server = x
            cb?(err)

#############################################
# Billing settings
# How to set in cqlsh:
#    update key_value set value='"..."' where key='"stripe_publishable_key"' and name='global_admin_settings';
#    update key_value set value='"..."' where key='"stripe_secret_key"' and name='global_admin_settings';
#############################################
stripe  = undefined
init_stripe = (cb) ->
    dbg = (m) ->
        winston.debug("init_stripe: #{m}")
    dbg()

    billing_settings = {}

    d = database.key_value_store(name:'global_admin_settings')
    async.series([
        (cb) ->
            d.get
                key : 'stripe_secret_key'
                cb  : (err, secret_key) ->
                    if err
                        dbg("error getting stripe_secret_key")
                        cb(err)
                    else
                        if secret_key
                            dbg("go stripe secret_key")
                        else
                            dbg("invalid secret_key")
                        stripe = require("stripe")(secret_key)
                        cb()
        (cb) ->
            d.get
                key : 'stripe_publishable_key'
                cb  : (err, value) ->
                    dbg("stripe_publishable_key #{err}, #{value}")
                    if err
                        cb(err)
                    else
                        stripe.publishable_key = value
                        cb()
    ], (err) ->
        if err
            dbg("error initializing stripe: #{err}")
        else
            dbg("successfully initialized stripe api")
        cb?(err)
    )

#############################################
# Start everything running
#############################################

exports.start_server = start_server = (cb) ->
    # the order of init below is important

    winston.debug("port = #{program.port}, proxy_port=#{program.proxy_port}")
    winston.info("Using keyspace #{program.keyspace}")
    hosts = program.database_nodes.split(',')
    http_server = undefined

    # Log anything that blocks the CPU for more than 10ms -- see https://github.com/tj/node-blocked
    blocked = require('blocked')
    blocked (ms) ->
        # record that something blocked for over 10ms
        winston.debug("BLOCKED for #{ms}ms")


    async.series([
        (cb) ->
            winston.debug("Connecting to the database.")
            misc.retry_until_success
                f           : connect_to_database
                start_delay : 1000
                max_delay   : 10000
                cb          : () ->
                    winston.debug("connected to database.")
                    init_salvus_version()
                    cb()
        (cb) ->
            init_stripe(cb)
        (cb) ->
            init_compute_server(cb)
        (cb) ->
            # proxy server and http server, etc. relies on compute_server having been created
            init_express_http_server (err, server) ->
                http_server = server
                cb(err)
        (cb) ->
            init_http_proxy_server()

            # start updating stats cache every so often -- note: this is cached in the database, so it isn't
            # too big a problem if we call it too frequently...
            update_server_stats(); setInterval(update_server_stats, 120*1000)
            register_hub(); setInterval(register_hub, REGISTER_INTERVAL_S*1000)
            init_primus_server(http_server)
            init_stateless_exec()

            http_server.listen program.port, program.host, (err) =>
                cb(err)
    ], (err) =>
        if err
            winston.error("Error starting hub services! err=#{err}")
        else
            winston.info("Started hub. HTTP port #{program.port}; keyspace #{program.keyspace}")
        cb?(err)
    )

###
# Command line admin stuff -- should maybe be moved to another program?
###
add_user_to_project = (email_address, project_id, cb) ->
     account_id = undefined
     async.series([
         # ensure database object is initialized
         (cb) ->
             connect_to_database(cb)
         # find account id corresponding to email address
         (cb) ->
             database.account_exists
                 email_address : email_address
                 cb            : (err, _account_id) ->
                     account_id = _account_id
                     cb(err)
         # add user to that project as a collaborator
         (cb) ->
             database.add_user_to_project
                 project_id : project_id
                 account_id : account_id
                 group      : 'collaborator'
                 cb         : cb
     ], cb)


#############################################
# Process command line arguments
#############################################

program.usage('[start/stop/restart/status/nodaemon] [options]')
    .option('--port <n>', 'port to listen on (default: 5000)', parseInt, 5000)
    .option('--proxy_port <n>', 'port that the proxy server listens on (default: 5001)', parseInt, 5001)
    .option('--log_level [level]', "log level (default: debug) useful options include INFO, WARNING and DEBUG", String, "debug")
    .option('--host [string]', 'host of interface to bind to (default: "127.0.0.1")', String, "127.0.0.1")
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/hub.pid")', String, "data/pids/hub.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/hub.log")', String, "data/logs/hub.log")
    .option('--database_nodes <string,string,...>', 'comma separated list of ip addresses of all database nodes in the cluster', String, 'localhost')
    .option('--keyspace [string]', 'Cassandra keyspace to use (default: "test")', String, 'test')
    .option('--passwd [email_address]', 'Reset password of given user', String, '')
    .option('--add_user_to_project [email_address,project_id]', 'Add user with given email address to project with given ID', String, '')
    .option('--base_url [string]', 'Base url, so https://sitenamebase_url/', String, '')  # '' or string that starts with /
    .option('--local', 'If option is specified, then *all* projects run locally as the same user as the server and store state in .sagemathcloud-local instead of .sagemathcloud; also do not kill all processes on project restart -- for development use (default: false, since not given)', Boolean, false)
    .option('--account_creation_actions', 'Run all known account creation actions for accounts that have been created (used mainly to clean up after a particular bug)')
    .parse(process.argv)

    # NOTE: the --local option above may be what is used later for single user installs, i.e., the version included with Sage.

if program._name.slice(0,3) == 'hub'
    # run as a server/daemon (otherwise, is being imported as a library)

    #if program.rawArgs[1] in ['start', 'restart']
    process.addListener "uncaughtException", (err) ->
        winston.debug("BUG ****************************************************************************")
        winston.debug("Uncaught exception: " + err)
        winston.debug(err.stack)
        winston.debug("BUG ****************************************************************************")

    if program.passwd
        console.log("Resetting password")
        reset_password(program.passwd, (err) -> process.exit())
    if program.account_creation_actions
        console.log("Account creation actions")
        run_all_account_creation_actions (err) ->
            console.log("DONE --", err)
            (err) -> process.exit()
    else if program.add_user_to_project
        console.log("Adding user to project")
        v = program.add_user_to_project.split(',')
        add_user_to_project v[0], v[1], (err) ->
            if err
                 console.log("Failed to add user: #{err}")
            else
                 console.log("User added to project.")
            process.exit()
    else
        console.log("Running web server; pidfile=#{program.pidfile}, port=#{program.port}")
        # logFile = /dev/null to prevent huge duplicated output that is already in program.logfile
        daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile, logFile:'/dev/null', max:30}, start_server)
