###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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

{EventEmitter} = require('events')

misc    = require("./misc")

{once} = require('./async-utils')

defaults = misc.defaults
required = defaults.required

class exports.Connection extends EventEmitter
    # Connection events:
    #    - 'connecting' -- trying to establish a connection
    #    - 'connected'  -- succesfully established a connection; data is the protocol as a string
    #    - 'error'      -- called when an error occurs
    #    - 'output'     -- received some output for stateless execution (not in any session)
    #    - 'execute_javascript' -- code that server wants client to run (not for a particular session)
    #    - 'message'    -- emitted when a JSON message is received           on('message', (obj) -> ...)
    #    - 'data'       -- emitted when raw data (not JSON) is received --   on('data, (id, data) -> )...
    #    - 'signed_in'  -- server pushes a succesful sign in to the client (e.g., due to
    #                      'remember me' functionality); data is the signed_in message.
    #    - 'project_list_updated' -- sent whenever the list of projects owned by this user
    #                      changed; data is empty -- browser could ignore this unless
    #                      the project list is currently being displayed.
    #    - 'project_data_changed - sent when data about a specific project has changed,
    #                      e.g., title/description/settings/etc.
    #    - 'new_version', number -- sent when there is a new version of the source code so client should refresh

    constructor: (url) ->
        super()

        {StripeClient} = require('smc-webapp/client/stripe')
        {ProjectCollaborators} = require('smc-webapp/client/project-collaborators')
        {SupportTickets} = require('smc-webapp/client/support')
        {QueryClient} = require('smc-webapp/client/query')
        {TimeClient} = require('smc-webapp/client/time')
        {AccountClient} = require('smc-webapp/client/account')
        {ProjectClient} = require('smc-webapp/client/project')
        {SyncClient} = require('smc-webapp/client/sync')
        {AdminClient} = require('smc-webapp/client/admin')
        {UsersClient} = require('smc-webapp/client/users')
        {TrackingClient} = require('smc-webapp/client/tracking')
        {FileClient} = require('smc-webapp/client/file')
        {HubClient} = require('smc-webapp/client/hub')
        {Client} = require('smc-webapp/client/client')

        # Refactored functionality
        @stripe = new StripeClient(@call.bind(@))
        @project_collaborators = new ProjectCollaborators(@async_call.bind(@))
        @support_tickets = new SupportTickets(@async_call.bind(@))
        @query_client = new QueryClient(@)
        @time_client = new TimeClient(@)
        @account_client = new AccountClient(@)
        @project_client = new ProjectClient(@)
        @sync_client = new SyncClient(@)
        @admin_client = new AdminClient(@async_call.bind(@))
        @users_client = new UsersClient(@call.bind(@), @async_call.bind(@))
        @tracking_client = new TrackingClient(@)
        @file_client = new FileClient(@async_call.bind(@))
        @client = new Client(@)

        # Tweaks the maximum number of listeners an EventEmitter can have -- 0 would mean unlimited
        # The issue is https://github.com/sagemathinc/cocalc/issues/1098 and the errors we got are
        # (node) warning: possible EventEmitter memory leak detected. 301 listeners added. Use emitter.setMaxListeners() to increase limit.
        @setMaxListeners(3000)  # every open file/table/sync db listens for connect event, which adds up.

        @hub_client = new HubClient(@, url)

        # start pinging -- not used/needed for primus,
        # but *is* needed for getting information about
        # server_time skew and showing ping time to user.
        # Starting pinging a few seconds after connecting the first time,
        # after things have settled down a little (to not throw off ping time).
        @once("connected", => setTimeout((=> @time_client.ping()), 5000))

    dbg: (f) => return @client.dbg(f)

    # Returns (approximate) time in ms since epoch on the server.
    # NOTE:
    #     This is guaranteed to be an *increasing* function, with an arbitrary
    #     ms added on in case of multiple calls at once, to guarantee uniqueness.
    #     Also, if the user changes their clock back a little, this will still
    #     increase... very slowly until things catch up.  This avoids any
    #     possibility of weird random re-ordering of patches within a given session.
    server_time: => @time_client.server_time()
    ping_test: (opts={}) => @time_client.ping_test(opts)

    version: => @client.version()

    is_signed_in: => @hub_client.is_signed_in()
    is_connected: => @hub_client.is_connected()

    # account_id or project_id of this client
    client_id: () =>
        return @account_id

    # false since this client is not a project
    is_project: () =>
        return false

    # true since this client is a user
    is_user: () =>
        return true

    remember_me_key: => @client.remember_me_key()

    call: (opts) => @hub_client.call(opts)

    async_call: (opts) => await @hub_client.async_call(opts)

    # See client/project.ts.
    exec: (opts) =>
        cb = opts.cb
        delete opts.cb
        try
            cb(undefined, await @project_client.exec(opts))
        catch err
            cb(err)

    synctable_database: (...args) => await @sync_client.synctable_database(...args)
    synctable_project: (...args) => await @sync_client.synctable_project(...args)

    query: (opts) =>
        opts = defaults opts,
            query   : required
            changes : undefined
            options : undefined    # if given must be an array of objects, e.g., [{limit:5}]
            standby : false        # if true and use HTTP post, then will use standby server (so must be read only)
            timeout : 30
            no_post : false        # if true, will not use a post query
            cb      : undefined
        if opts.changes
            # changefeed does a normal call with a opts.cb
            @query_client.query(opts)
            return
        # Use the async api
        cb = opts.cb
        if not cb?
            opts.ignore_response = true
        delete opts.cb
        try
            cb?(undefined, await @query_client.query(opts))
        catch err
            cb?(err.message)

    async_query: (opts) =>
        return await @query_client.query(opts)

    query_cancel: (opts) =>
        opts = defaults opts,
            id : required
            cb : undefined
        try
            opts.cb?(undefined, await @query_client.cancel(opts.id))
        catch err
            opts.cb?(err)

    async_query_cancel: (id) => await @query_client.cancel(id)

    touch_project: (project_id) => await this.project_client.touch(project_id)

    set_deleted: (filename, project_id) => @file_client.set_deleted(filename, project_id)
    is_deleted: (filename, project_id) => @file_client.is_deleted(filename, project_id)
    mark_file: (opts) => @file_client.mark_file(opts)