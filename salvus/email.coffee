###############################################################################
#
# SageMathCloud: collaborative mathematics
#
#    Copyright (C) 2015, William Stein
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

nodemailer   = require("nodemailer")
sgTransport  = require('nodemailer-sendgrid-transport')

misc         = require('misc')
{defaults, required} = misc

email_server = undefined

# here's how I test this function:
#    require('email').send_email(subject:'TEST MESSAGE', body:'body', to:'wstein@sagemath.com', cb:console.log)
exports.send_email = send_email = (opts={}) ->
    opts = defaults opts,
        subject : required
        body    : required
        from    : 'SageMath Help <help@sagemath.com>'
        to      : required
        cc      : ''
        verbose : true
        cb      : undefined

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
            filename = 'data/secrets/sendgrid_email_password'
            fs.readFile filename, 'utf8', (error, password) ->
                if error
                    err = "unable to read the file '#{filename}', which is needed to send emails."
                    dbg(err)
                    cb(err)
                else
                    pass = password.toString().trim()
                    if pass.length == 0
                        dbg("email_server: explicitly disabled -- so pretend to always succeed for testing purposes")
                        disabled = true
                        email_server = {disabled:true}
                        cb()
                        return

                    email_server = nodemailer.createTransport(sgTransport(auth:{api_user:'wstein', api_key:pass}))
                    dbg("started email server")
                    cb()
        (cb) ->
            if disabled or email_server?.disabled
                cb(undefined, 'email disabled -- no actual message sent')
                return
            dbg("sendMail to #{opts.to} starting...")
            email =
                from    : opts.from
                to      : opts.to
                text    : opts.body
                subject : opts.subject
                cc      : opts.cc
            email_server.sendMail email, (err, res) =>
                dbg("sendMail to #{opts.to} done...; got err=#{misc.to_json(err)} and res=#{misc.to_json(res)}")
                if err
                    dbg("sendMail -- error = #{misc.to_json(err)}")
                else
                    dbg("sendMail -- success = #{misc.to_json(res)}")
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
        subject : required
        body    : required
        from    : 'SageMath Help <help@sagemath.com>'
        to      : required   # array or string (if string, opens and reads from file, splitting on whitspace)
        cc      : ''
        limit   : 10         # number to send in parallel
        cb      : undefined  # cb(err, list of recipients that we succeeded in sending email to)

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
                    subject : opts.subject
                    body    : opts.body
                    from    : opts.from
                    to      : to
                    cc      : opts.cc
                    verbose : false
                    cb      : (err) ->
                        if not err
                            success.push(to)
                            cb()
                        else
                            cb("error sending email to #{to} -- #{err}")

            async.mapLimit(recipients, opts.limit, f, cb)
    ], (err) ->
        opts.cb?(err, success)
    )


