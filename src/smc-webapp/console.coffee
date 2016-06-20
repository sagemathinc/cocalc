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


###########################################
#
# An Xterm Console Window
#
###########################################

$                = window.$
{EventEmitter}   = require('events')
{alert_message}  = require('./alerts')
misc             = require('smc-util/misc')
{copy, filename_extension, required, defaults, to_json, uuid, from_json} = require('smc-util/misc')
{redux}          = require('./smc-react')
{alert_message}  = require('./alerts')

misc_page        = require('./misc_page')

templates        = $("#salvus-console-templates")
console_template = templates.find(".salvus-console")

feature = require('./feature')

IS_MOBILE = feature.IS_MOBILE

CSI = String.fromCharCode(0x9b)

initfile_content = (fn) ->
    """# This initialization file is associated with your terminal in #{fn}.
# It is automatically run whenever it starts up -- restart the terminal via Ctrl-d and Return-key.

# Usually, your ~/.bashrc is executed and this behavior is emulated for completeness:
source ~/.bashrc

# You can export environment variables, e.g. to set custom GIT_* variables
# https://git-scm.com/book/en/v2/Git-Internals-Environment-Variables
#export GIT_AUTHOR_NAME="Your Name"
#export GIT_AUTHOR_EMAIL="your@email.address"
#export GIT_COMMITTER_NAME="Your Name"
#export GIT_COMMITTER_EMAIL="your@email.address"

# It is also possible to automatically start a program ...

#sage
#sage -ipython
#top

# ... or even define a terminal specific function.
#hello () { echo "hello world"; }
"""

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
            editor      : undefined  # FileEditor instance -- needed for some actions, e.g., opening a file
            close       : undefined  # if defined, called when close button clicked.
            reconnect   : undefined  # if defined, opts.reconnect?() is called when session console wants to reconnect; this should call set_session.

            font        :   # only for 'ttyjs' renderer
                family : undefined
                size   : undefined                           # CSS font-size in points
                line_height : 115                            # CSS line-height percentage

            highlight_mode : 'none'
            renderer       : 'ttyjs'   # options -- 'auto' (best for device); 'codemirror' (mobile support--useless), 'ttyjs' (xterm-color!)
            draggable      : false    # not very good/useful yet.

            color_scheme   : undefined

        @_init_default_settings()

        @_project_actions = smc.redux.getProjectActions(@opts.editor?.editor.project_id)

        if @opts.renderer == 'auto'
            if IS_MOBILE
                # NOT USED !! -- I stopped developing the codemirror-based version long ago; it just doesn't work.
                # IGNORE.  DELETE.
                @opts.renderer = 'codemirror'
            else
                @opts.renderer = 'ttyjs'

        # The is_focused variable keeps track of whether or not the
        # editor is focused.  This impacts the cursor, and also whether
        # messages such as open_file or open_directory are handled (see @init_mesg).
        @is_focused = false

        # Create the DOM element that realizes this console, from an HTML template.
        @element = console_template.clone()
        @textarea = @element.find(".salvus-console-textarea")

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

        @init_mesg()

        # The first time Terminal.bindKeys is called, it makes Terminal
        # listen on *all* keystrokes for the rest of the program.  It
        # only has to be done once -- any further times are ignored.
        Terminal.bindKeys(client_keydown)

        @scrollbar = @element.find(".salvus-console-scrollbar")

        @scrollbar.scroll () =>
            if @ignore_scroll
                return
            @set_term_to_scrollbar()

        @terminal.on 'scroll', (top, rows) =>
            @set_scrollbar_to_term()

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
        @_init_input_line()

        # Initialize the "set default font size" button that appears.
        @_init_font_make_default()

        # Initialize the paste bin
        @_init_paste_bin()

        # Init pausing rendering when user clicks
        @_init_rendering_pause()

        # Initialize fullscreen button -- DELETE THIS; there's a generic fullscreen now...
        #@_init_fullscreen()

        # delete scroll buttons except on mobile
        if not IS_MOBILE
            @element.find(".salvus-console-up").hide()
            @element.find(".salvus-console-down").hide()

        if opts.session?
            @set_session(opts.session)

    append_to_value: (data) =>
        # this @value is used for copy/paste of the session history.
        @value += data.replace(/\x1b\[.{1,5}m|\x1b\].*0;|\x1b\[.*~|\x1b\[?.*l/g,'')

    init_mesg: () =>
        #console.log("init_mesg")
        @_ignore_mesg = false
        @terminal.on 'mesg', (mesg) =>
            if @_ignore_mesg or not @is_focused   # ignore messages when terminal not in focus (otherwise collaboration is confusing)
                return
            try
                mesg = from_json(mesg)
                switch mesg.event
                    when 'open'
                        i = 0
                        foreground = false
                        for v in mesg.paths
                            i += 1
                            if i == mesg.paths.length
                                foreground = true
                            if v.file?
                                @_project_actions?.open_file(path:v.file, foreground:foreground)
                            if v.directory? and foreground
                                @_project_actions?.open_directory(v.directory)
            catch e
                console.log("issue parsing message -- ", e)

    set_session: (session) =>
        if @session?
            # Don't allow set_session to be called multiple times, since both sessions could
            # display data at the same time.
            console.log("BUG: set_session called after session already set -- ignoring")
            return
        # Store the remote session, which is a connection to a HUB
        # that is in turn connected to a console_server:
        @session = session

        @_ignore_mesg = true

        # Plug the remote session into the terminal.
        # Output from the terminal to the remote pty: usually caused by the user typing,
        # but can also be the result of a device attributes request, etc.
        @terminal.on 'data',  (data) =>
            @session.write_data(data)

        # The terminal receives a 'set my title' message.
        @terminal.on 'title', (title) => @set_title(title)

        @reset()

        @resize_terminal () =>

            # The remote server sends data back to us to display:
            @session.on 'data',  (data) =>
                #console.log("got #{data.length} data")
                if @_rendering_is_paused
                    @_render_buffer += data
                else
                    @render(data)

            @session.on 'reconnecting', () =>
                #console.log('terminal: reconnecting')
                @element.find(".salvus-console-terminal").css('opacity':'.5')
                @element.find("a[href=\"#refresh\"]").addClass('btn-success').find(".fa").addClass('fa-spin')

            @session.on 'reconnect', () =>
                #console.log("terminal: reconnect")
                @element.find(".salvus-console-terminal").css('opacity':'1')
                @element.find("a[href=\"#refresh\"]").removeClass('btn-success').find(".fa").removeClass('fa-spin')
                @_ignore_mesg = true
                @value = ""
                @reset()
                @resize()
                if @session.init_history?
                    #console.log("writing history")
                    try
                        @terminal.write(@session.init_history)
                    catch e
                        console.log(e)
                    #console.log("recording history for copy/paste buffer")
                    @append_to_value(@session.init_history)

                # On first write we ignore any queued terminal attributes responses that result.
                @terminal.queue = ''
                @terminal.showCursor()
                @_ignore_mesg = false

            # Initialize pinging the server to keep the console alive
            #@_init_session_ping()

            #console.log("session -- history='#{@session.init_history}'")
            if @session.init_history?
                try
                    @terminal.write(@session.init_history)
                catch e
                    console.log(e)
                # On first write we ignore any queued terminal attributes responses that result.
                @terminal.queue = ''
                @append_to_value(@session.init_history)

            @terminal.showCursor()
            setTimeout((=> @resize()), 1)  # trigger resizing, after history did load
            @_ignore_mesg = false

    render: (data) =>
        if not data?
            return
        try
            @terminal.write(data)
            if @value == ""
                #console.log("empty value")
                @resize()
            @append_to_value(data)

            if @scrollbar_nlines < @terminal.ybase
                @update_scrollbar()

            setTimeout(@set_scrollbar_to_term, 10)

            @activity_indicator()
        catch e
            # TODO -- these are all basically bugs, I think...
            # That said, try/catching them is better than having
            # the whole terminal just be broken.
            console.log("terminal error -- ",e)

    activity_indicator: () =>
        @opts.editor?.activity_indicator()

    reset: () =>
        # reset the terminal to clean; need to do this on connect or reconnect.
        #$(@terminal.element).css('opacity':'0.5').animate(opacity:1, duration:500)
        @value = ''
        @scrollbar_nlines = 0
        @terminal.reset()

    update_scrollbar: () =>
        while @scrollbar_nlines < @terminal.ybase
            @scrollbar.append($("<br>"))
            @scrollbar_nlines += 1
        @resize_scrollbar()


    pause_rendering: (immediate) =>
        if @_rendering_is_paused
            return
        @_rendering_is_paused = true
        if not @_render_buffer?
            @_render_buffer = ''
        f = () =>
            if @_rendering_is_paused
                @element.find("a[href=\"#pause\"]").addClass('btn-success').find('i').addClass('fa-play').removeClass('fa-pause')
        if immediate
            f()
        else
            setTimeout(f, 500)

    unpause_rendering: () =>
        if not @_rendering_is_paused
            return
        @_rendering_is_paused = false
        f = () =>
            @render(@_render_buffer)
            @_render_buffer = ''
        # Do the actual rendering the next time around, so that the copy operation completes with the
        # current selection instead of the post-render empty version.
        setTimeout(f, 0)
        @element.find("a[href=\"#pause\"]").removeClass('btn-success').find('i').addClass('fa-pause').removeClass('fa-play')

    #######################################################################
    # Private Methods
    #######################################################################

    _init_rendering_pause: () =>

        btn = @element.find("a[href=\"#pause\"]").click (e) =>
            if @_rendering_is_paused
                @unpause_rendering()
            else
                @pause_rendering(true)
            return false

        e = @element.find(".salvus-console-terminal")

        e.mousedown () => @pause_rendering(false)

        e.mouseup () =>
            if not getSelection().toString()
                @unpause_rendering()
                return
            s = misc_page.get_selection_start_node()
            if s.closest(e).length == 0
                # nothing in the terminal is selected
                @unpause_rendering()

        e.on('copy', @unpause_rendering)

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
        #console.log("client_keydown", ev)
        if ev.ctrlKey and ev.shiftKey
            switch ev.keyCode
                when 190       # "control-shift->"
                    @_increase_font_size()
                    return false
                when 188       # "control-shift-<"
                    @_decrease_font_size()
                    return false
        if (ev.metaKey or ev.ctrlKey) and (ev.keyCode in [17, 86, 91, 93, 223, 224])  # command or control key (could be a paste coming)
            #console.log("resetting hidden textarea")
            #console.log("clear hidden text area paste bin")
            # clear the hidden textarea pastebin, since otherwise
            # everything that the user typed before pasting appears
            # in the paste, which is very, very bad.
            # NOTE: we could do this on all keystrokes.  WE restrict as above merely for efficiency purposes.
            # See http://stackoverflow.com/questions/3902635/how-does-one-capture-a-macs-command-key-via-javascript
            @textarea.val('')
        if @_rendering_is_paused and not (ev.ctrlKey or ev.metaKey)
            @unpause_rendering()

    _increase_font_size: () =>
        @opts.font.size += 1
        if @opts.font.size <= 159
            @_font_size_changed()

    _decrease_font_size: () =>
        if @opts.font.size >= 2
            @opts.font.size -= 1
            @_font_size_changed()

    _font_size_changed: () =>
        @opts.editor?.local_storage("font-size",@opts.font.size)
        $(@terminal.element).css('font-size':"#{@opts.font.size}px")
        delete @_character_height
        @element.find(".salvus-console-font-indicator-size").text(@opts.font.size)
        @element.find(".salvus-console-font-indicator").stop().show().animate(opacity:1).fadeOut(duration:8000)
        @resize()

    _init_font_make_default: () =>
        @element.find("a[href=\"#font-make-default\"]").click () =>
            redux.getTable('account').set(terminal:{font_size:@opts.font.size})
            return false

    _init_default_settings: () =>
        settings = redux.getStore('account').get_terminal_settings()
        if not @opts.font.size?
            @opts.font.size = settings?.font_size ? 14
        if not @opts.color_scheme?
            @opts.color_scheme = settings?.color_scheme ? "default"
        if not @opts.font.family?
            @opts.font.family = settings?.font ? "monospace"

    #_init_session_ping: () =>
    #    @session.ping(@console_is_open)

    _init_codemirror: () ->
        that = @
        @terminal.custom_renderer = codemirror_renderer
        t = @textarea
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
            'font-family' : @opts.font.family + ", monospace"  # monospace fallback
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
                @_click = (e) =>
                    t = $(e.target)
                    if t[0]==@mobile_target[0] or t.hasParent(@element).length > 0
                        @focus()
                    else
                        @blur()
                $(document).on 'click', @_click
        else
            @_mousedown = (e) =>
                t = $(e.target)
                if t.hasParent(@element).length > 0
                    @focus()
                else
                    @blur()
            $(document).on 'mousedown', @_mousedown

            @_mouseup = (e) =>
                t = $(e.target)
                sel = window.getSelection().toString()
                if t.hasParent(@element).length > 0 and sel.length == 0
                    @_focus_hidden_textarea()
            $(document).on 'mouseup', @_mouseup

            $(@terminal.element).bind 'copy', (e) =>
                # re-enable paste but only *after* the copy happens
                setTimeout(@_focus_hidden_textarea, 10)

    # call this when deleting the terminal (removing it from DOM, etc.)
    remove: () =>
        if @_mousedown?
             $(document).off 'mousedown', @_mousedown
        if @_mouseup?
             $(document).off 'mouseup', @_mouseup
        if @_click?
             $(document).off 'click', @_click

    _focus_hidden_textarea: () =>
        @textarea.focus()

    _init_fullscreen: () =>
        fullscreen = @element.find("a[href=\"#fullscreen\"]")
        exit_fullscreen = @element.find("a[href=\"#exit_fullscreen\"]")
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

        @element.find("a[href=\"#increase-font\"]").click () =>
            @_increase_font_size()
            return false

        @element.find("a[href=\"#decrease-font\"]").click () =>
            @_decrease_font_size()
            return false

        @element.find("a[href=\"#close\"]").click () =>
            @opts.close?()
            return false

        @element.find("a[href=\"#refresh\"]").click () =>
            @session?.reconnect()
            return false

        @element.find("a[href=\"#paste\"]").click () =>
            id = uuid()
            s = "<h2><i class='fa project-file-icon fa-terminal'></i> Terminal Copy and Paste</h2>Copy and paste in terminals works as usual: to copy, highlight text then press ctrl+c (or command+c); press ctrl+v (or command+v) to paste. <br><br><span class='lighten'>NOTE: When no text is highlighted, ctrl+c sends the usual interrupt signal.</span><br><hr>You can copy the terminal history from here:<br><br><textarea readonly style='font-family: monospace;cursor: auto;width: 97%' id='#{id}' rows=10></textarea>"
            bootbox.alert(s)
            elt = $("##{id}")
            elt.val(@value).scrollTop(elt[0].scrollHeight)
            return false

        @element.find("a[href=\"#initfile\"]").click () =>
            initfn = misc.console_init_filename(@opts.filename)
            content = initfile_content(@opts.filename)
            {salvus_client} = require('./salvus_client')
            salvus_client.exec
                project_id  : @opts.editor?.editor.project_id
                command     : "test ! -r '#{initfn}' && echo '#{content}' > '#{initfn}'"
                bash        : true
                err_on_exit : false
                cb          : (err, output) =>
                    if err
                        alert_message(type:'error', message:"problem creating initfile: #{err}")
                    else
                        @_project_actions?.open_file(path:initfn, foreground:true)

    _init_input_line: () =>
        #if not IS_MOBILE
        #    @element.find(".salvus-console-mobile-input").hide()
        #    return

        if not IS_MOBILE
            @element.find(".salvus-console-mobile-input").hide()

        input_line = @element.find('.salvus-console-input-line')

        submit_line = () =>
            @session?.write_data(input_line.val())
            input_line.val('')

        input_line.on 'keyup', (e) =>
            if e.which == 13
                e.preventDefault()
                submit_line()
                @session?.write_data("\n")
                return false
            else if e.which == 67 and e.ctrlKey
                submit_line()
                @terminal.keyDown(keyCode:67, shiftKey:false, ctrlKey:true)

        @element.find(".salvus-console-submit-line").click () =>
            #@focus()
            submit_line()
            @session?.write_data("\n")
            return false

        @element.find(".salvus-console-submit-tab").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:9, shiftKey:false)

        @element.find(".salvus-console-submit-esc").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:27, shiftKey:false, ctrlKey:false)

        @element.find(".salvus-console-submit-up").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:38, shiftKey:false, ctrlKey:false)

        @element.find(".salvus-console-submit-down").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:40, shiftKey:false, ctrlKey:false)

        @element.find(".salvus-console-submit-left").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:37, shiftKey:false, ctrlKey:false)

        @element.find(".salvus-console-submit-right").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:39, shiftKey:false, ctrlKey:false)

        @element.find(".salvus-console-submit-ctrl-c").show().click (e) =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:67, shiftKey:false, ctrlKey:true)

        ###
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
        ###

    _init_paste_bin: () =>
        pb = @textarea

        f = (evt) =>
            data = pb.val()
            pb.val('')
            @session?.write_data(data)

        pb.on('paste', (() -> setTimeout(f,0)))

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
            width    : "97%"
            top      : h
            left     : 0
            right    : 0
            bottom   : 1

        $(@terminal.element).css
            position  : 'absolute'
            width     : "100%"
            top       : "3.5em"
            bottom    : 1

        @resize()
        @element.resizable('disable').css(opacity:1)

    # exit fullscreen mode
    exit_fullscreen: () =>
        for elt in [$(@terminal.element), @element]
            elt.css
                position : 'relative'
                top : 0<br
                width: "100%"
        @element.resizable('enable')
        @resize()

    refresh: () =>
        if @opts.renderer != 'ttyjs'
            # nothing implemented
            return
        @terminal.refresh(0, @opts.rows-1)
        @resize_scrollbar()


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

        @resize_terminal () =>

            # Resize the remote PTY
            resize_code = (cols, rows) ->
                # See http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
                # CSI Ps ; Ps ; Ps t
                # CSI[4];[height];[width]t
                return CSI + "4;#{rows};#{cols}t"
            @session.write_data(resize_code(@opts.cols, @opts.rows))

            @resize_scrollbar()


            # Refresh depends on correct @opts being set!
            @refresh()

    resize_terminal: (cb) =>
        # make the terminal DOM element almost all of its likely recently resized parent
        $(@terminal.element).css('width','99.5%')

        # The code here and below (in _resize_terminal) may seem horrible, but welcome to browser
        # DOM programming...

        # Determine size of container DOM.
        # Determine the average width of a character by inserting 10 blank spaces,
        # seeing how wide that is, and dividing by 10.  The result is typically not
        # an integer, which is why we have to use multiple characters.
        @_c = $("<span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>").prependTo(@terminal.element)

        # We have to do the actual calculation in the next render loop, since otherwise the terminal
        # might not yet have resized, or the text we just inserted might not yet be visible.
        setTimeout((()=>@_resize_terminal(cb)), 0)

    _resize_terminal: (cb) =>
        character_width = @_c.width()/10
        @_c.remove()
        elt = $(@terminal.element)

        # The above style trick for character width is not reliable for getting the height of each row.
        # For that we use the terminal itself, since it already has rows, and hopefully at least
        # one has something in it (a div).
        #
        # The row height is in fact *NOT* constant -- it can vary by 1 (say) depending
        # on what is in the row.  So we compute the maximum line height, which is safe, so
        # long as we throw out the outliers.
        heights = ($(x).height() for x in elt.children())
        # Eliminate weird outliers that sometimes appear (e.g., for last row); yes, this is
        # pretty crazy...
        heights = (x for x in heights when x <= heights[0] + 2)
        row_height = Math.max( heights ... )

        if character_width == 0 or row_height == 0
            # The editor must not yet be visible -- do nothing
            cb?()
            return

        # Determine the number of columns from the width of a character, computed above.
        font_size = @opts.font.size
        new_cols = Math.max(1,Math.floor(elt.width() / character_width))

        # Determine number of rows from the height of the row , as computed above.
        new_rows = Math.max(1,Math.floor((elt.height()-10) / row_height))

        # Resize the renderer
        @terminal.resize(new_cols, new_rows)

        # Record new size
        @opts.cols = new_cols
        @opts.rows = new_rows
        cb?()

    resize_scrollbar: () =>
        # render the scrollbar on the right
        sb = @scrollbar
        width = sb[0].offsetWidth - sb[0].clientWidth
        if width == 0
            return
        elt = $(@terminal.element)
        elt.width(@element.width() - width - 2)
        sb.width(width+2)
        sb.height(elt.height())

    set_scrollbar_to_term: () =>
        if @terminal.ybase == 0  # less than 1 page of text in buffer
            @scrollbar.hide()
            return
        else
            @scrollbar.show()

        if @ignore_scroll
            return
        @ignore_scroll = true
        f = () =>
            @ignore_scroll = false
        setTimeout(f, 100)
        max_scrolltop = @scrollbar[0].scrollHeight - @scrollbar.height()
        @scrollbar.scrollTop(max_scrolltop * @terminal.ydisp / @terminal.ybase)

    set_term_to_scrollbar: () =>
        max_scrolltop = @scrollbar[0].scrollHeight - @scrollbar.height()
        ydisp = Math.floor( @scrollbar.scrollTop() *  @terminal.ybase / max_scrolltop)
        @terminal.ydisp = ydisp
        @terminal.refresh(0, @terminal.rows-1)

    console_is_open: () =>  # not chainable
        return @element.closest(document.documentElement).length > 0

    blur: () =>
        if focused_console == @
            focused_console = undefined

        @is_focused = false
        if IS_MOBILE
            $(document).off('keydown', @mobile_keydown)

        try
            @terminal.blur()
        catch e
            # TODO: probably should investigate term.js issues further(?)
            # ignore -- sometimes in some states the terminal code can raise an exception when explicitly blur-ing.
            # This would totally break the client, which is bad, so we catch is.
        $(@terminal.element).removeClass('salvus-console-focus').addClass('salvus-console-blur')
        editor = @terminal.editor
        if editor?
            e = $(editor.getWrapperElement())
            e.removeClass('salvus-console-focus').addClass('salvus-console-blur')
            e.find(".salvus-console-cursor-focus").removeClass("salvus-console-cursor-focus").addClass("salvus-console-cursor-blur")

    focus: (force) =>
        if @is_focused and not force
            return
        focused_console = @
        @is_focused = true

        $(@terminal.element).focus()
        if not @_character_height?
            height = $(@terminal.element).height()
            if height != 0 and @opts.rows?
                @_character_height = Math.ceil(height / @opts.rows)

        @resize()

        if IS_MOBILE
            #$(document).on('keydown', @mobile_keydown)
            @element.find(".salvus-console-input-line").focus()
        else
            @terminal.focus()
            @_focus_hidden_textarea()

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
            t = $(this)
            if opts == false
                # disable existing console
                con = t.data('console')
                if con?
                    con.remove()
                return t
            else
                opts0 = copy(opts)
                opts0.element = this
                return t.data('console', new Console(opts0))

