# Handling support tickets for users -- currently a Zendesk wrapper.
# (c) 2016, SageMath, Inc.
# License: GPLv3

###
Support Tickets, built on top of Zendesk's Core API

Docs:

https://developer.zendesk.com/rest_api/docs/core/introduction
https://github.com/blakmatrix/node-zendesk
###

async   = require 'async'
fs      = require 'fs'
misc    = require 'smc-util/misc'
_       = require 'underscore'
{defaults, required} = misc

winston    = require 'winston'
winston.remove(winston.transports.Console)

SMC_TEST = process.env.SMC_TEST
if not SMC_TEST
    winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

zendesk_password_filename = ->
    return (process.env.SMC_ROOT ? '.') + '/data/secrets/zendesk'


class exports.Support
    constructor: (opts={}) ->
        opts = defaults opts,
            cb       : undefined

        @dbg = (f) =>
            return (m) -> winston.debug("Zendesk.#{f}: #{m}")

        dbg    = @dbg("constructor")
        @_zd   = null

        async.waterfall([
            (cb) =>
                dbg("loading zendesk password from disk")
                password_file = zendesk_password_filename()
                fs.exists password_file, (exists) =>
                    if exists
                        fs.readFile password_file, (err, data) =>
                            if err
                                cb(err)
                            else
                                dbg("read zendesk password from '#{password_file}'")
                                creds = data.toString().trim().split(':')
                                cb(null, creds[0], creds[1])
                    else
                        dbg("no password file found at #{password_file}")
                        cb(null, null)

            (username, password, cb) =>
                if username? and password?
                    zendesk = require('node-zendesk')
                    # username already has /token postfix, otherwise set "token" instead of "password"
                    zd = zendesk.createClient
                                username   : username,
                                password   : password,
                                remoteUri  : 'https://sagemathcloud.zendesk.com/api/v2'
                    cb(null, zd)
                else
                    cb(null, null)

        ], (err, zendesk_client) =>
            if err
                dbg("error initializing zendesk -- #{to_json(err)}")
            else
                dbg("successfully initialized zendesk")
                @_zd = zendesk_client
            opts.cb?(err, @)
        )


    ###
    # Start of high-level SMC API for support tickets
    ###

    # List recent tickets (basically a test if the API client works)
    # https://developer.zendesk.com/rest_api/docs/core/tickets#list-tickets
    recent_tickets: (cb) ->
        @_zd?.tickets.listRecent (err, statusList, body, responseList, resultList) =>
            if (err)
                console.log(err)
                return
            dbg = @dbg("recent_tickets")
            dbg(JSON.stringify(body, null, 2, true))
            cb?(body)

    # mapping of incoming data from SMC to the API of Zendesk
    # https://developer.zendesk.com/rest_api/docs/core/tickets#create-ticket
    create_ticket: (opts={}) ->
        opts = defaults opts,
            email_address : required  # if there is no email_address in the account, there can't be a ticket!
            subject       : required  # like an email subject
            body          : required  # html or md formatted text
            tags          : undefined # e.g. [ 'member' ]
            account_id    : undefined
            project_id    : undefined
            file          : undefined # path to file (together with project_id → full URL)
            info          : undefined # additional data dict, like browser/OS
            cb            : undefined
        dbg = @dbg("create_ticket")
        dbg("opts = #{misc.to_json(opts)}")

        custom_fields =
            account_id: opts.account_id
            project_id: opts.project_id

        if opts.info?
            custom_fields = _.extend(custom_fields, opts.info)

        ticket =
            ticket:
                subject: opts.subject
                comment:
                    body: opts.body
                custom_fields: custom_fields

        #@_zd?.tickets.create ticket, (err, req, result) =>
        #    if (err)
        #        opts.cb?(err)
        #        return
        #    dbg(JSON.stringify(result, null, 2, true))
        #    opts.cb?(id : result.id) # id: ticket number