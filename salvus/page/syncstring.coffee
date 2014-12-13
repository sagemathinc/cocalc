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
        @add_listeners()
        salvus_client.on('connected', @reconnect)

    _checksum: (doc) =>
        return misc.hash_string(doc)  # must be the same as in backend file ../syncstring.coffee

    add_listeners: () =>
        salvus_client.on("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)
        salvus_client.on("syncstring_diffsync2_reset-#{@session_id}", @reconnect)

    remove_listeners: () =>
        salvus_client.removeListener("syncstring_diffsync2-#{@session_id}", @handle_diffsync_mesg)
        salvus_client.removeListener("syncstring_diffsync2_reset-#{@session_id}", @reconnect)

    destroy: () =>
        @remove_listeners()
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
        #console.log("_reconnect")
        # remember anything we did when offline
        need_patch = @last_sync != @live
        if need_patch
            patch = diffsync.dmp.patch_make(@last_sync, @live)
            #console.log("reconnect: offline changes that need to be applied: #{misc.to_json(patch)}")
        else
            #console.log("reconnect: no offline changes to apply")
        salvus_client.syncstring_get_session
            string_id : @string_id
            cb        : (err, resp) =>
                if err
                    cb?(err)
                else
                    @remove_listeners()
                    @session_id = resp.session_id
                    @init(doc:resp.string)
                    @last_sync = resp.string
                    @add_listeners()
                    if need_patch
                        #console.log("applying offline patch: before='#{@live}'")
                        @live = diffsync.dmp.patch_apply(patch, @live)[0]
                        #console.log("applying offline patch: after='#{@live}'")
                    @_sync(cb)   # skip call with lock, since we're already in a lock

    sync: (cb) =>
        f = (cb) =>
            @_call_with_lock(@_sync, cb)
        misc.retry_until_success
            f         : f
            max_tries : 30
            factor    : 1.5
            #name      : "SyncString"
            #log       : (m) -> console.log(m)
            cb        : cb

    _sync: (cb) =>
        # TODO: lock so this can only be called once at a time
        #console.log("_sync: '#{@shadow}', '#{@live}'")
        @push_edits (err) =>
            #console.log("_sync: after push_edits -- '#{@shadow}', '#{@live}'")
            if err
                cb?(err)
            else
                @write_mesg
                    event : 'diffsync',
                    obj   :
                        edit_stack       : @edit_stack
                        last_version_ack : @last_version_received
                    cb    : (err, resp) =>
                        #console.log("_sync: after write_mesg -- err='#{err}', resp='#{misc.to_json(resp)}'")

                        if err
                            if err.indexOf('reset') != -1
                                @_reconnect(cb)
                            else
                                cb?(err)
                        else if resp.event == 'syncstring_disconnect'
                            @_reconnect(cb)
                        else if resp.event == 'syncstring_diffsync'
                            @recv_edits(resp.edit_stack, resp.last_version_ack, cb)
                            @last_sync = @shadow
                            @emit('sync')
                            #console.log("_sync: after recv_edits -- '#{@shadow}', '#{@live}'")
                        else
                            # unknown/weird error
                            cb?(resp.event)

    handle_diffsync_mesg: (mesg, cb) =>
        @_call_with_lock(((cb) => @_handle_diffsync_mesg(mesg, cb)), cb)

    _handle_diffsync_mesg: (mesg, cb) =>
        #dbg = (f, m) => console.log("handle_diffsync_mesg: #{f} -- #{misc.to_json(m)}")
        #dbg('',mesg)
        @recv_edits mesg.edit_stack, mesg.last_version_ack, (err) =>
            if err
                dbg("recv_edits error", err)
                # would have to reset at this point (?)
                if err.indexOf('reset') != -1
                    @_reconnect(cb)
                else
                    cb?(err)
                return
            @last_sync = @shadow
            @emit('sync')
            #dbg("next push_edits")
            @push_edits (err) =>
                # call to push_edits just computed @edit_stack and @last_version_received
                if err
                    #dbg("error in push_edits -- #{err}")
                    cb?(err)
                else
                    #dbg("success getting edit stack", @edit_stack)
                    if @edit_stack.length > 0
                        # only send if we have changes -- otherwise we get in an infinite loop.
                        #dbg("now actually sending our own edits out")
                        resp = message.syncstring_diffsync
                            id               : mesg.id
                            session_id       : mesg.session_id
                            edit_stack       : @edit_stack
                            last_version_ack : @last_version_received
                        #dbg("sending response", resp)
                        salvus_client.send(resp)
                    cb?()

exports.syncstring = syncstring = (opts) ->
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


#---------------------------------------------------------------------
# Synchronized document-oriented database, based on SynchronizedString
# This is the version run by clients.
# There is a corresponding implementation run by hubs.
#---------------------------------------------------------------------

_syncdb_cache = {}
exports.syncdb = (opts) ->
    opts = defaults opts,
        string_id      : required
        cb             : required
    d = _syncdb_cache[opts.string_id]
    if d?
        opts.cb(undefined, d)
        return
    syncstring
        string_id : opts.string_id
        cb        : (err, client) ->
            if err
                opts.cb(err)
            else
                doc = new diffsync.SynchronizedDB_DiffSyncWrapper(client)
                client.on 'sync', () -> doc.emit("sync")
                d = _syncdb_cache[opts.string_id] = new diffsync.SynchronizedDB(doc)
                opts.cb(undefined, d)


