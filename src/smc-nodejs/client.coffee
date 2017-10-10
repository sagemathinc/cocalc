###
Node.js client for CoCalc.

# url could be: ws://cocalc.com or ws://localhost:54249/45f4aab5-7698-4ac8-9f63-9fd307401ad7/port/54249

###

{EventEmitter} = require('events')

require('coffee-cache').setCacheDir('/tmp/coffee-cache/')

WebSocket = require('ws')

client = require('smc-util/client')
misc = require('smc-util/misc')
{defaults, required} = misc

message = require('smc-util/message')

exports.client = (opts) ->
    opts = defaults opts,
        url        : required
        auth_token : undefined
        api_key    : undefined
    if not opts.auth_token and not opts.api_key
        raise Error("at least one of auth_token or api_key must be defined")
    return new Connection(opts.url, opts.auth_token, opts.api_key)

class Connection extends client.Connection
    constructor: (url, @_auth_token, @_api_key) ->
        super(url)
        #@_redux = require('./smc-react').redux

    destroy: =>
        @_conn?.removeAllListeners()
        @_conn?.close()
        delete @_conn

    dbg: (name) =>
        return (args...) => console.log("Client.#{name}", args...)

    _connect: (url, ondata) =>
        dbg = @dbg("_connect")
        dbg()

        i = url.indexOf('//')
        if i == -1
            url = 'ws://' + url
        if not misc.endswith(url, '/hub')
            if not misc.endswith(url, '/')
                url += '/'
            url += 'hub'
        dbg("connecting to '#{url}'")

        @_conn = conn = new WebSocket(url)

        conn.on 'message', (data) =>
            console.log("message '#{data}'")
            ondata(data)

        conn.on 'open', () =>
            @_connected = true
            @emit("connected", 'websocket')
            @_sign_in()

        @_write = (data) =>
            console.log("@_write '#{data}'", data.length)
            conn.send data, (err) =>
                console.log("Done sending '#{data}'", err)

    _sign_in: =>
        dbg = @dbg('_sign_in')
        if @_auth_token
            dbg('using auth token')
            auth_token = @_auth_token
            delete @_auth_token
            @sign_in_using_auth_token
                auth_token : auth_token
                cb         : (err, resp) ->
                    if err
                        dbg("failed")
                    else
                        dbg("success")
        else
            dbg('using api key')
            api_key = @_api_key
            #delete @_api_key
            @sign_in_using_api_key
                api_key : api_key
                cb      : (err, resp) ->
                    if err
                        dbg("failed")
                    else
                        dbg("success")




