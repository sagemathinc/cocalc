###########################################
#
# An Xterm Console Window
#
###########################################

{EventEmitter} = require('events')
{copy, filename_extension, required, defaults, to_json} = require('misc')

templates        = $("#salvus-console-templates")
console_template = templates.find(".salvus-console")

class Console extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element     : required  # DOM (or jQuery) element that is replaced by this console.
            session     : undefined   # a console_session or a sage_session
            title       : ""

        @element = console_template.clone()
        @element.data("console", @)
        $(@opts.element).replaceWith(@element)
        @set_title(@opts.title)

    #######################################################################
    # Private Methods
    #######################################################################

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

    set_title: (title) ->
        @element.find(".salvus-console-title").text(title)


exports.Console = Console

$.fn.extend
    salvus_console: (opts={}) ->
        @each () ->
            console.log("HI!")
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('console', new Console(opts0))
