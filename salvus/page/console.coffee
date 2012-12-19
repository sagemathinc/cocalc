###########################################
#
# An Xterm Console Window
#
###########################################

{EventEmitter} = require('events')
{alert_message} = require('alerts')
{copy, filename_extension, required, defaults, to_json} = require('misc')

templates        = $("#salvus-console-templates")
console_template = templates.find(".salvus-console")

custom_renderer = (terminal, start, end) ->
    width = terminal.cols
    if terminal.editor?
        e = terminal.editor
        y = start
        out = ''
        while y <= end
            row = y + terminal.ydisp
            ln = this.lines[row]
            out += (ln[j][1] for j in [0...width]).join('') + '\n'
            #console.log("setLine(#{y},'#{r}'")
            y++

        #terminal.editor.replaceRange(out, {line:start,ch:0}, {line:end+1,ch:0})
        e.replaceRange(out, {line:start+terminal.ydisp,ch:0}, {line:end+1+terminal.ydisp,ch:0})
        cursor_pos = {line:terminal.y+terminal.ydisp, ch:terminal.x}
        e.setCursor(cursor_pos)
        e.scrollIntoView(cursor_pos)

        # proof that we have total control over text output
        # e.markText({line:end+terminal.ydisp,ch:0}, {line:end+1+terminal.ydisp,ch:0}, {className:'salvus-console-red'})

        # try showing an image
        #e.addLineWidget(end+terminal.ydisp, $("<img width=50 src='http://vertramp.org/2012-10-12b.png'>")[0])


class Console extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element     : required  # DOM (or jQuery) element that is replaced by this console.
            session     : required   # a console_session
            title       : ""
            rows        : 24
            cols        : 80
            highlight_mode : 'shell'

        @element = console_template.clone()
        @element.data("console", @)
        $(@opts.element).replaceWith(@element)
        @set_title(@opts.title)
        @_term = new Terminal(@opts.cols,@opts.rows)
        @_term.custom_renderer = custom_renderer
        @_term.open()
        @_term.element.className = "salvus-console-terminal"
        @element.find(".salvus-console-terminal").replaceWith(@_term.element)

        $(@_term.element).hide()

        @_session = opts.session

        @_term.on    'data',  (data) => @_session.write_data(data)
        @_term.on    'title',(title) => @set_title(title)
        @_session.on 'data',  (data) => @_term.write(data)

        @_start_session_timer(opts.session.limits.walltime)

        t = @element.find(".salvus-console-textarea")
        @_term.editor = CodeMirror.fromTextArea t[0],
            lineNumbers:true
            lineWrapping:false
            readOnly:true
            mode:@opts.highlight_mode   # to turn off, can just use non-existent mode name
            matchBrackets:true

        e = $(@_term.editor.getScrollerElement())
        e.css('height', "#{@opts.rows+1}em")
        e.css('background', '#fff')

        @_term.editor.on('focus', () => @focus())
        @_term.editor.on('blur', () => @blur())
        @_term.editor.setValue(("\n" for i in [1...@opts.rows-1]).join(""))

        @element.draggable(handle:@element.find('.salvus-console-title'))
        @blur()

    #######################################################################
    # Private Methods
    #######################################################################
    _start_session_timer: (seconds) ->
        t = new Date()
        t.setTime(t.getTime() + seconds*1000)
        @element.find(".salvus-console-countdown").show().countdown('destroy').countdown
            until      : t
            compact    : true
            layout     : '{hnn}{sep}{mnn}{sep}{snn}'
            expiryText : "Console session killed (after #{seconds} seconds)"
            onExpiry   : () ->
                alert_message(type:"info", message:"Console session killed (after #{seconds} seconds).")

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

    blur : () =>
        @_term.blur()
        if @_term.editor?
            $(@_term.editor.getWrapperElement()).removeClass('salvus-console-focus').addClass('salvus-console-blur')

    focus : () =>
        @_term.focus()
        e = @_term.editor
        if e?
            $(e.getWrapperElement()).addClass('salvus-console-focus').removeClass('salvus-console-blur')

            # This doesn't do anything useful in practice.
            pos = {line:@_term.y+@_term.ydisp, ch:@_term.x}
            console.log(pos)
            if pos.line? and pos.ch?
                e.setCursor(pos)
                e.scrollIntoView(pos)

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
