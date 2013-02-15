{defaults, to_json} = require("misc")

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

    $.pnotify
        title : ""
        type : opts.type
        text  : opts.message
        nonblock : false
        animation_speed: "fast"
        closer_hover : false
        opacity : 0.9
        delay : opts.timeout*1000
    return

    if not opts.block?
        if opts.type == 'error'
            opts.block = true
        else
            opts.block = false

    if typeof opts.message != "string"
        opts.message = to_json(opts.message)

    if opts.type not in types
        alert("Unknown alert_message type #{opts.type}.")
        return

    c = $("#alert-templates .alert-#{opts.type}").clone()

    if opts.block
        c.addClass('alert-block')
    c.find(".message").text(opts.message)
    c.prependTo("#alert-messages")
    c.click(() -> $(this).remove())

    setTimeout((()->c.remove()), opts.timeout*1000)

# for testing/development
# alert_message(type:'error',   message:"This is an error")
# alert_message(type:'default', message:"This is a default alert")
# alert_message(type:'success', message:"This is a success alert")
# alert_message(type:'info',    message:"This is an info alert")


