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


{defaults, to_json} = require("misc")
{salvus_client} = require('./salvus_client')

types = ['error', 'default', 'success', 'info']
default_timeout =
    error   : 5
    default : 2
    success : 2
    info    : 3

$("#alert-templates").hide()

exports.alert_message = (opts={}) ->
    opts = defaults opts,
        type    : 'default'
        message : defaults.required
        block   : undefined
        timeout : undefined  # time in seconds
    if not opts.timeout?
        opts.timeout = default_timeout[opts.type]

    if typeof opts.message != "string"
        opts.message = to_json(opts.message)

    if not opts.block?
        if opts.type == 'error'
            opts.block = true
        else
            opts.block = false

    if opts.type not in types
        alert("Unknown alert_message type #{opts.type}.")
        return

    $.pnotify
        title           : ""
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
        require('./salvus_client').salvus_client.log_error(opts.message)

    return

    # c = $("#alert-templates .alert-#{opts.type}").clone()

    # if opts.block
    #     c.addClass('alert-block')
    # c.find(".message").text(opts.message)
    # c.prependTo("#alert-messages")
    # c.click(() -> $(this).remove())

    # setTimeout((()->c.remove()), opts.timeout*1000)

local_time = new Date()
if Math.abs(salvus_client.server_time() - local_time) > 60000
    exports.alert_message(type:'error', timeout:30,  message:"Your computer's clock is off by over a minute. Please fix it.")
# for testing/development
# alert_message(type:'error',   message:"This is an error")
# alert_message(type:'default', message:"This is a default alert")
# alert_message(type:'success', message:"This is a success alert")
# alert_message(type:'info',    message:"This is an info alert")