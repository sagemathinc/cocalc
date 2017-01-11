###############################################################################
#
# SageMathCloud: collaborative mathematics
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

#########################################
# Sending emails
#########################################

fs           = require('fs')
async        = require('async')
winston      = require('winston') # logging -- https://github.com/flatiron/winston

winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

# sendgrid API: https://sendgrid.com/docs/API_Reference/Web_API/mail.html
sendgrid     = require("sendgrid")

misc         = require('smc-util/misc')
{defaults, required} = misc

email_server = undefined

# here's how I test this function:
#    require('email').send_email(subject:'TEST MESSAGE', body:'body', to:'wstein@sagemath.com', cb:console.log)
exports.send_email = send_email = (opts={}) ->
    opts = defaults opts,
        subject      : required
        body         : required
        fromname     : 'SageMath Inc.'
        from         : 'office@sagemath.com'
        to           : required
        replyto      : undefined
        replyto_name : undefined
        cc           : ''
        bcc          : ''
        verbose      : true
        cb           : undefined
        category     : undefined
        asm_group    : undefined

    if opts.verbose
        dbg = (m) -> winston.debug("send_email(to:#{opts.to}) -- #{m}")
    else
        dbg = (m) ->
    dbg(opts.body)

    disabled = false
    async.series([
        (cb) ->
            if email_server?
                cb(); return
            dbg("starting sendgrid client...")
            filename = "#{process.env.SALVUS_ROOT}/data/secrets/sendgrid"
            fs.readFile filename, 'utf8', (error, api_key) ->
                if error
                    err = "unable to read the file '#{filename}', which is needed to send emails."
                    dbg(err)
                    cb(err)
                else
                    api_key = api_key.toString().trim()
                    if api_key.length == 0
                        dbg("email_server: explicitly disabled -- so pretend to always succeed for testing purposes")
                        disabled = true
                        email_server = {disabled:true}
                        cb()
                        return
                    email_server = sendgrid(api_key)
                    dbg("started sendgrid client")
                    cb()
        (cb) ->
            if disabled or email_server?.disabled
                cb(undefined, 'sendgrid email disabled -- no actual message sent')
                return
            dbg("sending email to #{opts.to} starting...")
            # Sendgrid V3 API -- https://sendgrid.com/docs/API_Reference/Web_API_v3/Mail/index.html
            helper       = sendgrid.mail
            from_email   = new helper.Email(opts.from, opts.fromname)
            to_email     = new helper.Email(opts.to)
            content      = new helper.Content("text/html", opts.body)
            mail         = new helper.Mail(from_email, opts.subject, to_email, content)
            if opts.replyto
                replyto_name = opts.replyto_name ? opts.replyto
                mail.setReplyTo(new helper.Email(opts.replyto, replyto_name))

            personalization = new helper.Personalization()
            personalization.setSubject(opts.subject)
            personalization.addTo(to_email)
            if opts.cc
                personalization.addCc(new helper.Email(opts.cc))
            if opts.bcc
                personalization.addBcc(new helper.Email(opts.bcc))

            # one or more strings to categorize the sent emails on sendgrid
            if opts.category?
                mail.addCategory(new helper.Category(opts.category))

            # to unsubscribe only from a specific type of email, not everything!
            # https://app.sendgrid.com/suppressions/advanced_suppression_manager
            if opts.asm_group?
                mail.setAsm(new helper.Asm(opts.asm_group))

            # plain template with a header (smc logo), a h1 title, and a footer
            mail.setTemplateId('0375d02c-945f-4415-a611-7dc3411e2a78')
            # This #title# will end up below the header in an <h1> according to the template
            personalization.addSubstitution(new helper.Substitution("#title#", opts.subject))

            mail.addPersonalization(personalization)

            # Sendgrid V3 API
            request = email_server.emptyRequest
                                        method  : 'POST'
                                        path    : '/v3/mail/send'
                                        body    : mail.toJSON()

            email_server.API request, (err, res) ->
                    dbg("sending email to #{opts.to} done...; got err=#{misc.to_json(err)} and res=#{misc.to_json(res)}")
                    if err
                        dbg("sending email -- error = #{misc.to_json(err)}")
                    else
                        dbg("sending email -- success = #{misc.to_json(res)}")
                    cb(err)
    ], (err, message) ->
        if err
            # so next time it will try fresh to connect to email server, rather than being wrecked forever.
            email_server = undefined
            err = "error sending email -- #{misc.to_json(err)}"
            dbg(err)
        else
            dbg("successfully sent email")
        opts.cb?(err, message)
    )


# Send a mass email to every address in a file.
# E.g., put the email addresses in a file named 'a' and
#    require('email').mass_email(subject:'TEST MESSAGE', body:'body', to:'a', cb:console.log)
exports.mass_email = (opts) ->
    opts = defaults opts,
        subject  : required
        body     : required
        from     : 'office@sagemath.com'
        fromname : 'SageMath, Inc.'
        to       : required   # array or string (if string, opens and reads from file, splitting on whitspace)
        cc       : ''
        limit    : 10         # number to send in parallel
        cb       : undefined  # cb(err, list of recipients that we succeeded in sending email to)

    dbg = (m) -> winston.debug("mass_email: #{m}")
    dbg(opts.filename)
    dbg(opts.subject)
    dbg(opts.body)
    success = []
    recipients = undefined

    async.series([
        (cb) ->
            if typeof(opts.to) != 'string'
                recipients = opts.to
                cb()
            else
                fs.readFile opts.to, (err, data) ->
                    if err
                        cb(err)
                    else
                        recipients = misc.split(data.toString())
                        cb()
        (cb) ->
            n = 0
            f = (to, cb) ->
                if n % 100 == 0
                    dbg("#{n}/#{recipients.length-1}")
                n += 1
                # asm_group https://app.sendgrid.com/suppressions/advanced_suppression_manager
                send_email
                    subject  : opts.subject
                    body     : opts.body
                    from     : opts.from
                    fromname : opts.fromname
                    to       : to
                    cc       : opts.cc
                    asm_group: 698
                    category : "newsletter"
                    verbose  : false
                    cb       : (err) ->
                        if not err
                            success.push(to)
                            cb()
                        else
                            cb("error sending email to #{to} -- #{err}")

            async.mapLimit(recipients, opts.limit, f, cb)
    ], (err) ->
        opts.cb?(err, success)
    )


