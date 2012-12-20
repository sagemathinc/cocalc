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

feature = require 'feature'
IS_ANDROID = feature.isMobile.Android()
IS_MOBILE = feature.IS_MOBILE

custom_setchar = (x, y, attr, ch) ->
    @.lines[y][x] = [attr, ch];
    if @.editor?
        c = @.editor.lineCount()
        while y >= c
            ch = '\n' + ch
            c += 1
        @.editor.replaceRange(ch, {line:y, ch:x}, {line:y, ch:x+1})

custom_renderer = (terminal, start, end) ->
    console.log(start+terminal.ydisp, end+terminal.ydisp)
    if terminal.editor?
        width = terminal.cols
        e = terminal.editor

        # 1. Set the output text
        y = start
        out = ''
        while y <= end
            row = y + terminal.ydisp
            ln = this.lines[row]
            out += (ln[i][1] for i in [0...width]).join('') + '\n'
            y++
        e.replaceRange(out, {line:start+terminal.ydisp,ch:0}, {line:end+1+terminal.ydisp,ch:0})

        # 2. Mark special styles of the output text
        # y = start
        # m = 0
        # while y <= end
        #     row = y + terminal.ydisp
        #     ln = this.lines[row]
        #     for i in [0...width]
        #         data = ln[i][0]
        #         if data != terminal.defAttr
        #             m += 1
        #             if m > 30
        #                 break
        #             e.markText({line:row, ch:i}, {line:row, ch:i+1}, {className:'special'})
        #             console.log('marking some text')
        #     y++
        # console.log("DONE MARKING")

        # 3. Render the cursor
        cp1 = {line:terminal.y+terminal.ydisp, ch:terminal.x}
        cp2 = {line:cp1.line, ch:cp1.ch+1}
        if e.getRange(cp1, cp2).length == 0
            e.replaceRange(" ", cp1, cp2)
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
            highlight_mode : 'python'

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
        @_term.on    'title', ((title) => console.log("TITLE!"); @set_title(title))
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

        that = @

        # Hack to workaround the "insane" way in which Android Chrome doesn't work: http://code.google.com/p/chromium/issues/detail?id=118639
        if IS_ANDROID
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

        # Buttons
        if IS_MOBILE
            @element.find(".salvus-console-up").click () ->
                vp = editor.getViewport()
                editor.scrollIntoView({line:vp.from - 1, ch:0})

            @element.find(".salvus-console-down").click () ->
                vp = editor.getViewport()
                editor.scrollIntoView({line:vp.to, ch:0})
        else
            @element.find(".salvus-console-up").hide()
            @element.find(".salvus-console-down").hide()


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
