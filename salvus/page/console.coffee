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
            session     : required   # a console_session
            title       : ""

        @element = console_template.clone()
        @element.data("console", @)
        $(@opts.element).replaceWith(@element)
        @set_title(@opts.title)
        @_term = new Terminal(100,20)
        @_term.open()
        @_term.element.className = "salvus-console-terminal"
        @element.find(".salvus-console-terminal").replaceWith(@_term.element)

        @_session = opts.session

        @_term.on    'data',  (data) => @_session.write_data(data)
        @_term.on    'title',(title) => @set_title(title)
        @_session.on 'data',  (data) => @_term.write(data)


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
