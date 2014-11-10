#################################################################
#
# stringsync -- web browser client side of database-backed synchronized strings
#
#  (c) William Stein, 2014
#
#################################################################

diffsync = require('diffsync')
misc     = require("misc")
message  = require('message')

{defaults, required} = misc

{salvus_client} = require('salvus_client')

class SyncString extends diffsync.DiffSync
    constructor: (string, @session_id, @string_id) ->
        @init(doc:string)

    write_mesg: (opts) =>
        opts = defaults opts,
            event : required
            obj   : {}
            cb    : required
        opts.obj.session_id = @session_id
        salvus_client.call
            message : message['syncstring_' + opts.event](opts.obj)
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp)

    sync: (cb) =>
        # TODO: lock so this can only be called once at a time
        @push_edits (err) =>
            if err
                cb(err)
            else
                @write_mesg
                    event : 'diffsync',
                    obj   :
                        edit_stack       : @edit_stack
                        last_version_ack : @last_version_received
                    cb    : (err, resp) =>
                        if err
                            cb(err)
                        else
                            @recv_edits(resp.edit_stack, resp.last_version_ack, cb)

exports.syncstring = (opts) ->
    opts = defaults opts,
        string_id : required
        cb        : required
    salvus_client.syncstring_get_session
        string_id : opts.string_id
        cb        : (err, resp) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, new SyncString(resp.string, resp.session_id, opts.string_id))


