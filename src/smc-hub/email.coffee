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
os_path      = require('path')
async        = require('async')
winston      = require('./winston-metrics').get_logger('email')

# sendgrid API: https://sendgrid.com/docs/API_Reference/Web_API/mail.html
sendgrid     = require("sendgrid")

misc         = require('smc-util/misc')
{defaults, required} = misc

{SENDGRID_TEMPLATE_ID, SENDGRID_ASM_NEWSLETTER, COMPANY_NAME, COMPANY_EMAIL, DOMAIN_NAME, SITE_NAME, DNS, HELP_EMAIL, LIVE_DEMO_REQUEST} = require('smc-util/theme')

email_server = undefined

exports.is_banned = is_banned = (address) ->
    i = address.indexOf('@')
    if i == -1
        return false
    x = address.slice(i+1).toLowerCase()
    return !! BANNED_DOMAINS[x]

# here's how I test this function:
#    require('email').send_email(subject:'TEST MESSAGE', body:'body', to:'wstein@sagemath.com', cb:console.log)
exports.send_email = (opts={}) ->
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
    dbg("#{opts.body[..200]}...")

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
            if opts.cc?.length > 0
                personalization.addCc(new helper.Email(opts.cc))
            if opts.bcc?.length > 0
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

            # dbg("sending email to #{opts.to} data -- #{misc.to_json(mail.toJSON())}")

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
                exports.send_email
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


verify_email_html = (token_url) -> """
<p style="margin-top:0;margin-bottom:10px;">
<strong>
Please <a href="#{token_url}">click here</a> to verify your email address!
If this link does not work, please copy/paste this URL into a new browser tab and open the link:
</strong>
</p>

<pre style="margin-top:10px;margin-bottom:10px;font-size:11px;">
#{token_url}
</pre>
"""

# beware, this needs to be HTML which is compatible with email-clients!
welcome_email_html = (token_url) -> """
<h1>Welcome to #{SITE_NAME}</h1>

<p style="margin-top:0;margin-bottom:10px;">
<a href="#{DOMAIN_NAME}">#{SITE_NAME}</a> is a sophisticated web service for collaborative computation.
</p>

<p style="margin-top:0;margin-bottom:20px;">
You received this email because an account with your email address was created.
This was either initiated by you, a friend or colleague invited you, or you're a student as part of a course.
</p>

#{verify_email_html(token_url)}

<hr size="1"/>

<h3>Exploring #{SITE_NAME}</h3>
<p style="margin-top:0;margin-bottom:10px;">
In #{SITE_NAME} your work happens inside <strong>private projects</strong>.
These are personal workspaces which contain your files, computational worksheets, and data.
You can run your computations through the web interface, via interactive worksheets and notebooks, or by executing a program in a terminal.
#{SITE_NAME} supports online editing of
    <a href="http://jupyter.org/">Jupyter Notebooks</a>,
    <a href="http://www.sagemath.org/">Sage Worksheets</a>,
    <a href="https://en.wikibooks.org/wiki/LaTeX">Latex files</a>, etc.
</p>

<p><strong>Software:</strong>
<ul>
<li style="margin-top:0;margin-bottom:10px;">Mathematical calculation:
    <a href="http://www.sagemath.org/">SageMath</a>,
    <a href="https://www.sympy.org/">SymPy</a>, etc.
</li>
<li style="margin-top:0;margin-bottom:10px;">Statistics and Data Science:
    <a href="https://www.r-project.org/">R project</a>,
    <a href="http://pandas.pydata.org/">Pandas</a>,
    <a href="http://www.statsmodels.org/">statsmodels</a>,
    <a href="http://scikit-learn.org/">scikit-learn</a>,
    <a href="http://www.nltk.org/">NLTK</a>, etc.
</li>
<li style="margin-top:0;margin-bottom:10px;">Various other computation:
    <a href="https://www.tensorflow.org/">Tensorflow</a>,
    <a href="https://www.gnu.org/software/octave/">Octave</a>,
    <a href="https://julialang.org/">Julia</a>, etc.
</li>
</ul>

<p style="margin-top:0;margin-bottom:20px;">
Visit our <a href="https://cocalc.com/static/doc/software.html">Software overview page</a> for more details!
</p>

<p style="margin-top:0;margin-bottom:20px;">
<strong>Collaboration:</strong>
You can invite collaborators to work with you inside a project.
Like you, they can edit the files in that project.
Edits are visible in <strong>real time</strong> for everyone online.
You can share your thoughts in a <strong>side chat</strong> next to each document.
</p>

<p style="margin-top:0;margin-bottom:10px;"><strong>More information:</strong> how to get from 0 to 100%!</p>

<ul>
<li style="margin-top:0;margin-bottom:10px;">
    <strong><a href="https://doc.cocalc.com/">#{SITE_NAME} Manual:</a></strong> learn more about #{SITE_NAME}'s features.
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://github.com/sagemathinc/cocalc/wiki">#{SITE_NAME} Wiki:</a> the entry-point to learn more about all the details.
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://github.com/sagemathinc/cocalc/wiki/sagews">Working with SageMath Worksheets</a>
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <strong><a href="https://cocalc.com/policies/pricing.html">Subscriptions:</a></strong> make hosting more robust and increase project quotas
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://doc.cocalc.com/teaching-instructors.html">Sophisticated tools for teaching a class</a>.
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://github.com/sagemathinc/cocalc/wiki/Troubleshooting">Troubleshooting connectivity issues</a>
</li>
<li style="margin-top:0;margin-bottom:10px;">
    <a href="https://github.com/sagemathinc/cocalc/wiki/MathematicalSyntaxErrors">Common mathematical syntax errors:</a> look into this if you are new to working with a programming language!
</li>
</ul>

<p style="margin-top:20px;margin-bottom:10px;">
<strong>Questions?</strong>
</p>
<p style="margin-top:0;margin-bottom:10px;">
Schedule a Live Demo with a specialist from CoCalc: <a href="#{LIVE_DEMO_REQUEST}">request form</a>.
</p>
<p style="margin-top:0;margin-bottom:20px;">
In case of problems, concerns why you received this email, or other questions please contact:
<a href="mailto:#{HELP_EMAIL}">#{HELP_EMAIL}</a>.
</p>

"""

exports.welcome_email = (opts) ->
    opts = defaults opts,
        to           : required
        token        : required    # the email verification token
        only_verify  : false       # TODO only send the verification token, for now this is good enough
        cb           : undefined

    base_url    = require('./base-url').base_url()
    token_query = encodeURI("email=#{encodeURIComponent(opts.to)}&token=#{opts.token}")
    endpoint    = os_path.join('/', base_url, 'auth/verify')
    token_url   = "#{DOMAIN_NAME}#{endpoint}?#{token_query}"

    if opts.only_verify
        subject  = "Verify your email address on #{SITE_NAME} (#{DNS})"
        body     = verify_email_html(token_url)
        category = 'verify'
    else
        subject  = "Welcome to #{SITE_NAME} - #{DNS}"
        body     = welcome_email_html(token_url)
        category = 'welcome'

    # exports... because otherwise stubbing in the test suite of send_email would not work
    exports.send_email
        subject      : subject
        body         : body
        fromname     : COMPANY_NAME
        from         : COMPANY_EMAIL
        to           : opts.to
        cb           : opts.cb
        category     : category
        asm_group    : 147985     # https://app.sendgrid.com/suppressions/advanced_suppression_manager


