###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
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

$                   = window.$
misc                = require('misc')
{defaults, to_json} = misc
{salvus_client}     = require('./salvus_client')

types = ['error', 'default', 'success', 'info']
default_timeout =
    error   : 5
    default : 2
    success : 2
    info    : 3

$("#alert-templates").hide()

last_shown = {}

exports.alert_message = (opts={}) ->
    opts = defaults opts,
        type    : 'default'
        title   : undefined
        message : defaults.required
        block   : undefined
        timeout : undefined  # time in seconds
    if not opts.timeout?
        opts.timeout = default_timeout[opts.type]

    if typeof opts.message != "string"
        opts.message = to_json(opts.message)

    # Don't show the exact same alert message more than once per 5s.
    # This prevents a screenful of identical useless messages, which
    # is just annoying and useless.
    hash = misc.hash_string(opts.message + opts.type)
    if last_shown[hash] >= misc.server_seconds_ago(5)
        return
    last_shown[hash] = misc.server_time()

    if not opts.block?
        if opts.type == 'error'
            opts.block = true
        else
            opts.block = false

    if opts.type not in types
        alert("Unknown alert_message type #{opts.type}.")
        return

    $.pnotify
        title           : opts.title ? ''
        type            : opts.type
        text            : opts.message
        nonblock        : false
        animation_speed : "fast"
        closer_hover    : false
        opacity         : 0.9
        delay           : opts.timeout*1000

    if opts.type == 'error'
        # Send the same error message to the backend hub so
        # that us developers know what errors people are hitting.
        # There really should be no situation where users *regularly*
        # get error alert messages.
        salvus_client.log_error(opts.message)

    return

    # c = $("#alert-templates .alert-#{opts.type}").clone()

    # if opts.block
    #     c.addClass('alert-block')
    # c.find(".message").text(opts.message)
    # c.prependTo("#alert-messages")
    # c.click(() -> $(this).remove())

    # setTimeout((()->c.remove()), opts.timeout*1000)

check_for_clock_skew = () ->
    local_time = new Date()
    if Math.abs(salvus_client.server_time() - local_time) > 60000
        exports.alert_message(type:'error', timeout:30,  message:"Your computer's clock is off by over a minute.  Please set it correctly.")

# Wait until after the page is loaded and clock sync'd before checking for skew.
setTimeout(check_for_clock_skew, 60000)

# for testing/development
# alert_message(type:'error',   message:"This is an error")
# alert_message(type:'default', message:"This is a default alert")
# alert_message(type:'success', message:"This is a success alert")
# alert_message(type:'info',    message:"This is an info alert")

# Make it so alert_message can be used by user code, e.g., in sage worksheets.
window?.alert_message = exports.alert_message