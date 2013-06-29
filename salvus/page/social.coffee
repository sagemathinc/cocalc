###
Social functionality
###

misc            = require('misc')
{defaults, required} = misc

exports.invite_friend = (opts) ->
    opts = defaults opts,
        email_address   : undefined   # recipient email address
        message         : undefined   # default message
        collab_projects : undefined   # id's of projects they will be auto-added to if they join

    console.log(opts)