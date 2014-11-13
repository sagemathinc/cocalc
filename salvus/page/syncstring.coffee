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
        @last_sync = string
        @listen()

    listen: () =>
        salvus_client.on("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)
        salvus_client.on('connected', @reconnect)

    destroy: () =>
        salvus_client.removeListener("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)
        salvus_client.removeListener('connected', @reconnect)


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

    reconnect: (cb) =>
        @_call_with_lock(@_reconnect, cb)

    _reconnect: (cb) =>
        console.log("_reconnect")
        salvus_client.removeListener("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)
        # remember anything we did when offline
        need_patch = @last_sync != @live
        if need_patch
            patch = diffsync.dmp.patch_make(@last_sync, @live)
            console.log("reconnect: offline changes that need to be applied: #{misc.to_json(patch)}")
        else
            console.log("reconnect: no offline changes to apply")
        salvus_client.syncstring_get_session
            string_id : @string_id
            cb        : (err, resp) =>
                if err
                    cb(err)
                else
                    @session_id = resp.session_id
                    @init(doc:resp.string)
                    @last_sync = resp.string
                    salvus_client.on("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)
                    if need_patch
                        console.log("applying offline patch: before='#{@live}'")
                        @live = diffsync.dmp.patch_apply(patch, @live)[0]
                        console.log("applying offline patch: after='#{@live}'")
                        @_sync(cb)   # skip call with lock, since we're already in a lock
                    else
                        cb()

    sync: (cb) =>
        @_call_with_lock(@_sync, cb)

    _sync: (cb) =>
        # TODO: lock so this can only be called once at a time
        console.log("_sync: '#{@shadow}', '#{@live}'")
        @push_edits (err) =>
            console.log("_sync: after push_edits -- '#{@shadow}', '#{@live}'")
            if err
                cb?(err)
            else
                @write_mesg
                    event : 'diffsync',
                    obj   :
                        edit_stack       : @edit_stack
                        last_version_ack : @last_version_received
                    cb    : (err, resp) =>
                        console.log("_sync: after write_mesg -- '#{@shadow}', '#{@live}'")
                        if err
                            cb?(err)
                        else if resp.event == 'syncstring_disconnect'
                            @_reconnect(cb)
                        else if resp.event == 'syncstring_diffsync'
                            @recv_edits(resp.edit_stack, resp.last_version_ack, cb)
                            @last_sync = @shadow
                            console.log("_sync: after recv_edits -- '#{@shadow}', '#{@live}'")
                        else
                            # unknown/weird error
                            cb?(resp.event)

    handle_diffsync_mesg: (mesg, cb) =>
        @_call_with_lock(((cb) => @_handle_diffsync_mesg(mesg, cb)), cb)

    _handle_diffsync_mesg: (mesg, cb) =>
        #dbg = (m) => console.log("handle_diffsync_mesg: #{m}")
        #dbg(misc.to_json(mesg))
        @recv_edits mesg.edit_stack, mesg.last_version_ack, (err) =>
            if err
                #dbg("recv_edits: #{err}")
                # would have to reset at this point (?)
                cb?(err)
                return
            # Send back our own edits to the hub
            #dbg("send back our own edits to hub")
            @last_sync = @shadow
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


