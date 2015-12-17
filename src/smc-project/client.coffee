winston = require('winston')
winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

require('coffee-script/register')

message    = require('smc-util/message')
misc       = require('smc-util/misc')
synctable  = require('smc-util/synctable')
syncstring = require('smc-util/syncstring')

{defaults, required} = misc

class exports.Client
    constructor : (@hub_client_sockets={}) ->
        @dbg('constructor')()
        #@ping_test()

    ping_test: () =>
        test = () =>
            winston.debug("ping")
            t0 = new Date()
            @call
                message : message.ping()
                timeout : 3
                cb      : (err, resp) =>
                    winston.debug("pong: #{new Date()-t0}ms; got err=#{err}, resp=#{misc.to_json(resp)}")
        setInterval(test, 7*1000)

    dbg: (f) ->
        return (m) -> winston.debug("Client.#{f}: #{m}")

    get_hub_socket: () =>
        v = misc.values(@hub_client_sockets)
        if v.length == 0
            return
        v.sort (a,b) -> misc.cmp(a.activity ? 0, b.activity ? 0)
        return v[v.length-1]

    sync_table: (query, options, debounce_interval=2000) =>
        return new synctable.SyncTable(query, options, @, debounce_interval)

    sync_string: (opts) =>
        opts = defaults opts,
            id      : required
            default : ''
        opts.client = @
        return new syncstring.SyncString(opts)

    sync_object: (opts) =>
        opts = defaults opts,
            id      : required
            default : {}
        opts.client = @
        return new syncstring.SyncObject(opts)

    call: (opts) =>
        opts = defaults opts,
            message     : required
            timeout     : undefined
            cb          : undefined
        dbg = @dbg("call(message=#{misc.to_json(opts.messgae)})")
        dbg()
        socket = @get_hub_socket()
        if not socket?
            dbg("no sockets")
            # currently, due to the security model, there's no way out of this; that will change...
            opts.cb?("no hubs currently connected to this project")
            return
        if opts.timeout
            dbg("configure timeout")
            fail = () =>
                delete socket.call_hub_callbacks[opts.message.id]
                opts.cb?("timeout after #{opts.timeout}s")
            timer = setTimeout(fail, opts.timeout*1000)
        opts.message.id = misc.uuid()
        socket.call_hub_callbacks[opts.message.id] = (resp) =>
            dbg("got response: #{misc.to_json(resp)}")
            clearTimeout(timer)
            if resp.event == 'error'
                opts.cb?(if resp.error then resp.error else 'error')
            else
                opts.cb?(undefined, resp)
        dbg("writing mesg")
        socket.write_mesg('json', opts.message)

    query: (opts) =>
        opts = defaults opts,
            query   : required
            changes : undefined
            options : undefined
            timeout : 30
            cb      : undefined
        mesg = message.query
            query          : opts.query
            options        : opts.options
            changes        : opts.changes
            multi_response : opts.changes
        @call
            message     : mesg
            timeout     : opts.timeout
            cb          : opts.cb

    query_cancel: (opts) =>
        opts = defaults opts,
            id : required
            cb : undefined
        @call  # getting a message back with this id cancels listening
            message     : message.query_cancel(id:opts.id)
            timeout     : 30
            cb          : opts.cb

    query_get_changefeed_ids: (opts) =>
        opts = defaults opts,
            cb : required
        @call  # getting a message back with this id cancels listening
            message     : message.query_get_changefeed_ids()
            timeout     : 30
            cb          : (err, resp) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, resp.changefeed_ids)


