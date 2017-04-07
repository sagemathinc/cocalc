###
The API
###

fs          = require('fs')
path_module = require('path')
Cookies     = require('cookies')
util        = require('util')
ms          = require('ms')
express     = require('express')
winston     = require('winston')

misc        = require('smc-util/misc')
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
            res.send(JSON.stringify(time: new Date().toISOString()))

        v1.get '/auth', @authenticate, (req, res) ->
            res.send(JSON.stringify(data: "welcome '#{req.user}', you are authenticated!"))

        @v1 = v1
        return v1

    # some endpoints require a token based authentication
    # TODO this is just a demo such that '/api/1/auth?token=letmein' works
    # TODO make this work with POST
    authenticate: (req, res, next) ->
        if req.query.token == 'letmein'
            req.user = 'the-user-id'
            next()
        else
            res.send(JSON.stringify(error: 'sorry, you are not authenticated'))

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
            console.log("API #{req.path} response time #{((dt[0] * 1e9 + dt[1]) / 1e6).toFixed(2)}ms")
        next()

    api.get '/', (req, res) ->
        res.send(JSON.stringify(versions: ['1']))

    api.use('/1', new APIv1(opts).init())

    return api
