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


##################################################
# Collection of consoles on a project
##################################################

{filename_extension, trunc, to_json, from_json, keys, defaults, required, filename_extension, len, uuid} = require('misc')

{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')

async = require("async")

templates = $("#salvus-consoles-templates")

icons =
    worksheet : 'fa-file-o'
    console   : 'fa-credit-card'

class FilenameTab
    constructor: () ->
        @element = templates.find(".salvus-console-filename-tab").clone()
    set_icon: (type) =>  # type is 'worksheet' or 'console'
        @element.find("i").addClass(icons[type])
    title: (html) =>
        @element.find(".salvus-consoles-tab-title").html(html)

class exports.Consoles
    constructor: (opts) ->
        opts = defaults opts,
            project_id       : required
            initial_sessions : undefined # session_id's of console sessions to connect to, if still valid.
            counter          : undefined # if given, is a jQuery set of DOM objs to set to the number of open files

        # The counter UI element, where the number of open consoles is shown.
        @counter = opts.counter

        # The id of the current project in which the console sessions will run.
        @project_id = opts.project_id

        # The tabbed consoles UI area.
        @element = templates.find(".salvus-consoles").clone().show()

        # The tabs inside the consoles UI area.
        @nav_tabs = @element.find(".nav-tabs")

        @tabs = {}   # id:{useful stuff}

        # If given, create the initial console session views.
        if opts.initial_sessions?
            for session_id in opts.initial_sessions
                @create_tab
                    session_id: session_id
                    type      : 'xterm'

        # Enable buttons for creating new consoles.
        @element.find("a[href=#new-command-line]").click () =>
            @create_tab(type:'command-line'); return false
        @element.find("a[href=#new-worksheet]").click () =>
            @create_tab(type:'worksheet'); return false
        @element.find("a[href=#new-xterm]").click () =>
            @create_tab(type:'xterm'); return false

        that = @
        # Enable the buttons
        @element.find("a[href=#save]").addClass('disabled').click () ->
            if not $(@).hasClass("disabled")
                that.save(that.active_tab.filename)
            return false

    update_counter: () =>
        if @counter?
            @counter.text(len(@tabs))

    # Call the save() method on every open console
    save: () =>
        for i, tab of @tabs
            tab.console.save()

    # Close the tab with given id
    close: (id) =>
        tab = @tabs[id]
        if not tab? # nothing to do -- file isn't opened anymore
            return
        tab.link.remove()
        tab.console.save()
        tab.console.remove()
        delete @tabs[id]
        @update_counter()

        names = keys(@tabs)
        if names.length > 0
            # select new tab
            @display_tab(names[0])

    # Make the give tab active.
    display_tab: (id) =>
        if not @tabs[id]?
            return

        for i, tab of @tabs
            if i == id
                @active_tab = tab
                tab.link.addClass("active")
                tab.console.show()
            else
                tab.link.removeClass("active")
                tab.console.hide()

    create_tab: (opts) =>
        opts = defaults opts,
            session_id : undefined
            type       : undefined   # 'command-line' or 'xterm'
            path       : undefined   # a file with history/worksheet/etc. to load

        if opts.session_id?
            console.log("consoles -- create_tab with session_id known is not implemented, yet")
            return
        else
            session_id = uuid()
            type = opts.type

        # create the tab UI element
        filename_tab = new FilenameTab()
        link = filename_tab.element

        opts =
            project_id : @project_id
            session_id : session_id
            filename_tab : filename_tab
            path       : opts.path

        # create the actual console.
        switch type
            when 'command-line'
                console = new CommandLineSession(opts)
            when 'xterm'
                console = new XTermSession(opts)
            when 'worksheet'
                console = new WorksheetSession(opts)
            else
                alert_message(type:"error", "unknown session type '#{opts.type}'")
                return

        console.element.hide()

        # Activate the x close button.
        link.find(".salvus-consoles-close-button-x").click () =>
            @close(session_id)

        # When the user clicks on the console tab, the corresponding console gets displayed.
        link.find("a").click () => @display_tab(session_id)

        # Make the tab UI element appear in the list of tabs
        @nav_tabs.append(link)

        # Insert the actual console UI element into the DOM so we can make it appear
        # when the user clicks the tab.
        @element.find(".salvus-consoles-content").append(console.element)

        # Save the console in the @tabs object, stored by the session_id.
        @tabs[session_id] = {link:link, console:console}

        @update_counter()

        @display_tab(session_id)

        return console

class Session
    constructor : (opts) ->
        opts = defaults opts,
            project_id : required
            session_id : required
            filename_tab   : required
            path       : undefined
        @project_id = opts.project_id
        @session_id = opts.session_id
        @filename_tab = opts.filename_tab
        @path = opts.path

        @init()

    init : () =>
        throw("Define init method in derived class -- should create @element UI")

    has_unsaved_changes: () =>
        # TODO
        return false

    save: () =>
        # TODO

    show: () =>
        @element.show()

    hide: () =>
        @element.hide()

    remove: () =>
        @element.remove()

# TODO -- probably delete -- this is not a session!
class CommandLineSession extends Session
    init : () =>
        @element = templates.find(".salvus-consoles-command-line").clone()
        @filename_tab.title("cmdline")
        @filename_tab.set_icon('console')

        # Enable the command line prompt.
        that = @
        @element.find("form").submit () ->
            try
                that._exec_command()
            catch e
                console.log(e)
            return false

    _exec_command: () =>
        input = @element.find("input")
        command = input.val()
        input.val("")
        @_append_to_output('bash$ ' + command + '\n')
        spinner = @element.find(".salvus-consoles-command-line-spinner").show().spin()
        salvus_client.exec
            project_id : @project_id
            command    : command
            timeout    : 3
            max_output : 100000
            bash       : true
            cb         : (err, output) =>
                spinner.spin(false).hide()
                if err
                    out = err
                else
                    out = output.stderr + output.stdout
                @_append_to_output(out)

    _append_to_output: (val) =>
        output_area = @element.find(".salvus-consoles-command-line-output")
        output_area.val(output_area.val() + val)
        output_area.scrollTop(output_area[0].scrollHeight - output_area.height())

class XTermSession extends Session
    init : () =>
        @element = $("<div>Connecting to console server...</div>")
        salvus_client.new_session
            timeout    : 15  # make longer later -- TODO -- mainly for testing!
            type       : "console"
            project_id : @project_id
            params     : {command:'bash', ps1:"\\w\\$ "}
            cb : (err, session) =>
                if err
                    @element.text(err)
                else
                    @element.salvus_console
                        title   : "console"
                        session : session,
                        cols    : 80
                        rows    : 24
                    @console = @element.data("console")
                    @element = @console.element

        @filename_tab.title("Console")
        @filename_tab.set_icon('console')

class WorksheetSession extends Session
    init : () =>
        session     = undefined
        title       = undefined
        description = undefined
        content     = undefined

        async.series([
            (cb) =>
                @element = $("<div>Loading worksheet...</div>")
                @element.show()

                async.parallel([
                    # Start a new compute session
                    (cb) =>
                        salvus_client.new_session
                            timeout    : 15
                            limits     : {walltime: 60*15}
                            type       : "sage"
                            project_id : @project_id
                            cb : (err, _session) =>
                                if err
                                    cb(err)
                                else
                                    session = _session
                                    cb()

                    # Obtain worksheet contents
                    (cb) =>
                        if @path?
                            salvus_client.read_text_file_from_project
                                project_id : @project_id
                                path       : @path
                                cb         : (err, s) ->
                                    if err
                                        cb(err)
                                    else
                                        {title, description, content} = from_json(s.content)
                                        cb()
                        else
                            title       = "Title"
                            description = "Description"
                            content     = undefined
                            cb()

                ], cb)

            # Create the actual worksheet page and display it
            (cb) =>
                @element.salvus_worksheet
                    title       : title
                    description : description
                    content     : content
                    path        : @path
                    session     : session
                    project_id  : @project_id

                @worksheet = @element.data("worksheet")
                @element   = @worksheet.element
                @_update_filename_tab()

                @worksheet.on 'save', (path) =>
                    @path = path
                    @_update_filename_tab()

                cb()

        ], (err) =>
            if err
                msg = "Unable to load worksheet: #{err}"
                @element = $("<div>#{msg}</div>")
                alert_message(type:"error", message:msg)
        )

    _update_filename_tab : () ->
        if @path?
            if filename_extension(@path) == "salvus"
                path = @path.slice(0,-7)
            else
                path = @path
        else
            path = "worksheet"
        @filename_tab.title("#{path}")
        @filename_tab.set_icon('worksheet')

    has_unsaved_changes: () =>
        return @worksheet.has_unsaved_changes()

    save: () =>
        @worksheet?.save(@worksheet?.filename())