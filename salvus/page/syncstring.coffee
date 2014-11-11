#################################################################
#
# syncstring -- web browser client side of database-backed synchronized strings
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
        misc.call_lock(obj:@)
        @init(doc:string)
        salvus_client.on("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)

    destroy: () =>
        salvus_client.removeListener("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)

    write_mesg: (opts) =>
        opts = defaults opts,
            event : required
            obj   : {}
            cb    : required
        opts.obj.session_id = @session_id
        salvus_client.call
            message : message['syncstring_' + opts.event](opts.obj)
            timeout : 15
            cb      : (err, resp) =>
                if err
                    opts.cb(err)
                else if resp.event == 'error'
                    opts.cb(resp.error)
                else
                    opts.cb(undefined, resp)

    sync: (cb) =>
        @_call_with_lock(@_sync, cb)

    _sync: (cb) =>
        # TODO: lock so this can only be called once at a time
        @push_edits (err) =>
            if err
                cb?(err)
            else
                @write_mesg
                    event : 'diffsync',
                    obj   :
                        edit_stack       : @edit_stack
                        last_version_ack : @last_version_received
                    cb    : (err, resp) =>
                        if err
                            cb?(err)
                        else if resp.event != 'syncstring_diffsync'
                            # TODO: will have to reconnect
                            cb?(resp.event)
                        else
                            @recv_edits(resp.edit_stack, resp.last_version_ack, cb)

    handle_diffsync_mesg: (mesg, cb) =>
        @_call_with_lock(((cb) => @_handle_diffsync_mesg(mesg, cb)), cb)

    _handle_diffsync_mesg: (mesg, cb) =>
        #dbg = (m) => console.log("handle_diffsync_mesg: #{m}")
        #dbg(misc.to_json(mesg))
        @recv_edits mesg.edit_stack, mesg.last_version_ack, (err) =>
            if err
                dbg("recv_edits: #{err}")
                # would have to reset at this point (?)
                cb?(err)
                return
            # Send back our own edits to the hub
            #dbg("send back our own edits to hub")
            @push_edits (err) =>
                # call to push_edits just computed @edit_stack and @last_version_received
                if err
                    #dbg("error in push_edits -- #{err}")
                    cb?(err)
                else
                    #dbg("now sending our own edits out")
                    resp = message.syncstring_diffsync
                        id               : mesg.id
                        edit_stack       : @edit_stack
                        last_version_ack : @last_version_received
                    salvus_client.send(resp)
                    cb?()


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


