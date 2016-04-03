# Handling support tickets for users -- currently a Zendesk wrapper.
# (c) 2016, SageMath, Inc.
# License: GPLv3

###
Support Tickets, built on top of Zendesk's Core API

Docs:

https://developer.zendesk.com/rest_api/docs/core/introduction
https://github.com/blakmatrix/node-zendesk
###

# if true, no real tickets are created
DEBUG   = true

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
                        cb(null, null, null)

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
    create_ticket: (opts, @cb) ->
        opts = defaults opts,
            email_address : required  # if there is no email_address in the account, there can't be a ticket!
            username      : undefined
            subject       : required  # like an email subject
            body          : required  # html or md formatted text
            tags          : undefined # e.g. [ 'member' ]
            account_id    : undefined
            project_id    : undefined
            filepath      : undefined # path to file (together with project_id → full URL)
            subscriber    : false
            info          : undefined # additional data dict, like browser/OS

        dbg = @dbg("create_ticket")
        # dbg("opts = #{misc.to_json(opts)}")

        if not @_zd?
            err = "zendesk not available -- abort"
            dbg(err)
            opts.cb?(err)
            return

        # data assembly, we need a special formatted user and ticket object
        # https://developer.zendesk.com/rest_api/docs/core/users
        user =
            user:
                name         : opts.username ? opts.email_address
                email        : opts.email_address
                verified     : false  # if true: an email is sent to verify the email address and informed to get account
                external_id  : opts.account_id ? null
                # manage custom_fields here: https://sagemathcloud.zendesk.com/agent/admin/user_fields
                custom_fields:
                    subscription : null
                    type         : null # student, member, ...

        # below the body message, add a link to the project + filepath
        # TODO fix hardcoded URL
        if opts.project_id?
            filepath = opts.filepath ? ''
            filepath = "#{opts.project_id}/#{filepath}"
            body = opts.body + "\n\nhttps://cloud.sagemath.com/projects/#{filepath}"
        else
            body = opts.body + "\n\nNo project_id provided."

        # dbg("opts.filepath: #{opts.filepath}  body: #{body}")

        # https://sagemathcloud.zendesk.com/agent/admin/ticket_fields
        custom_fields =
            account_id: opts.account_id
            project_id: opts.project_id
            filepath  : opts.filepath

        if opts.info?
            custom_fields.info = JSON.stringify(opts.info)

        tags = opts.tags ? []
        tags.push(if opts.subcriber then 'member' else 'free')

        # https://developer.zendesk.com/rest_api/docs/core/tickets#request-parameters
        ticket =
            ticket:
                subject: opts.subject
                comment:
                    body: body
                tags : tags
                type: "problem"
                custom_fields: custom_fields

        # data assembly finished → creating or updating existing zendesk user, then sending ticket creation

        async.waterfall([
            # 1. get or create user ID in zendesk-land
            (cb) =>
                if DEBUG
                    cb(null, 1234567890)
                else
                    # workaround, until https://github.com/blakmatrix/node-zendesk/pull/131/files is in
                    @_zd.users.request 'POST', ['users', 'create_or_update'], user, (err, req, result) =>
                        if err
                            dbg("create_or_update user error: #{misc.to_json(err)}")
                            cb(err); return
                        # result = { "id": int, "url": "https://…json", "name": …, "email": "…", "created_at": "…", "updated_at": "…", … }
                        # dbg(JSON.stringify(result, null, 2, true))
                        cb(null, result.id)

            # 2. creating ticket with known zendesk user ID (an integer number)
            (requester_id, cb) =>
                dbg("create ticket #{misc.to_json(ticket)} with requester_id: #{requester_id}")
                ticket.ticket.requester_id = requester_id
                if DEBUG
                    cb(null, Math.floor(Math.random() * 1e6 + 999e7))
                else
                    @_zd.tickets.create ticket, (err, req, result) =>
                        if (err)
                            cb(err); return
                        # dbg(JSON.stringify(result, null, 2, true))
                        cb(null, result.id)

            # 3. store ticket data, timestamp, and zendesk ticket number in our own DB
            (ticket_id, cb) =>
                # TODO: NYI
                cb(null, ticket_id)

        ], (err, ticket_id) =>
            # dbg("done! ticket_id: #{ticket_id}, err: #{err}, and callback: #{@cb?}")
            if err
                @cb?(err)
            else
                url = "https://sagemathcloud.zendesk.com/requests/#{ticket_id}"
                @cb?(null, url)
        )


