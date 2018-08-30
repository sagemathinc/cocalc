###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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

ACTIVE_INTERVAL_MS = 10000

MAX_TERM_HISTORY = 500000

$                = window.$

{debounce}       = require('underscore')

{EventEmitter}   = require('events')
{alert_message}  = require('./alerts')
misc             = require('smc-util/misc')
{copy, filename_extension, required, defaults, to_json, uuid, from_json} = require('smc-util/misc')
{redux}          = require('./app-framework')
{alert_message}  = require('./alerts')

misc_page        = require('./misc_page')

templates        = $("#webapp-console-templates")
console_template = templates.find(".webapp-console")

{delay} = require('awaiting')

feature = require('./feature')

IS_TOUCH = feature.IS_TOUCH  # still have to use crappy mobile for now on

initfile_content = (filename) ->
    """# This initialization file is associated with your terminal in #{filename}.
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

focused_console = undefined
client_keydown = (ev) ->
    focused_console?.client_keydown(ev)

class Console extends EventEmitter
    constructor: (opts={}) ->
        super()
        @opts = defaults opts,
            element     : required  # DOM (or jQuery) element that is replaced by this console.
            project_id  : required
            path        : required
            title       : ""
            filename    : ""
            rows        : 40
            cols        : 100
            editor      : undefined  # FileEditor instance -- needed for some actions, e.g., opening a file
            close       : undefined  # if defined, called when close button clicked.
            reconnect   : undefined  # if defined, opts.reconnect?() is called when session console wants to reconnect; this should call set_session.

            font        :
                family : undefined
                size   : undefined                           # CSS font-size in points
                line_height : 120                            # CSS line-height percentage

            highlight_mode : 'none'
            color_scheme   : undefined
            on_pause       : undefined # Called after pause_rendering is called
            on_unpause     : undefined # Called after unpause_rendering is called
            on_reconnecting: undefined
            on_reconnected : undefined
            set_title      : undefined

        @_init_default_settings()

        @project_id = @opts.project_id
        @path = @opts.path

        @mark_file_use = debounce(@mark_file_use, 3000)
        @resize        = debounce(@resize, 500)

        @_project_actions = redux.getProjectActions(@project_id)

        # The is_focused variable keeps track of whether or not the
        # editor is focused.  This impacts the cursor, and also whether
        # messages such as open_file or open_directory are handled (see @init_mesg).
        @is_focused = false

        # Create the DOM element that realizes this console, from an HTML template.
        @element = console_template.clone()
        @textarea = @element.find(".webapp-console-textarea")

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

        @terminal.IS_TOUCH = IS_TOUCH

        @terminal.on 'title', (title) => @set_title(title)

        @init_mesg()

        # The first time Terminal.bindKeys is called, it makes Terminal
        # listen on *all* keystrokes for the rest of the program.  It
        # only has to be done once -- any further times are ignored.
        Terminal.bindKeys(client_keydown)

        @scrollbar = @element.find(".webapp-console-scrollbar")

        @scrollbar.scroll () =>
            if @ignore_scroll
                return
            @set_term_to_scrollbar()

        @terminal.on 'scroll', (top, rows) =>
            @set_scrollbar_to_term()

        @terminal.on 'data', (data) =>
            @conn?.write(data)

        @_init_ttyjs()

        # Initialize buttons
        @_init_buttons()
        @_init_input_line()

        # Initialize the "set default font size" button that appears.
        @_init_font_make_default()

        # Initialize the paste bin
        @_init_paste_bin()

        # Init pausing rendering when user clicks
        @_init_rendering_pause()

        @textarea.on 'blur', =>
            if @_focusing?          # see comment in @focus.
                 @_focus_hidden_textarea()

        # delete scroll buttons except on mobile
        if not IS_TOUCH
            @element.find(".webapp-console-up").hide()
            @element.find(".webapp-console-down").hide()

        @connect()

    connect: =>
        {webapp_client} = require('./webapp_client')
        ws = await webapp_client.project_websocket(@project_id)
        @conn = await ws.api.terminal(@path)
        @conn.on 'end', =>
            if @conn?
                @connect()
        @_ignore = true
        @conn.on 'data', (data) =>
            #console.log("@conn got data '#{data}'")
            #console.log("@conn got data of length", data.length)
            if typeof(data) == 'string'
                if @_rendering_is_paused
                    @_render_buffer ?= ''
                    @_render_buffer += data
                else
                    @render(data)
            else if typeof(data) == 'object'
                @handle_control_mesg(data)
        @resize_terminal()

    reconnect: =>
        @disconnect()
        @connect()

    handle_control_mesg: (data) =>
        #console.log('terminal command', data)
        switch data.cmd
            when 'size'
                @handle_resize(data.rows, data.cols)
                break
            when 'burst'
                @element.find(".webapp-burst-indicator").show()
                break
            when 'no-burst'
                @element.find(".webapp-burst-indicator").fadeOut(2000)
                break
            when 'no-ignore'
                delete @_ignore
                break
            when 'close'
                # remote request that we close this tab, e.g., one user
                # booting all others out of his terminal session.
                alert_message(type:'info', message:"You have been booted out of #{@opts.filename}.")
                @_project_actions?.close_file(@opts.filename)
                @_project_actions?.set_active_tab('files')
                break

    handle_resize: (rows, cols) =>
        # Resize the renderer
        @_terminal_size = {rows:rows, cols:cols}
        @terminal.resize(cols, rows)
        @element.find(".webapp-console-terminal").css({width:null, height:null})
        @full_rerender()

    append_to_value: (data) =>
        # this @value is used for copy/paste of the session history and @value_orig for resize/refresh
        @value_orig ?= ''
        @value_orig += data
        @value += data.replace(/\x1b\[.{1,5}m|\x1b\].*0;|\x1b\[.*~|\x1b\[?.*l/g,'')
        if @value_orig.length > MAX_TERM_HISTORY
            @value_orig = @value_orig.slice(@value_orig.length - Math.round(MAX_TERM_HISTORY/1.5))
            @full_rerender()


    init_mesg: () =>
        @terminal.on 'mesg', (mesg) =>
            if @_ignore or not @is_focused   # ignore messages when terminal not in focus (otherwise collaboration is confusing)
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

    reconnect_if_no_recent_data: =>
        #console.log 'check for recent data'
        if not @_got_remote_data? or new Date() - @_got_remote_data >= 15000
            #console.log 'reconnecting since no recent data'
            @reconnect()

    ###
    set_session: (session) =>
        if @session?
            # Don't allow set_session to be called multiple times, since both sessions could
            # display data at the same time.
            console.warn("BUG: set_session called after session already set -- ignoring")
            return

        # Store the remote session, which is a connection to a HUB
        # that is in turn connected to a console_server:
        @session = session

        @_connected = true
        @_needs_resize = true

        # Plug the remote session into the terminal.
        # data = output *from the local terminal* to the remote pty.
        # This is usually caused by the user typing,
        # but can also be the result of a device attributes request.
        @terminal.on 'data',  (data) =>
            if @_ignore
                return
            if not @_connected
                # not connected, so first connect, then write the data.
                @session.reconnect (err) =>
                    if not err
                        @session.write_data(data)
                return

            @session.write_data(data)

            # In case nothing comes back soon, we reconnect -- maybe the session is dead?
            # We wait 20x the ping time (or 10s), so if connection is slow, this won't
            # constantly reconnect, but it is very fast in case the connection is fast.
            {webapp_client} = require('./webapp_client')
            latency = webapp_client.latency()
            if latency?
                delay = Math.min(10000, latency*20)
                setTimeout(@reconnect_if_no_recent_data, delay)

        # The terminal receives a 'set my title' message.
        @terminal.on 'title', (title) => @set_title(title)

        @reset()

        # We resize the terminal first before replaying history, etc. so that it looks better,
        # and also the terminal has initialized so it can show the history.
        @resize_terminal()
        @config_session()
    ###

    set_state_connected: =>
        @element.find(".webapp-console-terminal").css('opacity':'1')
        @element.find("a[href=\"#refresh\"]").removeClass('btn-success').find(".fa").removeClass('fa-spin')

    set_state_disconnected:  =>
        @element.find(".webapp-console-terminal").css('opacity':'.5')
        @element.find("a[href=\"#refresh\"]").addClass('btn-success').find(".fa").addClass('fa-spin')

    ###
    config_session: () =>
        # The remote server sends data back to us to display:
        @session.on 'data',  (data) =>
            # console.log("terminal got #{data.length} characters -- '#{data}'")
            @_got_remote_data = new Date()
            @set_state_connected()  # connected if we are getting data.
            if @_rendering_is_paused
                @_render_buffer += data
            else
                @render(data)

            if @_needs_resize
                @resize()

        @session.on 'reconnecting', () =>
            #console.log('terminal: reconnecting')
            @_reconnecting = new Date()
            @set_state_disconnected()

        @session.on 'reconnect', () =>
            delete @_reconnecting
            partial_code = false
            @_needs_resize = true  # causes a resize when we next get data.
            @_connected = true
            @_got_remote_data = new Date()
            @set_state_connected()
            @reset()
            if @session.init_history?
                #console.log("writing history")
                try
                    ignore = @_ignore
                    @_ignore = true
                    @terminal.write(@session.init_history)
                    @_ignore = ignore
                catch e
                    console.log(e)
                #console.log("recording history for copy/paste buffer")
                @append_to_value(@session.init_history)

            # On first write we ignore any queued terminal attributes responses that result.
            @terminal.queue = ''
            @terminal.showCursor()

        @session.on 'close', () =>
            @_connected = false

        # Initialize pinging the server to keep the console alive
        #@_init_session_ping()

        if @session.init_history?
            #console.log("session -- history.length='#{@session.init_history.length}'")
            try
                ignore = @_ignore
                @_ignore = true
                @terminal.write(@session.init_history)
                @_ignore = ignore
            catch e
                console.log(e)
            # On first write we ignore any queued terminal attributes responses that result.
            @terminal.queue = ''
            @append_to_value(@session.init_history)

        @terminal.showCursor()
        @resize()
    ###

    render: (data) =>
        if not data?
            return
        try
            @terminal.write(data)
            @append_to_value(data)

            if @scrollbar_nlines < @terminal.ybase
                @update_scrollbar()

            setTimeout(@set_scrollbar_to_term, 10)
            # See https://github.com/sagemathinc/cocalc/issues/1301
            #redux.getProjectActions(@project_id).flag_file_activity(@path)
        catch e
            # WARNING -- these are all basically bugs, I think...
            # That said, try/catching them is better than having
            # the whole terminal just be broken.
            console.warn("terminal error -- ",e)

    reset: () =>
        # reset the terminal to clean; need to do this on connect or reconnect.
        #$(@terminal.element).css('opacity':'0.5').animate(opacity:1, duration:500)
        @value = @value_orig = ''
        @scrollbar_nlines = 0
        @scrollbar.empty()
        @terminal.reset()

    update_scrollbar: () =>
        while @scrollbar_nlines < @terminal.ybase
            @scrollbar.append($("<br>"))
            @scrollbar_nlines += 1

    pause_rendering: (immediate) =>
        if @_rendering_is_paused
            return
        #console.log 'pause_rendering'
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
        @opts.on_pause?()

    unpause_rendering: () =>
        if not @_rendering_is_paused
            return
        #console.log 'unpause_rendering'
        @_rendering_is_paused = false
        f = () =>
            @render(@_render_buffer)
            @_render_buffer = ''
        # Do the actual rendering the next time around, so that the copy operation completes with the
        # current selection instead of the post-render empty version.
        setTimeout(f, 0)
        @element.find("a[href=\"#pause\"]").removeClass('btn-success').find('i').addClass('fa-pause').removeClass('fa-play')
        @opts.on_unpause?()

    #######################################################################
    # Private Methods
    #######################################################################

    _on_pause_button_clicked: (e) =>
        if @_rendering_is_paused
            @unpause_rendering()
        else
            @pause_rendering(true)
        return false

    _init_rendering_pause: () =>

        btn = @element.find("a[href=\"#pause\"]").click (e) =>
            if @_rendering_is_paused
                @unpause_rendering()
            else
                @pause_rendering(true)
            return false

        e = @element.find(".webapp-console-terminal")
        e.mousedown () =>
            @pause_rendering(false)

        e.mouseup () =>
            if not getSelection().toString()
                @unpause_rendering()
                return
            s = misc_page.get_selection_start_node()
            if s.closest(e).length == 0
                # nothing in the terminal is selected
                @unpause_rendering()

        e.on 'copy', =>
            @unpause_rendering()
            setTimeout(@focus, 5)  # must happen in next cycle or copy will not work due to loss of focus.

    mark_file_use: () =>
        redux.getActions('file_use').mark_file(@project_id, @path, 'edit')

    client_keydown: (ev) =>
        #console.log("client_keydown")
        @allow_resize = true

        if @_ignore
            # no matter what cancel ignore if the user starts typing, since we absolutely must not loose anything they type.
            @_ignore = false

        @mark_file_use()

        if ev.ctrlKey and ev.shiftKey
            switch ev.keyCode
                when 190       # "control-shift->"
                    @_increase_font_size()
                    return false
                when 188       # "control-shift-<"
                    @_decrease_font_size()
                    return false
        if (ev.metaKey or ev.ctrlKey or ev.altKey) and (ev.keyCode in [17, 86, 91, 93, 223, 224])  # command or control key (could be a paste coming)
            #console.log("resetting hidden textarea")
            #console.log("clear hidden text area paste bin")
            # clear the hidden textarea pastebin, since otherwise
            # everything that the user typed before pasting appears
            # in the paste, which is very, very bad.
            # NOTE: we could do this on all keystrokes.  WE restrict as above merely for efficiency purposes.
            # See http://stackoverflow.com/questions/3902635/how-does-one-capture-a-macs-command-key-via-javascript
            @textarea.val('')
        if @_rendering_is_paused
            if not (ev.ctrlKey or ev.metaKey or ev.altKey)
                @unpause_rendering()
            else
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
        @opts.editor?.local_storage("font-size",@opts.font.size)
        $(@terminal.element).css('font-size':"#{@opts.font.size}px")
        @element.find(".webapp-console-font-indicator-size").text(@opts.font.size)
        @element.find(".webapp-console-font-indicator").stop().show().animate(opacity:1).fadeOut(duration:8000)
        @resize_terminal()

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

    _init_ttyjs: () ->
        # Create the terminal DOM objects
        @terminal.open()
        @terminal.set_color_scheme(@opts.color_scheme)

        # Give it our style; there is one in term.js (upstream), but it is named in a too-generic way.
        @terminal.element.className = "webapp-console-terminal"
        ter = $(@terminal.element)
        @element.find(".webapp-console-terminal").replaceWith(ter)

        ter.css
            'font-family' : @opts.font.family + ", monospace"  # monospace fallback
            'font-size'   : "#{@opts.font.size}px"
            'line-height' : "#{@opts.font.line_height}%"

        # Focus/blur handler.
        if IS_TOUCH  # so keyboard appears
            @mobile_target = @element.find(".webapp-console-for-mobile").show()
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
                if $(e.target).hasParent(@element).length > 0
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
        @disconnect()
        if @_mousedown?
             $(document).off('mousedown', @_mousedown)
        if @_mouseup?
             $(document).off('mouseup', @_mouseup)
        if @_click?
             $(document).off('click', @_click)

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

        @element.find("a[href=\"#refresh\"]").click () =>
            @reconnect()
            return false

        @element.find("a[href=\"#paste\"]").click () =>
            id = uuid()
            s = "<h2><i class='fa project-file-icon fa-terminal'></i> Terminal Copy and Paste</h2>Copy and paste in terminals works as usual: to copy, highlight text then press ctrl+c (or command+c); press ctrl+v (or command+v) to paste. <br><br><span class='lighten'>NOTE: When no text is highlighted, ctrl+c sends the usual interrupt signal.</span><br><hr>You can copy the terminal history from here:<br><br><textarea readonly style='font-family: monospace;cursor: auto;width: 97%' id='#{id}' rows=10></textarea>"
            bootbox.alert(s)
            elt = $("##{id}")
            elt.val(@value).scrollTop(elt[0].scrollHeight)
            return false

        @element.find("a[href=\"#boot\"]").click () =>
            @conn?.write({cmd:'boot'})
            alert_message(type:'info', message:"This terminal should now close for all other users, which allows you to resize it as large as you want.")

        @element.find("a[href=\"#initfile\"]").click () =>
            initfn = misc.console_init_filename(@opts.filename)
            content = initfile_content(@opts.filename)
            {webapp_client} = require('./webapp_client')
            webapp_client.exec
                project_id  : @project_id
                command     : "test ! -r '#{initfn}' && echo '#{content}' > '#{initfn}'"
                bash        : true
                err_on_exit : false
                cb          : (err, output) =>
                    if err
                        alert_message(type:'error', message:"problem creating initfile: #{err}")
                    else
                        @_project_actions?.open_file(path:initfn, foreground:true)

    open_copyable_history: () =>
        id = uuid()
        s = "<h2><i class='fa project-file-icon fa-terminal'></i> Terminal Copy and Paste</h2>Copy and paste in terminals works as usual: to copy, highlight text then press ctrl+c (or command+c); press ctrl+v (or command+v) to paste. <br><br><span class='lighten'>NOTE: When no text is highlighted, ctrl+c sends the usual interrupt signal.</span><br><hr>You can copy the terminal history from here:<br><br><textarea readonly style='font-family: monospace;cursor: auto;width: 97%' id='#{id}' rows=10></textarea>"
        bootbox.alert(s)
        elt = $("##{id}")
        elt.val(@value).scrollTop(elt[0].scrollHeight)

    open_init_file: ()  =>
        initfn = misc.console_init_filename(@opts.filename)
        content = initfile_content(@opts.filename)
        {webapp_client} = require('./webapp_client')
        webapp_client.exec
            project_id  : @project_id
            command     : "test ! -r '#{initfn}' && echo '#{content}' > '#{initfn}'"
            bash        : true
            err_on_exit : false
            cb          : (err, output) =>
                if err
                    alert_message(type:'error', message:"problem creating initfile: #{err}")
                else
                    @_project_actions?.open_file(path:initfn, foreground:true)

    _init_input_line: () =>
        #if not IS_TOUCH
        #    @element.find(".webapp-console-mobile-input").hide()
        #    return

        if not IS_TOUCH
            @element.find(".webapp-console-mobile-input").hide()

        input_line = @element.find('.webapp-console-input-line')

        input_line.on 'focus', =>
            @_input_line_is_focused = true
            @terminal.blur()
        input_line.on 'blur', =>
            @_input_line_is_focused = false

        submit_line = () =>
            x = input_line.val()
            # Apple text input replaces single and double quotes by some stupid
            # fancy unicode, which is incompatible with most uses in the terminal.
            # Here we switch it back.  (Note: not doing exactly this renders basically all
            # dev related tools on iPads very frustrating.  Not so, CoCalc :-)
            x = misc.replace_all(x, '“','"')
            x = misc.replace_all(x, '”','"')
            x = misc.replace_all(x, '‘',"'")
            x = misc.replace_all(x, '’',"'")
            x = misc.replace_all(x, '–', "--")
            x = misc.replace_all(x, '—', "---")
            @_ignore = false
            @conn?.write(x)
            input_line.val('')

        input_line.on 'keydown', (e) =>
            if e.which == 13
                e.preventDefault()
                submit_line()
                @_ignore = false
                @conn?.write("\n")
                return false
            else if e.which == 67 and e.ctrlKey
                submit_line()
                @terminal.keyDown(keyCode:67, shiftKey:false, ctrlKey:true)

        @element.find(".webapp-console-submit-line").click () =>
            #@focus()
            submit_line()
            @_ignore = false
            @conn?.write("\n")
            return false

        @element.find(".webapp-console-submit-submit").click () =>
            #@focus()
            submit_line()
            return false

        @element.find(".webapp-console-submit-tab").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:9, shiftKey:false)

        @element.find(".webapp-console-submit-esc").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:27, shiftKey:false, ctrlKey:false)

        @element.find(".webapp-console-submit-up").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:38, shiftKey:false, ctrlKey:false)

        @element.find(".webapp-console-submit-down").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:40, shiftKey:false, ctrlKey:false)

        @element.find(".webapp-console-submit-left").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:37, shiftKey:false, ctrlKey:false)

        @element.find(".webapp-console-submit-right").click () =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:39, shiftKey:false, ctrlKey:false)

        @element.find(".webapp-console-submit-ctrl-c").show().click (e) =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:67, shiftKey:false, ctrlKey:true)

        @element.find(".webapp-console-submit-ctrl-b").show().click (e) =>
            #@focus()
            submit_line()
            @terminal.keyDown(keyCode:66, shiftKey:false, ctrlKey:true)

        ###
        @element.find(".webapp-console-up").click () ->
            vp = editor.getViewport()
            editor.scrollIntoView({line:vp.from - 1, ch:0})
            return false

        @element.find(".webapp-console-down").click () ->
            vp = editor.getViewport()
            editor.scrollIntoView({line:vp.to, ch:0})
            return false

        if IS_TOUCH
            @element.find(".webapp-console-tab").show().click (e) =>
                @focus()
                @terminal.keyDown(keyCode:9, shiftKey:false)

            @_next_ctrl = false
            @element.find(".webapp-console-control").show().click (e) =>
                @focus()
                @_next_ctrl = true
                $(e.target).removeClass('btn-info').addClass('btn-warning')

            @element.find(".webapp-console-esc").show().click (e) =>
                @focus()
                @terminal.keyDown(keyCode:27, shiftKey:false, ctrlKey:false)
        ###

    _init_paste_bin: () =>
        pb = @textarea

        f = (evt) =>
            @_ignore = false
            data = pb.val()
            pb.val('')
            @conn?.write(data)

        pb.on 'paste', =>
            pb.val('')
            setTimeout(f,5)

    #######################################################################
    # Public API
    # Unless otherwise stated, these methods can be chained.
    #######################################################################

    disconnect: () =>
        x = @conn
        delete @conn
        if x?
            x.end()

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

        @resize_terminal()

    # exit fullscreen mode
    exit_fullscreen: () =>
        for elt in [$(@terminal.element), @element]
            elt.css
                position : 'relative'
                top      : 0
                width    : "100%"
        @resize_terminal()

    refresh: () =>
        @terminal.refresh(0, @opts.rows-1)
        @terminal.showCursor()

    full_rerender: =>
        locals =
            value  : @value_orig
            ignore : @_ignore
        @reset()
        @_ignore = true
        if locals.value?
            @render(locals.value)
        @_ignore = locals.ignore  # do not change value of @_ignore
        @terminal.showCursor()

    resize_terminal: () =>
        @element.find(".webapp-console-terminal").css({width:'100%', height:'100%'})

        # Wait for css change to take effect:
        await delay(0)

        # Determine size of container DOM.
        # Determine the average width of a character by inserting 10 characters,
        # seeing how wide that is, and dividing by 10.  The result is typically not
        # an integer, which is why we have to use multiple characters.
        @_c = $("<span>Term-inal&nbsp;</span>").prependTo(@terminal.element)
        character_width = @_c.width()/10
        @_c.remove()
        elt = $(@terminal.element)

        # The above style trick for character width is not reliable for getting the height of each row.
        # For that we use the terminal itself, since it already has rows, and hopefully at least
        # one row has something in it (a div).
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
            return

        # Determine the number of columns from the width of a character, computed above.
        font_size = @opts.font.size
        new_cols = Math.max(1, Math.floor(elt.width() / character_width))

        # Determine number of rows from the height of the row, as computed above.
        height = elt.height()
        if IS_TOUCH
            height -= 60
        new_rows = Math.max(1, Math.floor(height / row_height))

        # Record our new size
        @opts.cols = new_cols
        @opts.rows = new_rows

        # Send message to project to impact actual size of tty
        @send_size_to_project()
        # width still doesn't work right...
        @element.find(".webapp-console-terminal").css({width:'100%', height:''})

    send_size_to_project: =>
        @conn?.write({cmd:'size', rows:@opts.rows, cols:@opts.cols})

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

        try
            @terminal.blur()
        catch e
            # WARNING: probably should investigate term.js issues further(?)
            # ignore -- sometimes in some states the terminal code can raise an exception when explicitly blur-ing.
            # This would totally break the client, which is bad, so we catch is.
        $(@terminal.element).addClass('webapp-console-blur').removeClass('webapp-console-focus')

    focus: (force) =>
        if @_reconnecting? and new Date() - @_reconnecting > 10000
            # reconnecting not working, so try again.  Also, this handles the case
            # when terminal switched to reconnecting state, user closed computer, comes
            # back later, etc. Without this, would not attempt to reconnect until
            # user touches keys.
            @reconnect_if_no_recent_data()

        if @is_focused and not force
            return

        # focusing the term blurs the textarea, so we save that fact here,
        # so that the textarea.on 'blur' knows why it just blured
        @_focusing = true

        focused_console = @
        @is_focused = true
        @textarea.blur()
        $(@terminal.element).focus()

        if not IS_TOUCH
            @_focus_hidden_textarea()
        @terminal.focus()

        $(@terminal.element).addClass('webapp-console-focus').removeClass('webapp-console-blur')
        setTimeout((()=>delete @_focusing), 5)   # critical!

    set_title: (title) ->
        @opts.set_title?(title)
        @element.find(".webapp-console-title").text(title)


exports.Console = Console

$.fn.extend
    webapp_console: (opts={}) ->
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

