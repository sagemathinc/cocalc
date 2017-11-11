###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016 -- 2017, Sagemath Inc.
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

BANNED_DOMAINS = {'qq.com':true}


fs           = require('fs')
async        = require('async')
winston      = require('winston') # logging -- https://github.com/flatiron/winston

winston.remove(winston.transports.Console)
winston.add(winston.transports.Console, {level: 'debug', timestamp:true, colorize:true})

# sendgrid API: https://sendgrid.com/docs/API_Reference/Web_API/mail.html
sendgrid     = require("sendgrid")

misc         = require('smc-util/misc')
{defaults, required} = misc

{SENDGRID_TEMPLATE_ID, SENDGRID_ASM_NEWSLETTER, COMPANY_NAME, COMPANY_EMAIL} = require('smc-util/theme')
{DOMAIN_NAME, HELP_EMAIL, SITE_NAME} = require('smc-util/theme')

email_server = undefined

exports.is_banned = is_banned = (address) ->
    i = address.indexOf('@')
    if i == -1
        return false
    x = address.slice(i+1).toLowerCase()
    return !! BANNED_DOMAINS[x]

# here's how I test this function:
#    require('email').send_email(subject:'TEST MESSAGE', body:'body', to:'wstein@sagemath.com', cb:console.log)
exports.send_email = send_email = (opts={}) ->
    opts = defaults opts,
        subject      : required
        body         : required
        fromname     : COMPANY_NAME
        from         : COMPANY_EMAIL
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

    if is_banned(opts.to) or is_banned(opts.from)
        dbg("WARNING: attempt to send banned email")
        opts.cb?('banned domain')
        return

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
            mail.setTemplateId(SENDGRID_TEMPLATE_ID)
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

# Welcome email for new user
exports.send_email_to_new_user = (opts) ->
    opts = defaults opts,
        email_address : required
        first_name    : required
        last_name     : required
        cb            : undefined

    body = """
    <h2>Hello #{opts.first_name} #{opts.last_name}!</h2>
    <br/>
    <p>
    You signed up on #{SITE_NAME} accessible via <a href="#{DOMAIN_NAME}">#{DOMAIN_NAME}</a>.
    </p>
    <p>
    If there are any problems, email us at <a href="mailto:#{HELP_EMAIL}">#{HELP_EMAIL}</a>.
    </p>
    """

    exports.send_email
        subject    : "Welcome to #{SITE_NAME}"
        body       : body
        from       : "CoCalc <#{HELP_EMAIL}>"
        to         : opts.email_address
        category   : "new_signup"
        asm_group  : 147985           # https://app.sendgrid.com/suppressions/advanced_suppression_manager
        cb         : opts.cb

# Notification email
exports.send_notification_email_to_user = (opts) ->
    opts = defaults opts,
        email_address : required
        first_name    : required
        last_name     : required
        notifications : required
        cb            : undefined

    notifications_list = ("<li>#{x}</li>" for x in opts.notifications).join('\n')

    body = """
    <h2>Hello #{opts.first_name} #{opts.last_name}!</h2>
    <br/>
    <p>
    There is new activity on #{SITE_NAME} waiting for you. Access it via <a href="#{DOMAIN_NAME}">#{DOMAIN_NAME}</a>.
    </p>
    <ul>
    #{notifications_list}
    </ul>
    """
    exports.send_email
        subject    : "New activity on #{SITE_NAME}"
        body       : body
        from       : "CoCalc <#{HELP_EMAIL}>"
        to         : opts.email_address
        category   : "notifications"
        asm_group  : 148185        # https://app.sendgrid.com/suppressions/advanced_suppression_manager
        cb         : opts.cb


# Send a mass email to every address in a file.
# E.g., put the email addresses in a file named 'a' and
#    require('email').mass_email(subject:'TEST MESSAGE', body:'body', to:'a', cb:console.log)
exports.mass_email = (opts) ->
    opts = defaults opts,
        subject  : required
        body     : required
        from     : COMPANY_EMAIL
        fromname : COMPANY_NAME
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
                send_email
                    subject  : opts.subject
                    body     : opts.body
                    from     : opts.from
                    fromname : opts.fromname
                    to       : to
                    cc       : opts.cc
                    asm_group: SENDGRID_ASM_NEWSLETTER
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


