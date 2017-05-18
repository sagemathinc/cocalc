###
The API
###

fs           = require('fs')
path_module  = require('path')
Cookies      = require('cookies')
util         = require('util')
ms           = require('ms')
express      = require('express')
winston      = require('winston')
async        = require('async')

hub_register = require('./hub_register')
misc         = require('smc-util/misc')
{defaults, required} = misc


# API version 1
# start with version 2 if there are significant changes
class APIv1
    constructor: (opts) ->
        opts = defaults opts,
            base_url       : required
            dev            : false  # if true, serve additional dev stuff, e.g., a proxyserver.
            database       : required
        @database = opts.database
        @v1 = null # defined once init is done

    init: ->
        v1 = express.Router()

        v1.get '/', (req, res) ->
            res.send(JSON.stringify(version: 1))

        v1.get '/time', (req, res) ->
            res.json(time: new Date().toISOString())

        v1.get '/webapp_init', (req, res) =>
            # covers /auth/strategies, /registration, /customize

            if not hub_register.database_is_working()
                res.json(error:"not connected to database")
                return

            async.parallel(
                strategies   : (cb) =>
                    cb(null, require('./auth').all_known_strategies)
                registration : (cb) =>
                    @database.get_server_setting
                        name : 'account_creation_token'
                        cb   : (err, token) ->
                            cb(null, if (err or not token) then {} else {token:true})
                customize    : (cb) =>
                    @database.get_site_settings
                        cb : (err, settings) ->
                            cb(null, if (err or not settings) then {} else settings)
            , (err, data) ->
                if err
                    res.json(error: misc.to_json(err))
                else
                    res.json(data)
            )

        v1.get '/auth', @authenticate, (req, res) ->
            res.json(data: "welcome '#{req.user}', you are authenticated!")

        @v1 = v1
        return v1

    # some endpoints require a token based authentication
    # TODO this is just a demo such that '/api/1/auth?token=letmein' works
    # TODO make this work with POST
    authenticate: (req, res, next) ->
        # mabye check for req.is('application/json')
        if not req.secure
            res.json(error: 'connection is not secure')
            return

        bearer = req.header('Authorization')
        if bearer and bearer.indexOf('Bearer ') == 0
            token = bearer[('Bearer '.length)..]
        else if req.query.token
            token = req.query.token

        if token and token == 'letmein'
            req.user = 'account-uuid'
            next()
        else
            res.json(error: 'sorry, you are not authenticated')

exports.init_api = (opts) ->
    opts = defaults opts,
        base_url       : required
        dev            : false
        database       : required

    api = express.Router()

    api.use (req, res, next) ->
        req._start = process.hrtime()
        res.header('Content-Type', 'application/json')
        res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
        res.on 'finish', ->
            dt = process.hrtime(req._start)
            # TODO log request path and corresponding reponse time in prometheus
            winston.debug("API: #{req.path} -- took #{((dt[0] * 1e9 + dt[1]) / 1e6).toFixed(2)}ms")
        next()

    api.get '/', (req, res) ->
        res.json(versions: ['1'])

    api.use('/1', new APIv1(opts).init())

    return api
