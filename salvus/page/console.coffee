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

focused_console = undefined
client_keydown = (ev) ->
    focused_console?.client_keydown(ev)


class Console extends EventEmitter
    constructor: (opts={}) ->
        @opts = defaults opts,
            element     : required  # DOM (or jQuery) element that is replaced by this console.
            session     : undefined  # a console_session; use .set_session to set it later instead.
            title       : ""
            filename    : ""
            rows        : 16
            cols        : 80
            resizable   : false

            font        :   # only for 'ttyjs' renderer
                family : 'Courier, "Courier New", monospace' # CSS font-family
                size   : undefined                           # CSS font-size in points
                line_height : 115                            # CSS line-height percentage

            highlight_mode : 'none'
            renderer       : 'auto'   # options -- 'auto' (best for device); 'codemirror' (mobile support), 'ttyjs' (xterm-color!)
            draggable      : false    # not very good/useful yet.

            color_scheme   : undefined

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

        @set_filename(@opts.filename)

        # Create the new Terminal object -- this is defined in
        # static/term/term.js -- it's a nearly complete implementation of
        # the xterm protocol.

        @_init_colors()

        @terminal = new Terminal
            cols: @opts.cols
            rows: @opts.rows

        # The first time Terminal.bindKeys is called, it makes Terminal
        # listen on *all* keystrokes for the rest of the program.  It
        # only has to be done once -- any further times are ignored.
        Terminal.bindKeys(client_keydown)

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

        # Initialize the "set default font size" button that appears.
        @_init_font_make_default()

        # Initialize the paste bin
        @_init_paste_bin()

        # Initialize fullscreen button
        #@_init_fullscreen()

        # delete scroll buttons except on mobile
        if not IS_MOBILE
            @element.find(".salvus-console-up").hide()
            @element.find(".salvus-console-down").hide()

        if opts.session?
            @set_session(opts.session)

        @blur()

    set_session: (session) =>
        # Store the remote session, which is a connection to a HUB
        # that is in turn connected to a console_server.
        @session = session

        # Plug the remote session into the terminal.

        # The user types in the terminal, so we send the text to the remote server:
        f = () =>
            @terminal.on 'data',  (data) =>
                @session.write_data(data)
        # TODO: We put in a delay to avoid bursting resize/controldata back at the server in response
        # when the server bursts the history back at us.  It would be better to coordinate this
        # somehow, since on a slow network, this might not be enough time.  (The history is arbitrarily
        # truncated to be small by the server, so this might be fine.)
        setTimeout(f, 250)

        # The terminal receives a 'set my title' message.
        @terminal.on 'title', (title) => @set_title(title)

        # The remote server sends data back to us to display:
        @session.on 'data',  (data) =>
            @terminal.write(data)

        # Initialize pinging the server to keep the console alive
        @_init_session_ping()

    #######################################################################
    # Private Methods
    #######################################################################

    _init_colors: () =>
        colors = Terminal.color_schemes[@opts.color_scheme].colors
        for i in [0...16]
            Terminal.colors[i] = colors[i]

        if colors.length > 16
            Terminal.defaultColors =
                fg: colors[16]
                bg: colors[17]
        else
            Terminal.defaultColors =
                fg: colors[15]
                bg: colors[0]

        Terminal.colors[256] = Terminal.defaultColors.bg
        Terminal.colors[257] = Terminal.defaultColors.fg

    client_keydown: (ev) =>
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
        @element.find(".salvus-console-font-indicator-size").text(@opts.font.size)
        @element.find(".salvus-console-font-indicator").stop().show().animate(opacity:100).fadeOut(duration:8000)
        @resize()

    _init_font_make_default: () =>
        @element.find("a[href=#font-make-default]").click () =>
            account_settings = require('account').account_settings
            account_settings.settings.terminal.font_size = @opts.font.size
            account_settings.save_to_server(cb:()=>)
            account_settings.set_view()
            return false

    _init_default_settings: () =>
        settings = require('account').account_settings.settings.terminal
        if not @opts.font.size?
            @opts.font.size = settings.font_size
            if not @opts.font.size?   # in case of weirdness, do not leave user screwed.
                @opts.font.size = 12
        if not @opts.color_scheme?
            @opts.color_scheme = settings.color_scheme
            if not @opts.color_scheme?
                @opts.color_scheme = "default"

    _init_session_ping: () =>
        @session.ping(@console_is_open)

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

        if @opts.resizable
            @element.resizable(alsoResize:ter, handles: "sw,s,se").on('resize', @resize)

        # Set the entire console to be draggable.
        if @opts.draggable
            @element.draggable(handle:@element.find('.salvus-console-title'))

        # Focus/blur handler.
        if IS_MOBILE  # so keyboard appears
            if @opts.renderer == 'ttyjs'
                @mobile_target = @element.find(".salvus-console-for-mobile").show()
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

    _init_fullscreen: () =>
        fullscreen = @element.find("a[href=#fullscreen]")
        exit_fullscreen = @element.find("a[href=#exit_fullscreen]")
        fullscreen.on 'click', () =>
            @fullscreen()
            exit_fullscreen.show()
            fullscreen.hide()
            return false
        exit_fullscreen.hide().on 'click', () =>
            @exit_fullscreen()
            exit_fullscreen.hide()
            fullscreen.show()
            return false

    _init_buttons: () ->
        editor = @terminal.editor

        @element.find("a").tooltip(delay:{ show: 500, hide: 100 })

        @element.find("a[href=#increase-font]").click () =>
            @_increase_font_size()
            return false
        @element.find("a[href=#decrease-font]").click () =>
            @_decrease_font_size()
            return false

        @element.find("a[href=#refresh]").click () =>
            @resize()
            return false

        @element.find(".salvus-console-up").click () ->
            vp = editor.getViewport()
            editor.scrollIntoView({line:vp.from - 1, ch:0})
            return false

        @element.find(".salvus-console-down").click () ->
            vp = editor.getViewport()
            editor.scrollIntoView({line:vp.to, ch:0})
            return false

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

    _init_paste_bin: () =>
        paste_bins = [@element.find(".salvus-console-paste-bin"),
                      @element.find(".salvus-console-textarea")]

        for paste_bin in paste_bins
            paste_bin.tooltip(delay:{ show: 500, hide: 100 })
            paste_bin.live 'blur keyup paste', (evt) =>
                for pb in paste_bins
                    data = pb.val()
                    pb.val('')
                    @session?.write_data(data)

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

    terminate_session: () =>
        @session?.terminate_session()

    # enter fullscreen mode
    fullscreen: () =>
        h = $(".navbar-fixed-top").height()
        @element.css
            position : 'absolute'
            width : "97%"
        .css
            top      : h
            left     : 0
            right    : 0
            bottom   : 1

        $(@terminal.element).css
            position  : 'absolute'
            width     : "97%"
            top       : "3.5em"
            bottom    : 1

        @resize()
        @element.resizable('disable').css(opacity:1)

    # exit fullscreen mode
    exit_fullscreen: () =>
        for elt in [$(@terminal.element), @element]
            elt.css
                position : 'relative'
                top : 0
                width: "100%"
        @element.resizable('enable')
        @resize()

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

        if not @session?
            # don't bother if we don't even have a remote connection
            # (todo: could queue this up to send)
            return

        # Determine size of container DOM.
        # Determine the width of a character using a little trick:
        c = $("<span style:'padding:0px;margin:0px;border:0px;'>X</span>").appendTo(@terminal.element)
        character_width = c.width()
        c.remove()
        elt = $(@terminal.element)

        # The above trick is not reliable for getting the height of each row.  For that we use
        # the terminal itself.
        row_height = elt.children(":first").height()

        if character_width == 0 or row_height == 0
            # The editor must not yet be visible -- do nothing
            return

        # Determine the number of columns from the width of a character, computed above.
        font_size = @opts.font.size
        new_cols = Math.max(1,Math.floor(elt.width() / character_width))

        # Determine number of rows from the height of the row , as computed above.
        new_rows = Math.max(1,Math.floor(elt.height() / row_height))

        # Resize the renderer
        @terminal.resize(new_cols, new_rows)

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

        # Refresh depends on correct @opts being set!
        @refresh()

    console_is_open: () =>  # not chainable
        return @element.closest(document.documentElement).length > 0

    blur: () =>
        if focused_console == @
            focused_console = undefined

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
        focused_console = @

        $(@terminal.element).focus()
        if not @_character_height?
            height = $(@terminal.element).height()
            if height != 0 and @opts.rows?
                @_character_height = Math.ceil(height / @opts.rows)

        @resize()

        if IS_MOBILE
            $(document).on('keydown', @mobile_keydown)
        else
            @terminal.focus()
            if not @is_focused
                @element.find(".salvus-console-textarea").focus()

        @is_focused = true
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

    set_filename: (filename) ->
        @element.find(".salvus-console-filename").text(filename)


exports.Console = Console

$.fn.extend
    salvus_console: (opts={}) ->
        @each () ->
            opts0 = copy(opts)
            opts0.element = this
            $(this).data('console', new Console(opts0))
