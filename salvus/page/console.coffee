###########################################
#
# An Xterm Console Window
#
###########################################


# Extend jQuery.fn with our new method
$.extend $.fn,
  # Name of our method & one argument (the parent selector)
  hasParent: (p) ->
    # Returns a subset of items using jQuery.filter
    @filter ->
      # Return truthy/falsey based on presence in parent
      $(p).find(this).length

{EventEmitter} = require('events')
{alert_message} = require('alerts')
{copy, filename_extension, required, defaults, to_json} = require('misc')

templates        = $("#salvus-console-templates")
console_template = templates.find(".salvus-console")

feature = require 'feature'
IS_MOBILE = feature.IS_MOBILE

CSI = String.fromCharCode(0x9b)

codemirror_renderer = (start, end) ->
    terminal = @
    if terminal.editor?
        width = terminal.cols
        e = terminal.editor

        # Set the output text
        y = start
        out = ''
        while y <= end
            row = y + terminal.ydisp
            ln = terminal.lines[row]
            out += (ln[i][1] for i in [0...width]).join('') + '\n'
            y++
        e.replaceRange(out, {line:start+terminal.ydisp,ch:0}, {line:end+1+terminal.ydisp,ch:0})

        # Render the cursor
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
            rows        : 16
            cols        : 80

            font        :   # only for 'ttyjs' renderer
                family : 'Courier, "Courier New", monospace' # CSS font-family
                size   : undefined                           # CSS font-size in pixels
                line_height : 115                            # CSS line-height percentage

            highlight_mode : 'none'
            renderer    : 'auto'   # options -- 'auto' (best for device); 'codemirror' (mobile support), 'ttyjs' (xterm-color!)
            draggable   : false

        @_init_default_settings()

        if @opts.renderer == 'auto'
            if IS_MOBILE
                @opts.renderer = 'codemirror'
            else
                @opts.renderer = 'ttyjs'

        # On mobile, only codemirror works right now...

        # The is_focused variable keeps track of whether or not the
        # editor is focused.  This impacts the cursor, at least.
        @is_focused = false

        # Create the DOM element that realizes this console, from an HTML template.
        @element = console_template.clone()

        # Record on the DOM element a reference to the console
        # instance, which is useful for client code.
        @element.data("console", @)

        # Actually put the DOM element into the (likely visible) DOM
        # in the place specified by the client.
        $(@opts.element).replaceWith(@element)

        # Set the initial title, though of course the term can change
        # this via certain escape codes.
        @set_title(@opts.title)

        # Create the new Terminal object -- this is defined in
        # static/term/term.js -- it's a nearly complete implementation of
        # the xterm protocol.

        @terminal = new Terminal
            cols: @opts.cols
            rows: @opts.rows
            client_keydown: @_client_keydown

        # this object (=@) is needed by the custom renderer, if it is used.
        @terminal.salvus_console = @

        that = @

        # Select the renderer
        switch @opts.renderer
            when 'codemirror'
                # NOTE: the codemirror renderer depends on the xterm one being defined...
                @_init_ttyjs()
                $(@terminal.element).hide()
                @_init_codemirror()
            when 'ttyjs'
                @_init_ttyjs()
                $(@terminal.element).show()
            else
                throw("Unknown renderer '#{@opts.renderer}'")

        # Initialize buttons
        @_init_buttons()

        # Initialize pinging the server to keep the console alive
        @_init_session_ping()

        # delete scroll buttons except on mobile
        if not IS_MOBILE
            @element.find(".salvus-console-up").hide()
            @element.find(".salvus-console-down").hide()

        # Store the remote session, which is a connection to a HUB
        # that is in turn connected to a console_server.
        @session = opts.session

        # Plug the remote session into the terminal.

        # The user types in the terminal, so we send the text to the remote server:
        @terminal.on 'data',  (data) =>
            #console.log("user typed: '#{data}' into #{@opts.session.session_uuid}")
            @session.write_data(data)

        # The terminal receives a 'set my title' message.
        @terminal.on 'title', (title) => @set_title(title)

        # The remote server sends data back to us to display:
        @session.on 'data',  (data) =>
            # console.log("From remote: '#{data}'")
            @terminal.write(data)


        #########################

        # Start the countdown timer, which shows how long this session will last.
        if opts.session.limits.walltime
            @_start_session_timer(opts.session.limits.walltime)

        # Set the entire console to be draggable.
        if @opts.draggable
            @element.draggable(handle:@element.find('.salvus-console-title'))

        @blur()


    #######################################################################
    # Private Methods
    #######################################################################

    _client_keydown: (ev) =>
        #console.log(ev)
        if ev.ctrlKey and ev.shiftKey
            switch ev.keyCode
                when 190       # "control-shift->"
                    @_increase_font_size()
                    return false
                when 188       # "control-shift-<"
                    @_decrease_font_size()
                    return false

    _increase_font_size: () =>
        @opts.font.size += 1
        if @opts.font.size <= 159
            @_font_size_changed()

    _decrease_font_size: () =>
        if @opts.font.size >= 2
            @opts.font.size -= 1
            @_font_size_changed()

    _font_size_changed: () =>
        $(@terminal.element).css('font-size':"#{@opts.font.size}px")
        delete @_character_height
        @resize()

    _init_default_settings: () =>
        if not @opts.font.size?
            font_size = require('account').account_settings.settings.terminal.font_size
            if not font_size?   # in case of weirdness, do not leave user screwed.
                font_size = 12
            @opts.font.size = font_size

    _init_session_ping: () =>
        @opts.session.ping(@console_is_open)

    _init_codemirror: () ->
        that = @
        @terminal.custom_renderer = codemirror_renderer
        t = @element.find(".salvus-console-textarea")
        editor = @terminal.editor = CodeMirror.fromTextArea t[0],
            lineNumbers   : false
            lineWrapping  : false
            indentUnit    : 0  # seems to have no impact (not what I want...)
            mode          : @opts.highlight_mode   # to turn off, can just use non-existent mode name

        e = $(editor.getScrollerElement())
        e.css('height', "#{@opts.rows+0.4}em")
        e.css('background', '#fff')

        editor.on('focus', that.focus)
        editor.on('blur', that.blur)

        # Hide codemirror's own cursor.
        $(editor.getScrollerElement()).find('.CodeMirror-cursor').css('border', '0px')

        # Hacks to workaround the "insane" way in which Android Chrome
        # doesn't work:
        # http://code.google.com/p/chromium/issues/detail?id=118639
        if IS_MOBILE
            handle_mobile_change = (ed, changeObj) ->
                s = changeObj.text.join('\n')
                if changeObj.origin == 'input' and s.length > 0
                    if that._next_ctrl
                        that._next_ctrl = false
                        that.terminal.keyDown(keyCode:s[0].toUpperCase().charCodeAt(0), ctrlKey:true, shiftKey:false)
                        s = s.slice(1)
                        that.element.find(".salvus-console-control").removeClass('btn-warning').addClass('btn-info')

                    if s.length > 0
                        that.session.write_data(s)
                    # relaceRange causes a hang if you type "ls[backspace]" right on load.
                    # Thus we use markText instead.
                    #ed.replaceRange("", changeObj.from, {line:changeObj.to.line, ch:changeObj.to.ch+1})
                    ed.markText(changeObj.from, {line:changeObj.to.line, ch:changeObj.to.ch+1}, className:"hide")
                if changeObj.next?
                    handle_mobile_change(ed, changeObj.next)
            editor.on('change', handle_mobile_change)

            @mobile_keydown = (ev) =>
                if ev.keyCode == 8
                    @terminal.keyDown(ev)

    _init_ttyjs: () ->
        # Create the terminal DOM objects -- only needed for this renderer
        @terminal.open()
        # Give it our style; there is one in term.js (upstream), but it is named in a too-generic way.
        @terminal.element.className = "salvus-console-terminal"
        @element.find(".salvus-console-terminal").replaceWith(@terminal.element)
        ter = $(@terminal.element)

        ter.css
            'font-family' : @opts.font.family
            'font-size'   : "#{@opts.font.size}px"
            'line-height' : "#{@opts.font.line_height}%"

        @element.resizable(alsoResize:ter).on('resize', @resize)

        # Focus/blur handler.
        if IS_MOBILE  # so keyboard appears
            if @opts.renderer == 'ttyjs'
                @mobile_target = @element.find(".salvus-console-for-mobile")
                @mobile_target.css('width', ter.css('width'))
                @mobile_target.css('height', ter.css('height'))
                $(document).on('click', (e) =>
                    t = $(e.target)
                    if t[0]==@mobile_target[0] or t.hasParent($(@element)).length > 0
                        @focus()
                    else
                        @blur()
                )
        else
            $(document).on 'click', (e) =>
                t = $(e.target)
                if t.hasParent($(@terminal.element)).length > 0
                    @focus()
                else
                    @blur()

    _init_buttons: () ->
        editor = @terminal.editor

        # Buttons
        @element.find(".salvus-console-up").click () ->
            vp = editor.getViewport()
            editor.scrollIntoView({line:vp.from - 1, ch:0})

        @element.find(".salvus-console-down").click () ->
            vp = editor.getViewport()
            editor.scrollIntoView({line:vp.to, ch:0})

        if IS_MOBILE
            @element.find(".salvus-console-tab").show().click (e) =>
                @focus()
                @terminal.keyDown(keyCode:9, shiftKey:false)

            @_next_ctrl = false
            @element.find(".salvus-console-control").show().click (e) =>
                @focus()
                @_next_ctrl = true
                $(e.target).removeClass('btn-info').addClass('btn-warning')

            @element.find(".salvus-console-esc").show().click (e) =>
                @focus()
                @terminal.keyDown(keyCode:27, shiftKey:false, ctrlKey:false)

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
    #
    refresh: () =>
        if @opts.renderer != 'ttyjs'
            # nothing implemented
            return
        @terminal.refresh(0, @opts.rows-1)

    # Determine the current size (rows and columns) of the DOM
    # element for the editor, then resize the renderer and the
    # remote PTY.
    resize: () =>
        if @opts.renderer != 'ttyjs'
            # nothing implemented except in the ttyjs case
            return

        # Determine size of container DOM.

        # Determine the width of a character using a little trick:
        c = $("<span style:'padding:0px;margin:0px;border:0px;'>X</span>").appendTo(@terminal.element)
        character_width = c.width()
        if true or not @_character_height?
            character_height = @opts.font.size+2
        else
            character_height = @_character_height
        c.remove()

        # Determine the number of columns from the width of the element.
        elt = $(@terminal.element)
        font_size = @opts.font.size
        new_cols = Math.floor(elt.width() / character_width)
        if new_cols == 0
            # The editor must not yet be visible -- do nothing
            return

        # Determine number of rows from the height of the element.
        new_rows = Math.floor(elt.height() / character_height)

        if @opts.rows == new_rows and @opts.cols == new_cols
            # nothing to do
            return

        # Resize the renderer
        @terminal.resize(new_cols, new_rows)
        @refresh()

        # Resize the remote PTY
        resize_code = (cols, rows) ->
            # See http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
            # CSI Ps ; Ps ; Ps t
            # CSI[4];[height];[width]t
            return CSI + "4;#{rows};#{cols}t"

        @session.write_data(resize_code(new_cols, new_rows))

        # Record new size
        @opts.cols = new_cols
        @opts.rows = new_rows

    console_is_open: () =>  # not chainable
        return @element.closest(document.documentElement).length > 0

    blur: () =>
        @is_focused = false
        if IS_MOBILE
            $(document).off('keydown', @mobile_keydown)

        @terminal.blur()
        $(@terminal.element).removeClass('salvus-console-focus').addClass('salvus-console-blur')
        editor = @terminal.editor
        if editor?
            e = $(editor.getWrapperElement())
            e.removeClass('salvus-console-focus').addClass('salvus-console-blur')
            e.find(".salvus-console-cursor-focus").removeClass("salvus-console-cursor-focus").addClass("salvus-console-cursor-blur")

    focus: () =>
        if not @_character_height?
            height = $(@terminal.element).height()
            if height != 0 and @opts.rows?
                @_character_height = Math.ceil(height / @opts.rows)

        @resize()

        @is_focused = true
        if IS_MOBILE
            $(document).on('keydown', @mobile_keydown)
        else
            @terminal.focus()

        $(@terminal.element).addClass('salvus-console-focus').removeClass('salvus-console-blur')
        editor = @terminal.editor
        if editor?
            e = $(editor.getWrapperElement())
            e.addClass('salvus-console-focus').removeClass('salvus-console-blur')
            e.find(".salvus-console-cursor-blur").removeClass("salvus-console-cursor-blur").addClass("salvus-console-cursor-focus")

        # Auto-defocus when not visible for 100ms.  Defocusing the
        # console when not in view is CRITICAL, since it steals the
        # keyboard completely.
        check_for_hide = () =>
            if not @element.is(":visible")
                clearInterval(timer)
                @blur()
        timer = setInterval(check_for_hide, 100)

    set_title: (title) ->
        @element.find(".salvus-console-title").text(title)


exports.Console = Console

$.fn.extend
    salvus_console: (opts={}) ->
        @each () ->
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('console', new Console(opts0))
