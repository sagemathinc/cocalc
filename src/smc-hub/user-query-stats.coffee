###
Class to track (and report in a log) stats about user_queries by the Rethink interface.
###

{defaults} = misc = require('smc-util/misc')
required = defaults.required

class exports.UserQueryStats
    constructor: (@dbg) ->
        @_accounts = {}
        @_projects = {}
        @_feeds = {}

    _cnt: (account_id, project_id, table, op, eps=1) =>
        if account_id?
            t = @_accounts[account_id] ?= {}
        else if project_id?
            t = @_projects[project_id] ?= {}
        else
            return
        s = t[table] ?= {}
        s[op] ?= 0
        s[op] += eps

    report: (opts) =>
        if opts.account_id?
            t = @_accounts[opts.account_id]
            head = "account_id='#{opts.account_id}'"
        else if opts.project_id?
            t = @_projects[opts.project_id]
            head = "project_id='#{opts.project_id}'"
        else
            return
        @dbg("#{head}: #{misc.to_json(t)}")

    set_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
        #@dbg("set_query(account_id='#{opts.account_id}',project_id='#{opts.project_id}',table='#{opts.table}')")
        @_cnt(opts.account_id, opts.project_id, opts.table, 'set')
        @report(opts)

    get_query: (opts) =>
        opts = defaults opts,
            account_id : undefined
            project_id : undefined
            table      : required
        #@dbg("get_query(account_id='#{opts.account_id}',project_id='#{opts.project_id}',table='#{opts.table}')")
        @_cnt(opts.account_id, opts.project_id, opts.table, 'get')
        @report(opts)

    changefeed: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            project_id    : undefined
            table         : required
            changefeed_id : required
        #@dbg("changefeed(account_id='#{opts.account_id}',project_id='#{opts.project_id}',table='#{opts.table}')")
        @_cnt(opts.account_id, opts.project_id, opts.table, 'feed')
        @_feeds[opts.changefeed_id] = opts
        @report(opts)

    cancel_changefeed: (opts) =>
        opts = defaults opts,
            changefeed_id : required
        @dbg("cancel_changefeed(changefeed_id='#{opts.changefeed_id}')")
        x = @_feeds[opts.changefeed_id]
        if not x?
            @dbg("no such changefeed_id='#{opts.changefeed_id}'")
            return
        {account_id, project_id, table} = @_feeds[opts.changefeed_id]
        @_cnt(account_id, project_id, table, 'feed', -1)
        @report({account_id:account_id, project_id:project_id})

