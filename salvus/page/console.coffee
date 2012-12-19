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

isANDROID = require('feature').isMobile.Android()

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
        cp1 = {line:terminal.y+terminal.ydisp, ch:terminal.x}
        cp2 = {line:cp1.line, ch:cp1.ch+1}
        if terminal.salvus_console.is_focused
            e.markText(cp1, cp2, {className:'salvus-console-cursor-focus'})
        else
            e.markText(cp1, cp2, {className:'salvus-console-cursor-blur'})
        e.scrollIntoView(cp1)

        # showing an image
        #e.addLineWidget(end+terminal.ydisp, $("<img width=50 src='http://vertramp.org/2012-10-12b.png'>")[0])


class Console extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element     : required  # DOM (or jQuery) element that is replaced by this console.
            session     : required   # a console_session
            title       : ""
            rows        : 24
            cols        : 80
            highlight_mode : 'none'  # use "none" for just standard xterm colors

        @is_focused = false
        @element = console_template.clone()
        @element.data("console", @)
        $(@opts.element).replaceWith(@element)
        @set_title(@opts.title)
        @_term = new Terminal(@opts.cols,@opts.rows)
        @_term.custom_renderer = custom_renderer
        @_term.salvus_console = @
        @_term.open()
        @_term.element.className = "salvus-console-terminal"
        @element.find(".salvus-console-terminal").replaceWith(@_term.element)

        $(@_term.element).hide()

        @_session = opts.session

        @_term.on    'data',  (data) => @_session.write_data(data)
        @_term.on    'title', (title) => @set_title(title)
        @_session.on 'data',  (data) => @_term.write(data)

        @_start_session_timer(opts.session.limits.walltime)

        t = @element.find(".salvus-console-textarea")
        editor = @_term.editor = CodeMirror.fromTextArea t[0],
            lineNumbers   : true
            lineWrapping  : false
            mode          : @opts.highlight_mode   # to turn off, can just use non-existent mode name

        e = $(editor.getScrollerElement())
        e.css('height', "#{@opts.rows+0.4}em")
        e.css('background', '#fff')

        editor.on('focus', () => @focus())
        editor.on('blur', () => @blur())

        # Hide codemirror's own cursor.
        $(editor.getScrollerElement()).find('.CodeMirror-cursor').css('border-left','0px solid red')

        @element.draggable(handle:@element.find('.salvus-console-title'))
        @blur()

        # Hack to workaround the "insane" way in which Android Chrome doesn't work: http://code.google.com/p/chromium/issues/detail?id=118639
        if isANDROID
            that = @
            handle_android_change = (ed, changeObj) ->
                #log(to_json(changeObj))
                s = changeObj.text.join('\n')
                if changeObj.origin == 'input' and s.length > 0
                    that._session.write_data(s)
                    # relaceRange causes a hang if you type "ls[backspace]" right on load.
                    # Thus we use markText instead.
                    #ed.replaceRange("", changeObj.from, {line:changeObj.to.line, ch:changeObj.to.ch+1})
                    ed.markText(changeObj.from, {line:changeObj.to.line, ch:changeObj.to.ch+1}, className:"hide")
                if changeObj.next?
                    handle_android_change(ed, changeObj.next)
            editor.on('change', handle_android_change)


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
        @is_focused = false
        @_term.blur()
        editor = @_term.editor
        if editor?
            e = $(editor.getWrapperElement())
            e.removeClass('salvus-console-focus').addClass('salvus-console-blur')
            e.find(".salvus-console-cursor-focus").removeClass("salvus-console-cursor-focus").addClass("salvus-console-cursor-blur")

    focus : () =>
        @is_focused = true
        @_term.focus()
        editor = @_term.editor
        if editor?
            e = $(editor.getWrapperElement())
            e.addClass('salvus-console-focus').removeClass('salvus-console-blur')
            e.find(".salvus-console-cursor-blur").removeClass("salvus-console-cursor-blur").addClass("salvus-console-cursor-focus")

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
