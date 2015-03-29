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


###############################################################################
#
# Project page -- browse the files in a project, etc.
#
###############################################################################

{IS_MOBILE}     = require("feature")
{top_navbar}    = require('top_navbar')
{salvus_client} = require('salvus_client')
message         = require('message')
{alert_message} = require('alerts')
async           = require('async')
misc            = require('misc')
misc_page       = require('misc_page')
diffsync        = require('diffsync')
account         = require('account')
{filename_extension, defaults, required, to_json, from_json, trunc, keys, uuid} = misc
{file_associations, Editor, local_storage, public_access_supported} = require('editor')

{Tasks} = require('tasks')

{scroll_top, human_readable_size, download_file} = misc_page

templates = $("#salvus-project-templates")
template_project_file          = templates.find(".project-file-link")
template_home_icon             = templates.find(".project-home-icon")
template_segment_sep           = templates.find(".project-segment-sep")
template_project_collab        = templates.find(".project-collab")
template_project_linked        = templates.find(".project-linked")
template_path_segment          = templates.find(".project-file-listing-path-segment-link")


exports.masked_file_exts = masked_file_exts =
    'pyc'           : 'py'
    'class'         : 'java'
    'exe'           : 'cs'

for ext in misc.split('blg bbl glo idx toc aux log lof ind nav snm gz xyc out ilg fdb_latexmk fls')  # gz really synctex.gz
    masked_file_exts[ext] = 'tex'

#many languages such as fortran or c++ have a default file name of "a.out." when compiled, so .out extensions are not masked

# If there are more
MAX_FILE_LISTING_SIZE = 300

# timeout in seconds when downloading files etc., from web in +New dialog.
FROM_WEB_TIMEOUT_S = 45

# for the new file dialog
BAD_FILENAME_CHARACTERS = '\\/'
BAD_LATEX_FILENAME_CHARACTERS = '\'"()"~%'

# How long to cache public paths in this project
PUBLIC_PATHS_CACHE_TIMEOUT_MS = 1000*60

##################################################
# Define the project page class
##################################################

class ProjectPage
    constructor: (@project) ->
        # whether or not we have full access to the project or only very limited
        # public access (since project is public)
        @public_access = !!@project.public_access

        # the html container for everything in the project.
        @container = templates.find(".salvus-project").clone()
        @container.data('project', @)
        $("body").append(@container)
        # ga('send', 'event', 'project', 'open', 'project_id', @project.project_id, {'nonInteraction': 1})

        if @public_access
            @container.find(".salvus-project-write-access").hide()
            @container.find(".salvus-project-public-access").show()
        else
            @container.find(".salvus-project-write-access").show()
            @container.find(".salvus-project-public-access").hide()

        @init_new_tab_in_navbar()

        $(window).resize () => @window_resize()
        @_update_file_listing_size()

        @init_sort_files_icon()


        # current_path is a possibly empty list of directories, where
        # each one is contained in the one before it.
        @current_path = []
        @init_tabs()
        @update_topbar()
        @create_editor()
        @init_file_search()
        @init_refresh_files()
        @init_hidden_files_icon()
        @init_listing_show_all()
        @init_sortable_editor_tabs()
        @init_current_path_info_button()

        # Set the project id
        @container.find(".project-id").text(@project.project_id)

        if not @public_access
            # Initialize the search form.
            @init_search_form()
            @init_admin()
            @init_new_file_tab()
            @init_trash_link()
            @init_snapshot_link()
            @init_local_status_link()
            @init_project_activity()  # must be after @create_editor()
            @init_project_restart()
            @init_ssh()
            @init_worksheet_server_restart()
            #@init_project_config()
            @init_delete_project()
            @init_undelete_project()

            @init_hide_project()
            @init_unhide_project()

            @init_make_public()
            @init_make_private()

            @update_collaborators = @init_add_collaborators()
            @init_add_noncloud_collaborator()

            #@update_linked_projects = @init_linked_projects()

            @init_move_project()
            @set_location()
            @init_title_desc_edit()
            @init_mini_command_line()
            @init_settings_url()
            @init_ssh_url_click()
            @init_billing()

            @init_add_collaborators_button()

        # Show a warning if using SMC in devel mode. (no longer supported)
        if window.salvus_base_url != ""
            # TODO -- should use a better way to decide dev mode.
            @container.find(".salvus-project-id-warning").show()

    init_billing: () =>
        @container.find("a[href=#upgrade-project]").click () =>
            @container.find(".smc-upgrade-via-email-message").show()
            return false
        @container.find("a[href=#upgrade-features]").click () =>
            @container.find(".smc-upgrade-via-email-message").show()
            return false

    activity_indicator: () =>
        top_navbar.activity_indicator(@project.project_id)

    mini_command_line_keydown: (evt) =>
        #console.log("mini_command_line_keydown")
        if evt.which == 13 # enter
            try
                @command_line_exec()
            catch e
                console.log("mini command line bug -- ", e)
            return false
        else if evt.which == 27 # escape
            @hide_command_line_output()
            return false

    init_mini_command_line: () =>
        # Activate the mini command line
        @_cmdline = @container.find(".project-command-line-input")
        @_cmdline.tooltip(delay:{ show: 500, hide: 100 })
        @_cmdline.keydown(@mini_command_line_keydown)

        @container.find(".project-command-line-output").find("a[href=#clear]").click () =>
            @hide_command_line_output()
            return false

        @container.find(".project-command-line-submit").click () =>
            @command_line_exec()

        # TODO: this will be for command line tab completion
        #@_cmdline.keydown (evt) =>
        #    if evt.which == 9
        #        @command_line_tab_complete()
        #        return false

    hide_command_line_output: () =>
        @container.find(".project-command-line-output").hide()
        @container.find(".project-command-line-spinner").hide()
        @container.find(".project-command-line-submit").show()

    init_title_desc_edit: () =>
        # Make it so editing the title and description of the project
        # sends a message to the hub.
        that = @
        @container.find(".project-project_title").blur () ->
            new_title = $(@).text().trim()
            if new_title != that.project.title
                if new_title == ""
                    new_title = "No title"
                    $(@).html(new_title)
                salvus_client.update_project_data
                    project_id : that.project.project_id
                    data       : {title:new_title}
                    cb         : (err, mesg) ->
                        if err
                            $(@).html(that.project.title)  # change it back
                            alert_message(type:'error', message:"Error contacting server to save modified project title.")
                        else if mesg.event == "error"
                            $(@).html(that.project.title)  # change it back
                            alert_message(type:'error', message:mesg.error)
                        else
                            that.project.title = new_title
                            # Also, change the top_navbar header.
                            that.update_topbar()

        @container.find(".project-project_description").blur () ->
            new_desc = $(@).text().trim()
            if new_desc != that.project.description
                if new_desc == ""
                    new_desc = "No description"
                    $(@).html(new_desc)
                salvus_client.update_project_data
                    project_id : that.project.project_id
                    data       : {description:new_desc}
                    cb         : (err, mesg) ->
                        if err
                            $(@).html(that.project.description)   # change it back
                            alert_message(type:'error', message:err)
                        else if mesg.event == "error"
                            $(@).html(that.project.description)   # change it back
                            alert_message(type:'error', message:mesg.error)
                        else
                            that.project.description = new_desc

    init_current_path_info_button: () =>
        e = @container.find("a[href=#file-action-current-path]")
        e.click () =>
            @file_action_dialog
                fullname : @current_pathname()
                isdir    : true
                url      : document.URL

    init_settings_url: () =>
        @container.find(".salvus-settings-url").click () ->
            $(this).select()

    # call when project is closed completely
    destroy: () =>
        @editor?.destroy()
        @save_browser_local_data()
        delete project_pages[@project.project_id]
        @project_log?.disconnect_from_session()
        clearInterval(@_update_last_snapshot_time)
        @_cmdline?.unbind('keydown', @mini_command_line_keydown)

    init_new_tab_in_navbar: () =>
        # Create a new tab in the top navbar (using top_navbar as a jquery plugin)
        @container.top_navbar
            id    : @project.project_id
            label : @project.project_id
            icon  : 'fa-edit'

            onclose : () =>
                @destroy()

            onblur: () =>
                @editor?.remove_handlers()

            onshow: () =>
                if @project?
                    misc_page.set_window_title($("<div>").html(@project.title).text())
                    @push_state()
                @editor?.activate_handlers()
                @editor?.refresh()

            onfullscreen: (entering) =>
                if @project?
                    if entering
                        @hide_tabs()
                    else
                        @show_tabs()
                    $(window).resize()

    init_sortable_file_list: () =>
        # make the list of open files user-sortable.
        if @_file_list_is_sortable
            return
        @container.find(".file-pages").sortable
            axis                 : 'x'
            delay                : 50
            containment          : 'parent'
            tolerance            : 'pointer'
            placeholder          : 'file-tab-placeholder'
            forcePlaceholderSize : true
        @_file_list_is_sortable = true

    destroy_sortable_file_list: () =>
        if not @_file_list_is_sortable
            return
        @container.find(".file-pages").sortable("destroy")
        @_file_list_is_sortable = false

    push_state: (url) =>
        # console.log("push_state: ", url)
        if not url?
            url = @_last_history_state
        if not url?
            url = ''
        @_last_history_state = url
        #if @project.name? and @project.owner?
            #window.history.pushState("", "", window.salvus_base_url + '/projects/' + @project.ownername + '/' + @project.name + '/' + url)
        # For now, we are just going to default to project-id based URL's, since they are stable and will always be supported.
        # I can extend to the above later in another release, without any harm.
        window.history.pushState("", "", window.salvus_base_url + '/projects/' + @project.project_id + '/' + misc.encode_path(url))
        ga('send', 'pageview', window.location.pathname)


    #  files/....
    #  recent
    #  new
    #  log
    #  settings
    #  search
    load_target: (target, foreground=true) =>
        #console.log("project -- load_target=#{target}")
        segments = target.split('/')
        #console.log("segments=",segments)
        switch segments[0]
            when 'files'
                if target[target.length-1] == '/'
                    # open a directory
                    @chdir(segments.slice(1, segments.length-1), false)
                    # NOTE: foreground option meaningless
                    @display_tab("project-file-listing")
                else
                    # open a file -- foreground option is relevant here.
                    if foreground
                        @chdir(segments.slice(1, segments.length-1), true)
                        @display_tab("project-editor")
                    @open_file
                        path       : segments.slice(1).join('/')
                        foreground : foreground
            when 'new'  # ignore foreground for these and below, since would be nonsense
                @chdir(segments.slice(1), true)
                @display_tab("project-new-file")
            when 'log'
                @display_tab("project-activity")
            when 'settings'
                @display_tab("project-settings")
            when 'search'
                @chdir(segments.slice(1), true)
                @display_tab("project-search")

    set_location: () =>
        if @project.bup_location?
            x = @project.bup_location
        else
            x = "..."
        @container.find(".project-location").text(x)

    window_resize: () =>
        if @current_tab.name == "project-file-listing"
            @_update_file_listing_size()

    _update_file_listing_size: () =>
        elt = @container.find(".project-file-listing-container")
        elt.height($(window).height() - elt.offset().top)


    close: () =>
        top_navbar.remove_page(@project.project_id)

    # Reload the @project attribute from the database, and re-initialize
    # ui elements, mainly in settings.
    reload_settings: (cb) =>
        salvus_client.project_info
            project_id : @project.project_id
            cb         : (err, info) =>
                if err
                    cb?(err)
                    return
                @project = info
                @update_topbar()
                cb?()


    ########################################
    # Launch open sessions
    ########################################

    # TODO -- not used right now -- just use init_file_sessions only -- delete this.
    init_open_sessions: (cb) =>
        salvus_client.project_session_info
            project_id: @project.project_id
            cb: (err, mesg) =>
                if err
                    alert_message(type:"error", message:"Error getting open sessions -- #{err}")
                    cb?(err)
                    return
                console.log(mesg)
                if not (mesg? and mesg.info?)
                    cb?()
                    return

                async.series([
                    (cb) =>
                        @init_console_sessions(mesg.info.console_sessions, cb)
                    (cb) =>
                        @init_sage_sessions(mesg.info.sage_sessions, cb)
                    (cb) =>
                        @init_file_sessions(mesg.info.file_sessions, cb)
                ], (err) => cb?(err))

    # TODO -- not used right now -- just use init_file_sessions only -- delete this.
    init_console_sessions: (sessions, cb) =>
        #console.log("initialize console sessions: ", sessions)
        #@display_tab("project-editor")
        for session_uuid, obj of sessions
            if obj.status == 'running'
                filename = "scratch/#{session_uuid.slice(0,8)}.sage-terminal"
                auto_open = local_storage(@project.project_id, filename, 'auto_open')
                if not auto_open? or auto_open
                    tab = @editor.create_tab(filename:filename, session_uuid:session_uuid)
        cb?()

    # TODO -- not used right now -- just use init_file_sessions only -- delete this.
    init_sage_sessions: (sessions, cb) =>
        #console.log("initialize sage sessions: ", sessions)
        #TODO -- not enough info to do this yet.
        #for session_uuid, obj of sessions
        #    tab = @editor.create_tab(filename : obj.path, session_uuid:session_uuid)
        cb?()

    ###
    init_file_sessions: (sessions, cb) =>
        for filename, data of local_storage(@project.project_id)
            if data.auto_open
                tab = @editor.create_tab(filename : filename)
        cb?()
    ###

    init_sortable_editor_tabs: () =>
        @container.find(".nav.projects").sortable
            axis                 : 'x'
            delay                : 50
            containment          : 'parent'
            tolerance            : 'pointer'
            placeholder          : 'nav-projects-placeholder'
            forcePlaceholderSize : true


    ########################################
    # Search
    ########################################

    init_file_search: () =>
        @_file_search_box = @container.find(".salvus-project-search-for-file-input")
        @_file_search_box.keyup (event) =>
            if event.keyCode == 27
                @_file_search_box.val('')
            if (event.metaKey or event.ctrlKey) and event.keyCode == 79
                #console.log("keyup: init_file_search")
                @display_tab("project-new-file")
                return false
            @update_file_search(event)
            return false
        @container.find(".salvus-project-search-for-file-input-clear").click () =>
            @_file_search_box.val('').focus()
            @update_file_search()

    clear_file_search: () =>
        @_file_search_box.val('')

    focus_file_search: () =>
        if not IS_MOBILE
            @_file_search_box.focus()

    update_file_search: (event) =>
        search_box = @_file_search_box
        v = $.trim(search_box.val()).toLowerCase()

        listing = @container.find(".project-file-listing-file-list")

        show_all = @container.find(".project-file-listing-show_all")
        if v == ""
            @container.find(".salvus-project-search-describe").hide()
            if show_all.find("span").text()
                show_all.show()
            listing.children().show()
            match = (s) -> true
        else
            show_all.hide()
            @container.find(".salvus-project-search-describe").show().find("span").text(v)
            terms = v.split(' ')
            listing.children().hide()
            match = (s, is_dir) ->
                s = s.toLowerCase()
                for t in terms
                    if t == '/'
                        if not is_dir
                            return false
                    else if s.indexOf(t) == -1
                        return false
                return true

        first = true
        for e in listing.children()
            entry = $(e)
            fullpath = entry.data('obj')?.fullname
            if not fullpath?
                entry.show()  # this is the "Parent directory" link.
                continue
            filename = entry.find(".project-file-name").text() + entry.find(".project-file-name-extension").text()
            if match(filename, entry.hasClass('project-directory-link'))
                if first and event?.keyCode == 13 # enter -- select first match (if any)
                    entry.click()
                    first = false
                if v != ""
                    entry.show()
            else
                if v != ""
                    entry.hide()

        if first and event?.keyCode == 13
            # No matches at all, and user pressed enter -- maybe they want to create a file?
            @display_tab("project-new-file")
            @new_file_tab_input.val(search_box.val())

    init_search_form: () =>
        that = @
        input_boxes = @container.find(".project-search-form-input")
        input_boxes.keypress (evt) ->
            t = $(@)
            if evt.which== 13
                input_boxes.blur()
                # Do the search.
                try
                    that.search(t.val())
                catch e
                    console.log("search bug ", e)
                return false

        for x in ['recursive', 'case-sensitive', 'hidden', 'show-command']
            @container.find(".project-search-output-#{x}").change () =>
                @search($(input_boxes[0]).val())

        @container.find(".project-search-form-input-clear").click () =>
            input_boxes.val('').focus()
            return false

    search: (query) =>
        if $.trim(query) == ""
            return
        @display_tab("project-search")
        @container.find(".project-search-output-path-heading").show()
        @container.find(".project-search-output-terms").text(query)
        search_output = @container.find(".project-search-output").show().empty()
        recursive   = @container.find(".project-search-output-recursive").is(':checked')
        insensitive = not @container.find(".project-search-output-case-sensitive").is(':checked')
        hidden      = @container.find(".project-search-output-hidden").is(':checked')
        show_command= @container.find(".project-search-output-show-command").is(':checked')
        max_results = 1000
        max_output  = 110*max_results  # just in case
        if insensitive
            ins = " -i "
        else
            ins = ""
        query = '"' + query.replace(/"/g, '\\"') + '"'
        if recursive
            if hidden
                cmd = "find . -xdev | grep #{ins} #{query}; rgrep -H --exclude-dir=.sagemathcloud --exclude-dir=.snapshots #{ins} #{query} * .*"
            else
                cmd = "find . -xdev \! -wholename '*/.*'  | grep #{ins} #{query}; rgrep -H  --exclude-dir='.*' --exclude='.*' #{ins} #{query} *"
        else
            if hidden
                cmd = "ls -a1 | grep #{ins} #{query}; grep -H #{ins} #{query} .* *"
            else
                cmd = "ls -1 | grep #{ins} #{query}; grep -H #{ins} #{query} *"

        # Exclude worksheet input cell markers
        cmd += " | grep -v #{diffsync.MARKERS.cell}"

        path = @current_pathname()

        path_prefix = path
        if path_prefix != ''
            path_prefix += '/'

        if show_command
            @container.find(".project-search-output-command").show().text(" (search command: '#{cmd}')")
        else
            @container.find(".project-search-output-command").hide()
        if @project.location?.path?
            @container.find(".project-search-output-path").text(@project.location.path + '/' + path)
        else
            @container.find(".project-search-output-path").text('')

        spinner = @container.find(".project-search-spinner")
        timer = setTimeout(( () -> spinner.show().spin()), 300)
        that = @
        salvus_client.exec
            project_id : @project.project_id
            command    : cmd + " | cut -c 1-256"  # truncate horizontal line length (imagine a binary file that is one very long line)
            timeout    : 10   # how long grep runs on client
            network_timeout : 15   # how long network call has until it must return something or get total error.
            max_output : max_output
            bash       : true
            err_on_exit: true
            path       : path
            cb         : (err, output) =>
                clearTimeout(timer)
                spinner.spin(false).hide()
                if (err and not output?) or (output? and not output.stdout?)
                    search_output.append($("<div>").text("Search took too long; please try a more restrictive search."))
                    return
                search_result = templates.find(".project-search-result")
                num_results = 0
                results = output.stdout.split('\n')
                if output.stdout.length >= max_output or results.length > max_results or err
                    @container.find(".project-search-output-further-results").show()
                else
                    @container.find(".project-search-output-further-results").hide()
                for line in results
                    if line.trim() == ""
                        continue
                    i = line.indexOf(":")
                    num_results += 1
                    if i == -1
                        # the find part
                        filename = line
                        if filename.slice(0,2) == "./"
                            filename = filename.slice(2)
                        r = search_result.clone()
                        r.find("a").text(filename).data(filename: path_prefix + filename).mousedown (e) ->
                            that.open_file(path:$(@).data('filename'), foreground:not(e.which==2 or (e.ctrlKey or e.metaKey)))
                            return false
                        r.find("span").addClass('lighten').text('(filename)')
                    else
                        # the rgrep part
                        filename = line.slice(0,i)
                        if filename.slice(0,2) == "./"
                            filename = filename.slice(2)
                        context = line.slice(i+1)
                        # strip codes in worksheet output
                        if context.length > 0 and context[0] == diffsync.MARKERS.output
                            i = context.slice(1).indexOf(diffsync.MARKERS.output)
                            context = context.slice(i+2,context.length-1)
                        r = search_result.clone()
                        r.find("span").text(context)
                        r.find("a").text(filename).data(filename: path_prefix + filename).mousedown (e) ->
                            that.open_file(path:$(@).data('filename'), foreground:not(e.which==2 or (e.ctrlKey or e.metaKey)))
                            return false

                    search_output.append(r)
                    if num_results >= max_results
                        break



    ########################################
    # ...?
    ########################################


    command_line_exec: () =>
        if not @container?
            return
        elt = @container.find(".project-command-line")
        elt.find(".project-command-line-output").hide()
        input = elt.find("input")
        command0 = input.val().trim()
        if not command0
            return
        command = command0 + "\necho $HOME `pwd`"
        input.val("")
        @container.find(".project-command-line-submit").hide()
        @container.find(".project-command-line-spinner").show()
        salvus_client.exec
            project_id : @project.project_id
            command    : command
            timeout    : 15
            max_output : 100000
            bash       : true
            path       : @current_pathname()
            cb         : (err, output) =>
                if not @container?
                    return
                @container.find(".project-command-line-spinner").hide()
                @container.find(".project-command-line-submit").show()
                if err
                    alert_message(type:'error', message:"Terminal command '#{command0}' error -- #{err}\n (Hint: Click +New, then Terminal for full terminal.)")
                else
                    # All this code below is to find the current path
                    # after the command is executed, and also strip
                    # the output of "pwd" from the output:
                    if not output?.stdout?
                        return
                    j = i = output.stdout.length-2
                    while i>=0 and output.stdout[i] != '\n'
                        i -= 1
                    last = output.stdout.slice(i+1, j+1)
                    k = last.indexOf(' ')
                    home = last.slice(0,k)
                    cwd = last.slice(k+1)
                    if cwd.slice(0,home.length) == home
                        cwd = cwd.slice(home.length)
                        k = cwd.indexOf('/')
                        if k != -1
                            cwd = cwd.slice(k+1)
                            if @project.location?.path?
                                path = @project.location.path
                            else
                                path = ''
                            if path == '.'   # not good for our purposes here.
                                path = ''
                            if path == cwd.slice(0, path.length)
                                cwd = cwd.slice(path.length)
                                while cwd[0] == '/'
                                    cwd = cwd.slice(1)
                                if cwd.length > 0
                                    @current_path = cwd.split('/')
                                else
                                    @current_path = []
                        else
                            # root of project
                            @current_path = []

                        output.stdout = if i == -1 then "" else output.stdout.slice(0,i)

                    stdout = $.trim(output.stdout)
                    stderr = $.trim(output.stderr)
                    # We display the output of the command (or hide it)
                    something = false
                    if stdout
                        something = true
                        elt.find(".project-command-line-stdout").text(stdout).show()
                    else
                        elt.find(".project-command-line-stdout").hide()
                    if stderr
                        something = true
                        elt.find(".project-command-line-stderr").text(stderr).show()
                    else
                        elt.find(".project-command-line-stderr").hide()
                    if something
                        elt.find(".project-command-line-output").show()
                @update_file_list_tab(true)

    # command_line_tab_complete: () =>
    #     elt = @container.find(".project-command-line")
    #     input = elt.find("input")
    #     cmd = input.val()
    #     i = input.caret()
    #     while i>=0
    #         if /\s/g.test(cmd[i])  # is whitespace
    #             break
    #         i -= 1
    #     symbol = cmd.slice(i+1)

    #     # Here we do the actual completion.  This is very useless
    #     # naive for now.  However, we will later implement 100% full
    #     # bash completion on the VM host using pexpect (!).
    #     if not @_last_listing?
    #         return

    hide_tabs: () =>
        @container.find(".project-pages").hide()
        @container.find(".file-pages").hide()

    show_tabs: () =>
        @container.find(".project-pages").show()
        @container.find(".file-pages").show()

    show_top_path: () =>
        @container.find(".project-file-top-current-path-display").show()

    hide_top_path: () =>
        @container.find(".project-file-top-current-path-display").hide()

    init_tabs: () ->
        @tabs = []
        that = @
        for item in @container.find(".project-pages").children()
            t = $(item)
            target = t.find("a").data('target')
            if not target?
                continue

            # activate any a[href=...] links elsewhere on the page
            @container.find("a[href=##{target}]").data('item',t).data('target',target).click () ->
                link = $(@)
                if link.data('item').hasClass('disabled')
                    return false
                that.display_tab(link.data('target'))
                return false

            t.find('a').tooltip(delay:{ show: 1000, hide: 200 })
            name = target
            tab = {label:t, name:name, target:@container.find(".#{name}")}
            @tabs.push(tab)

            t.find("a").data('item',t).click () ->
                link = $(@)
                if link.data('item').hasClass('disabled')
                    return false
                that.display_tab(link.data("target"))
                return false

            if name == "project-file-listing"
                tab.onshow = () ->
                    that.editor?.hide_editor_content()
                    that.update_file_list_tab()
                    that.hide_top_path()
            else if name == "project-editor"
                tab.onshow = () ->
                    that.show_top_path()
                    that.editor.onshow()
                t.find("a").click () ->
                    that.editor.hide()
                    that.editor.show_recent()
                    return false
            else if name == "project-new-file" and not @public_access
                tab.onshow = () ->
                    that.show_top_path()
                    that.editor?.hide_editor_content()
                    that.push_state('new/' + that.current_path.join('/'))
                    that.show_new_file_tab()
            else if name == "project-activity" and not @public_access
                tab.onshow = () =>
                    that.show_top_path()
                    that.editor?.hide_editor_content()
                    that.push_state('log')
                    @render_project_activity_log()
                    if not IS_MOBILE
                        @container.find(".salvus-project-activity-search").focus()

            else if name == "project-settings" and not @public_access
                tab.onshow = () ->
                    that.show_top_path()
                    that.editor?.hide_editor_content()
                    that.push_state('settings')
                    that.update_topbar()
                    #that.update_linked_projects()
                    that.update_collaborators()
                    that.container.find(".salvus-settings-url").val(document.URL)

            else if name == "project-search" and not @public_access
                tab.onshow = () ->
                    that.show_top_path()
                    that.editor?.hide_editor_content()
                    that.push_state('search/' + that.current_path.join('/'))
                    that.container.find(".project-search-form-input").focus()

        for item in @container.find(".file-pages").children()
            t = $(item)
            target = t.find("a").data('target')
            if not target?
                continue

            # activate any a[href=...] links elsewhere on the page
            @container.find("a[href=##{target}]").data('item',t).data('target',target).click () ->
                link = $(@)
                if link.data('item').hasClass('disabled')
                    return false
                that.display_tab(link.data('target'))
                return false

            t.find('a').tooltip(delay:{ show: 1000, hide: 200 })
            name = target
            tab = {label:t, name:name, target:@container.find(".#{name}")}
            @tabs.push(tab)

            t.find("a").data('item',t).click () ->
                link = $(@)
                if link.data('item').hasClass('disabled')
                    return false
                that.display_tab(link.data("target"))
                return false

        @display_tab("project-file-listing")

    create_editor: (initial_files) =>   # initial_files (optional)
        @editor = new Editor
            project_page  : @
            counter       : @container.find(".project-editor-file-count")
            initial_files : initial_files
        @container.find(".project-editor").append(@editor.element)

    display_tab: (name) =>
        @container.find(".project-pages").children().removeClass('active')
        @container.find(".file-pages").children().removeClass('active')
        @container.css(position: 'static')
        for tab in @tabs
            if tab.name == name
                @current_tab = tab
                tab.target.show()
                tab.label.addClass('active')
                tab.onshow?()
                @focus()
            else
                tab.target.hide()

        if name != 'project-editor'
            @editor?.hide()
            @editor?.resize_open_file_tabs()

    show_editor_chat_window: (path) =>
        @editor?.show_chat_window(path)

    save_browser_local_data: (cb) =>
        @editor.save(undefined, cb)

    new_file_dialog: () =>
        salvus_client.write_text_file_to_project
            project_id : @project.project_id,
            path       : 'new_file.txt',
            content    : 'This is a new file.\nIt has little content....'
            cb         : (err, mesg) ->
                if err
                    alert_message(type:"error", message:"Connection error.")
                else if mesg.event == "error"
                    alert_message(type:"error", message:mesg.error)
                else
                    alert_message(type:"success", message: "New file created.")

    new_file: (path) =>
        salvus_client.write_text_file_to_project
            project_id : @project.project_id
            path       : "#{path}/untitled"
            content    : ""
            cb : (err, mesg) =>
                if err
                    alert_message(type:"error", message:"Connection error.")
                else if mesg.event == "error"
                    alert_message(type:"error", message:mesg.error)
                else
                    alert_message(type:"success", message: "New file created.")
                    @update_file_list_tab()

    load_from_server: (opts) ->
        opts = defaults opts,
            project_id : required
            cb         : undefined

        salvus_client.get_project
            cb : (error, project) =>
                if error
                    opts.cb?(error)
                else
                    @project = project
                    @update_view()
                    opts.cb?()

    save_to_server: (opts) ->
        opts = defaults opts,
            timeout : 10

        salvus_client.update_project_data
            data    : @project
            cb      : opts.cb
            timeout : opts.timeout

    init_ssh_url_click: () =>
        @container.find(".salvus-project-ssh").click(() -> $(this).select())

    update_topbar: () ->
        if not @project?
            return

        @container.find(".project-project_title").html(@project.title).mathjax()
        @container.find(".project-project_description").html(@project.description).mathjax()

        if not @project.title? # make sure that things work even if @project is invalid.
            @project.title = ""
            alert_message(type:"error", message:"Project #{@project.project_id} is corrupt. Please report.")
        label = $("<div>").html(@project.title).text()  # plain text for this...
        top_navbar.set_button_label(@project.project_id, label)
        misc_page.set_window_title(label)

        if not @_computing_status
            @_computing_usage = true
            timer = setTimeout( (()=>@_computing_usage=false), 30000)
            salvus_client.project_status
                project_id : @project.project_id
                cb         : (err, status) =>
                    if err
                        return
                    clearTimeout(timer)
                    delete @_computing_usage

                    if not status?
                        return

                    usage = @container.find(".project-disk_usage")

                    zfs = status.zfs
                    if zfs? and misc.len(zfs) > 0
                        for a in ["userquota-projects", "userquota-scratch", "userused-projects", "userused-scratch"]
                            usage.find(".salvus-#{a}").text(Math.round(zfs[a]/1048576)) # 2^20, bytes to megabytes
                    else
                        usage.find(".salvus-zfs-quotas").hide()

                    if status.settings?
                        usage.find(".salvus-project-settings-cores").text(status.settings.cores)
                        usage.find(".salvus-project-settings-memory").text(status.settings.memory)
                        mintime = Math.round(status.settings.mintime/3600)
                        if mintime > 10000
                            mintime = "&infin;"
                            usage.find("project-settings-unlimited-timeout-checkbox").prop('checked', true);
                        usage.find(".salvus-project-settings-mintime").html(mintime)
                        usage.find(".salvus-project-settings-cpu_shares").text(Math.round(status.settings.cpu_shares/256))
                        usage.find(".salvus-project-settings-network").text(status.settings.network)
                        if status.settings.network
                            @container.find(".salvus-network-blocked").hide()
                            usage.find(".project-settings-network-access-checkbox").prop('checked', true);
                        else
                            @container.find(".salvus-network-blocked").show()
                        if status.ssh
                            @container.find(".project-settings-ssh").show()
                            username = @project.project_id.replace(/-/g, '')
                            v = status.ssh.split(':')
                            if v.length > 1
                                port = " -p #{v[1]} "
                            else
                                port = " "
                            address = v[0]

                            @container.find(".salvus-project-ssh").val("ssh#{port}#{username}@#{address}")
                        else
                            @container.find(".project-settings-ssh").addClass('lighten')

                    usage.show()

            @update_local_status_link()
        return @

    init_project_config: () ->
        if not @container?
            return
        @container.find(".smc-project-config").show()
        #each for closure
        $.each ['disable_collaborators', 'disable_downloads'], (index, option) =>
            #local_storage needs to be replaced with project database object soon
            if local_storage(@project.project_id, '', option)
                @container.find(".account-settings-other_settings-" + option).find("input").prop("checked", true)
            @container.find(".account-settings-other_settings-" + option).click (e) =>
                checked = @container.find(".account-settings-other_settings-" + option).find("input").prop("checked")
                local_storage(@project.project_id, '', option, checked)

    init_admin: () ->
        if not @container?
            return
        usage = @container.find(".project-disk_usage")
        if not account?.account_settings?.settings?.groups?
            setTimeout(@init_admin, 15000)
            return

        if 'admin' in account.account_settings.settings.groups
            @container.find(".project-quota-edit").show()
            usage.find(".project-settings-unlimited-timeout").click () ->
                usage.find(".salvus-project-settings-mintime").text("∞")
            usage.find(".project-settings-network-access-checkbox").change () ->
                usage.find(".salvus-project-settings-network").text($(this).prop("checked"))
            @container.find(".project-quota-edit").click () =>
                quotalist = ['userquota-projects', 'userquota-scratch', 'project-settings-cores', 'project-settings-memory', 'project-settings-mintime', 'project-settings-cpu_shares']

                # if currently editing...
                if usage.find(".salvus-userquota-projects").attr("contenteditable") == "true"

                    for a in quotalist
                        usage.find(".salvus-" + a).attr("contenteditable", false).removeAttr('style')
                    @container.find(".project-quota-edit").html('<i class="fa fa-pencil"> </i> Edit')
                    usage.find(".project-settings-network-access-checkbox").hide()
                    usage.find(".project-settings-unlimited-timeout").hide()
                    timeout = @container.find(".salvus-project-settings-mintime").text()

                    salvus_client.project_set_quota
                        project_id : @project.project_id
                        memory     : Math.round(@container.find(".salvus-project-settings-memory").text())   # see message.coffee for the units, etc., for all these settings
                        cpu_shares : Math.round(@container.find(".salvus-project-settings-cpu_shares").text() * 256)
                        cores      : Math.round(@container.find(".salvus-project-settings-cores").text())
                        disk       : Math.round(@container.find(".salvus-userquota-projects").text())
                        scratch    : Math.round(@container.find(".salvus-userquota-scratch").text())
                        inode      : undefined
                        mintime    : (if timeout == "∞" then 3600 * 1000000 else Math.round(timeout) * 3600)
                        login_shell: undefined
                        network    : @container.find(".salvus-project-settings-network").text()
                        cb         : (err, mesg) ->
                            if err
                                alert_message(type:'error', message:err)
                            else if mesg.event == "error"
                                alert_message(type:'error', message:mesg.error)
                            else
                                alert_message(type:"success", message: "Project quotas updated.")

                else
                    for a in quotalist
                        usage.find(".salvus-" + a).attr("contenteditable", true).css
                            '-webkit-appearance' : 'textfield'
                            '-moz-appearance'    : 'textfield'
                            'border'             : '1px solid black'
                    @container.find(".project-quota-edit").html('<i class="fa fa-thumbs-up"> </i> Done')
                    usage.find(".project-settings-network-access-checkbox").show()
                    usage.find(".project-settings-unlimited-timeout").show()

    # Return the string representation of the current path, as a
    # relative path from the root of the project.
    current_pathname: () => @current_path.join('/')

    # Set the current path array from a path string to a directory
    set_current_path: (path) =>
        if not path?
            @current_path = []
        else if typeof(path) == "string"
            while path[path.length-1] == '/'
                path = path.slice(0,path.length-1)
            @current_path = []
            for segment in path.split('/')
                if segment.length > 0
                    @current_path.push(segment)
        else
            @current_path = path[..]  # copy the path
        @container.find(".project-file-top-current-path-display").text(@current_path.join('/'))

    # Render the slash-separated and clickable path that sits above
    # the list of files (or current file)
    update_current_path: () =>
        @container.find(".project-file-top-current-path-display").text(@current_pathname())

        t = @container.find(".project-file-listing-current_path")
        t.empty()

        paths = []
        pathname = ''

        # the home icon
        e = template_path_segment.clone()
        e.append(template_home_icon.clone())
        paths.push({elt:e, path:[], pathname:pathname})
        t.append(e)

        new_current_path = []
        for segment in @current_path
            new_current_path.push(segment)
            if pathname
                pathname += '/' + segment
            else   #no leading /
                pathname = segment
            t.append(template_segment_sep.clone())
            e = template_path_segment.clone()
            t.append(e)
            e.text(segment)
            paths.push({elt:e, path:new_current_path[..], pathname:pathname})

        create_link = (elt, path) =>
            elt.click () =>
                @hide_command_line_output()
                @current_path = path
                @update_file_list_tab()

        if @public_access
            f = (p, cb) =>
                @is_path_published
                    path : p.pathname
                    cb   : (err, x) =>
                        if not err and x
                            create_link(p.elt, p.path)
                        else
                            p.elt.css(color:'#888')
                        cb()
            async.mapSeries(paths.reverse(), f, ()->)
        else
            for p in paths
                create_link(p.elt, p.path)


    focus: () =>
        if not IS_MOBILE  # do *NOT* do on mobile, since is very annoying to have a keyboard pop up.
            switch @current_tab.name
                when "project-file-listing"
                    @container.find(".salvus-project-search-for-file-input").focus()
                #when "project-editor"
                #    @editor.focus()

    init_dropzone_upload: () =>
        # Dropzone
        uuid = misc.uuid()
        dz_container = @container.find(".project-dropzone")
        dz_container.empty()
        dz = $('<div class="dropzone"></div>')
        if IS_MOBILE
            dz.append($('<span class="message" style="font-weight:bold;font-size:14pt">Tap to select files to upload</span>'))
        dz_container.append(dz)
        dest_dir = misc.encode_path(@new_file_tab.find(".project-new-file-path").text())
        dz.dropzone
            url: window.salvus_base_url + "/upload?project_id=#{@project.project_id}&dest_dir=#{dest_dir}"
            maxFilesize: 128 # in megabytes


    init_new_file_tab: () =>
        # Make it so clicking on each of the new file tab buttons does the right thing.
        @new_file_tab = @container.find(".project-new-file")
        @new_file_tab_input = @new_file_tab.find(".project-new-file-path-input")
        @new_file_tab.find("a").tooltip()

        path = (ext) =>
            name = $.trim(@new_file_tab_input.val())
            if name.length == 0
                return ''
            for bad_char in BAD_FILENAME_CHARACTERS
                if name.indexOf(bad_char) != -1
                    bootbox.alert("Filenames must not contain the character '#{bad_char}'.")
                    return ''
            s = $.trim(@new_file_tab.find(".project-new-file-path").text() + name)
            if ext?
                if misc.filename_extension(s) != ext
                    s += '.' + ext
            return s

        create_terminal = () =>
            p = path('term')
            if p.length == 0
                @new_file_tab_input.focus()
                return false
            @display_tab("project-editor")
            tab = @editor.create_tab(filename:p, content:"")
            @editor.display_tab(path:p)
            return false

        @new_file_tab.find("a[href=#new-terminal]").click(create_terminal)

        @new_file_tab.find("a[href=#new-worksheet]").click () =>
            create_file('sagews')
            return false

        @new_file_tab.find("a[href=#new-latex]").click () =>
            create_file('tex')
            return false

        @new_file_tab.find("a[href=#new-ipython]").click () =>
            create_file('ipynb')
            return false

        @new_file_tab.find("a[href=#new-tasks]").click () =>
            create_file('tasks')
            return false

        @new_file_tab.find("a[href=#new-course]").click () =>
            create_file('course')
            return false


        # the search/mini file creation box
        mini_search_box = @container.find(".salvus-project-search-for-file-input")
        mini_set_input = (name) =>
            if not name?
                name = mini_search_box.val().trim()
            if name == ""
                name = @default_filename()
            @update_new_file_tab_path()
            @new_file_tab_input.val(name)
            mini_search_box.val('')

        @container.find("a[href=#smc-mini-new]").click () =>
            name = mini_search_box.val().trim()
            if name
                mini_set_input()
                ext = misc.filename_extension(name)
                if ext
                    create_file(ext)
                else
                    create_file('sagews')
            else
                @display_tab("project-new-file")

        @container.find(".smc-mini-new-file-type-list").find("a[href=#new-file]").click (evt) ->
            mini_set_input()
            click_new_file_button(evt)
            return true

        @container.find(".smc-mini-new-file-type-list").find("a[href=#new-folder]").click (evt) ->
            mini_set_input()
            create_folder()
            return true

        BANNED_FILE_TYPES = ['doc', 'docx', 'pdf', 'sws']

        create_file = (ext) =>
            p = path(ext)

            if not p
                return false

            ext = misc.filename_extension(p)

            if ext == 'term'
                create_terminal()
                return false

            if ext in BANNED_FILE_TYPES
                alert_message(type:"error", message:"Creation of #{ext} files not supported.", timeout:3)
                return false

            if ext == 'tex'
                for bad_char in BAD_LATEX_FILENAME_CHARACTERS
                    if p.indexOf(bad_char) != -1
                        bootbox.alert("Filenames must not contain the character '#{bad_char}'.")
                        return false

            if p.length == 0
                @new_file_tab_input.focus()
                return false
            if p[p.length-1] == '/'
                create_folder()
                return false
            salvus_client.exec
                project_id : @project.project_id
                command    : "new-file"
                timeout    : 10
                args       : [p]
                err_on_exit: true
                cb         : (err, output) =>
                    if err
                        alert_message(type:"error", message:"#{output?.stdout} #{output?.stderr} #{err}")
                    else
                        alert_message(type:"info", message:"Created new file '#{p}'")
                        @display_tab("project-editor")
                        tab = @editor.create_tab(filename:p, content:"")
                        @editor.display_tab(path:p)
            return false

        create_folder = () =>
            p = path()
            if p.length == 0
                @new_file_tab_input.focus()
                return false
            @ensure_directory_exists
                path : p
                cb   : (err) =>
                    if not err
                        alert_message(type:"info", message:"Made directory '#{p}'")
                        @display_tab("project-file-listing")
            return false

        click_new_file_button = (evt) =>
            if evt?
                ext = $(evt.target).closest('a').data('ext')
            else
                ext = undefined
            target = @new_file_tab_input.val()
            if target.indexOf("://") != -1 or misc.startswith(target, "git@github.com:")
                download_button.icon_spin(start:true, delay:500)
                new_file_from_web target, () =>
                    download_button.icon_spin(false)
            else
                create_file(ext)
            return false

        @new_file_tab.find("a[href=#new-file]").click(click_new_file_button)

        download_button = @new_file_tab.find("a[href=#new-download]").click(click_new_file_button)

        @new_file_tab.find("a[href=#new-folder]").click(create_folder)
        @new_file_tab_input.keydown (event) =>
            if event.keyCode == 13
                click_new_file_button()
                return false
            if (event.metaKey or event.ctrlKey) and event.keyCode == 79     # control-o
                #console.log("keyup: new_file_tab")
                @display_tab("project-activity")
                return false

        new_file_from_web = (url, cb) =>
            dest = @new_file_tab.find(".project-new-file-path").text()
            long = () ->
                if dest == ""
                    d = "root of project"
                else
                    d = dest
                alert_message
                    type    : 'info'
                    message : "Downloading '#{url}' to '#{d}', which may run for up to #{FROM_WEB_TIMEOUT_S} seconds..."
                    timeout : 5
            timer = setTimeout(long, 3000)
            @get_from_web
                url     : url
                dest    : dest
                timeout : FROM_WEB_TIMEOUT_S
                alert   : true
                cb      : (err) =>
                    clearTimeout(timer)
                    if not err
                        alert_message(type:'info', message:"Finished downloading '#{url}' to '#{dest}'.")
                    cb?(err)
            return false

    update_new_file_tab_path: () =>
        # Update the path
        path = @current_pathname()
        if path != ""
            path += "/"
        @new_file_tab.find(".project-new-file-path").text(path)
        return path

    default_filename: () =>
        return misc.to_iso(new Date()).replace('T','-').replace(/:/g,'')

    show_new_file_tab: () =>
        path = @update_new_file_tab_path()
        @init_dropzone_upload()

        elt = @new_file_tab.find(".project-new-file-if-root")
        if path != ''
            elt.hide()
        else
            elt.show()

        # Clear the filename and focus on it
        @new_file_tab_input.val(@default_filename())
        if not IS_MOBILE
            @new_file_tab_input.focus().select()

    update_snapshot_ui_elements: () =>
        # nothing special to do
        return

    chdir: (path, no_focus) =>
        @set_current_path(path)
        @update_file_list_tab(no_focus)

    switch_to_directory: (new_path) =>
        @current_path = new_path
        @update_file_list_tab()

    file_action_dialog: (obj) => # obj = {name:[optional], fullname:?, isdir:?}
        if not obj.name?
            i = obj.fullname.lastIndexOf('/')
            if i != -1
                obj.name = obj.fullname.slice(i+1)
            else
                obj.name = obj.fullname
        dialog = $(".salvus-file-action-dialog").clone()
        dialog.find(".salvus-file-filename").text(obj.name)
        if @public_access
            dialog.find(".salvus-project-write-access").hide()
            dialog.find(".salvus-project-public-access").show().css(display:'inline-block')
        else
            dialog.find(".salvus-project-write-access").show().css(display:'inline-block')
            dialog.find(".salvus-project-public-access").hide()
            # start write-able version
            rename = () =>
                new_name = name.text()
                if new_name != obj.name
                    dialog.modal('hide')
                    path = misc.path_split(obj.fullname).head
                    @rename_file path, obj.name, new_name, (err) =>
                        if err
                            alert_message(type:"error", message:err)
                        else
                            if path != ""
                                new_fullname = path + "/" + new_name
                            else
                                new_fullname = new_name
                            if obj.fullname == @current_pathname()
                                @chdir(new_fullname)
                            obj.name = new_name
                            obj.fullname = new_fullname
                            @update_file_list_tab(true)

            if obj.fullname != ''
                name = dialog.find(".salvus-file-filename").attr("contenteditable",true).blur(rename).keydown (evt) =>
                    if evt.which == 13
                        rename(); return false
                    else if evt.which == 27
                        name.text(obj.name).blur(); return false
                dialog.find("a[href=#move-file]").click () =>
                    dialog.modal('hide')
                    @move_file_dialog(obj.fullname)
                    return false
            else
                dialog.find("a[href=#move-file]").hide()

            dialog.find("a[href=#copy-file]").click () =>
                dialog.modal('hide')
                @copy_file_dialog(obj.fullname, obj.isdir)
                return false

            if obj.fullname != ''
                dialog.find("a[href=#delete-file]").click () =>
                    dialog.modal('hide')
                    @trash_file
                        path : obj.fullname
                    if obj.fullname == @current_pathname()
                        @current_path.pop()
                        @update_file_list_tab()
                    return false
            else
                dialog.find("a[href=#delete-file]").hide()

            if not @public_access and not (obj.fullname == '.snapshots' or misc.startswith(obj.fullname,'.snapshots/'))
                @is_path_published
                    path : obj.fullname
                    cb   : (err, pub) =>
                        publish = dialog.find(".salvus-project-published-desc")
                        publish.show()
                        desc = publish.find(".salvus-project-published-desc-input")

                        if pub
                            publish.find(".salvus-project-in-published-meaning").show()

                            if obj.url?
                                url = obj.url
                            else
                                url = document.URL + obj.name
                                if obj.isdir
                                    url += '/'
                            the_url = publish.find(".salvus-project-in-published-url")
                            the_url.show().val(url)
                            the_url.click () ->
                                $(this).select()

                            if pub.public_path != obj.fullname
                                publish.find(".salvus-project-in-published").show().find(".salvus-project-in-published-path").text(pub.public_path)
                                return
                            else
                                desc.show()
                                desc.val(pub.description)
                                publish.find("a[href=#unpublish-path]").show().click () =>
                                    dialog.modal('hide')
                                    @unpublish_path
                                        path : obj.fullname
                                        cb          : (err) =>
                                            if err
                                                alert_message(type:'error', message:"Error unpublishing '#{obj.fullname}' -- #{err}")
                                            else
                                                alert_message(message:"Unpublished '#{obj.fullname}'")
                                                @update_file_list_tab(true)
                                    return false
                        else
                            desc.show()
                            dialog.find("a[href=#publish-path]").show().click () =>
                                dialog.modal('hide')
                                @publish_path
                                    path        : obj.fullname
                                    description : desc.val()
                                    cb          : (err) =>
                                        if err
                                            alert_message(type:'error', message:"Error publishing '#{obj.fullname}' -- #{err}")
                                        else
                                            alert_message(message:"Published '#{obj.fullname}' -- #{desc.val()}")
                                            @update_file_list_tab(true)
                                return false

                        # whenever user changes the description and hits enter, have that new description get submitted
                        desc.keydown (evt) =>
                            if evt.which == 13 and desc.val() # enter and nontrivial
                                dialog.modal('hide')
                                # update description
                                @publish_path
                                    path        : obj.fullname
                                    description : desc.val()
                                    cb          : (err) =>
                                        if err
                                            alert_message(type:'error', message:"Error publishing '#{obj.fullname}' -- #{err}")
                                        else
                                            alert_message(message:"Published '#{obj.fullname}' -- #{desc.val()}")
                                            @update_file_list_tab(true)

            # end write-able version

        # init for both public and writeable

        dialog.find(".btn-close").click () =>
            dialog.modal('hide')
            return false

        dialog.find("a[href=#copy-to-another-project]").click () =>
            dialog.modal('hide')
            @copy_to_another_project_dialog(obj.fullname, obj.isdir)
            return false

        if obj.isdir
            if @public_access # only done for public access right now.
                dialog.find("a[href=#download-file]").click () =>
                    dialog.modal('hide')
                    @download_file
                        path : obj.fullname + ".zip"   # creates the zip in memory on the fly
                    return false
            else
                dialog.find("a[href=#download-file]").hide()
        else
            dialog.find("a[href=#download-file]").click () =>
                dialog.modal('hide')
                @download_file
                    path : obj.fullname
                return false

        dialog.modal()

    # Update the listing of files in the current_path, or display of the current file.
    update_file_list_tab: (no_focus) =>
        @_update_file_list_tab no_focus, () =>
            @_show_all_files = false

    init_listing_show_all: () =>
        @container.find(".project-file-listing-show_all").click () =>
            @_show_all_files = true
            @update_file_list_tab()
            return false

    _update_file_list_tab: (no_focus, cb) =>

        path = @current_path.join('/')
        if path == @_requested_path
            # already requested
            return

        if not @_requested_path?
            spinner = @container.find(".project-file-listing-spinner")
            @_file_list_tab_spinner_timer = setTimeout( (() -> spinner.show().spin()), 1000 )

        if @public_access
            g = salvus_client.public_project_directory_listing
        else
            g = salvus_client.project_directory_listing

        @_requested_path = path

        listing = undefined
        f = (cb) =>
            if path != @_requested_path
                # requested another path after this one, so ignore
                # this now useless listing
                cb()
                return
            g
                project_id : @project.project_id
                path       : path
                time       : @_sort_by_time
                hidden     : @container.find("a[href=#hide-hidden]").is(":visible")
                timeout    : 10
                cb         : (err, _listing) =>
                    if err
                        cb(err)
                    else
                        listing = _listing
                        cb()

        misc.retry_until_success
            f           : f
            start_delay : 3000
            max_delay   : 10000
            factor      : 1.5
            max_tries   : 10
            cb          : (err) =>
                if path != @_requested_path
                    # requested another path after this one, so ignore
                    # this now useless listing
                    cb?()
                    return

                delete @_requested_path

                clearTimeout(@_file_list_tab_spinner_timer)
                @container.find(".project-file-listing-spinner").spin(false).hide()

                if err
                    if not @public_access
                        alert_message(type:"error", message:"Problem reading the directory listing for '#{path}' -- #{misc.trunc(err,100)}; email help@sagemath.com if this persists.")
                        @current_path = []
                    cb?(err)
                else
                    @render_file_listing
                        path     : path
                        listing  : listing
                        no_focus : no_focus
                        cb       : cb

    invalidate_render_file_listing_cache: () =>
        delete @_update_file_list_tab_last_path

    render_file_listing: (opts) =>
        {path, listing, no_focus, cb} = defaults opts,
            path     : required     # directory we are rendering the listing for
            listing  : required     # the listing data
            no_focus : false
            cb       : undefined

        url_path = path
        if url_path.length > 0 and url_path[url_path.length-1] != '/'
            url_path += '/'

        if @current_tab.name == "project-file-listing"
            @push_state('files/' + url_path)

        # Update the display of the path above the listing or file preview
        @set_current_path(path)
        @update_current_path()

        # If the files haven't changed -- a VERY common case -- don't rebuild the whole listing.
        files = misc.to_json(listing)  # use json to deep compare -- e.g., file size matters!
        if @_update_file_list_tab_last_path == path and @_update_file_list_tab_last_path_files == files and @_update_file_sort_by_time == @_sort_by_time and @_last_show_all_files == @_show_all_files
            cb?()
            return
        else
            @_update_file_list_tab_last_path       = path
            @_update_file_list_tab_last_path_files = files
            @_update_file_sort_by_time             = @_sort_by_time
            @_last_show_all_files                  = @_show_all_files

        @_last_listing = listing

        if @current_path[0] == '.trash'
            @container.find("a[href=#empty-trash]").show()
            @container.find("a[href=#trash]").hide()
        else
            @container.find("a[href=#empty-trash]").hide()
            @container.find("a[href=#trash]").show()

        # Now rendering the listing or file preview
        file_or_listing = @container.find(".project-file-listing-file-list")

        # TODO: for long listings this file_or_listing.empty() dominates.
        # We should just change data/displayed names of entries or something and hide others -- be way more clever. For LATER.
        file_or_listing.empty()

        directory_is_empty = true

        @container.find(".project-file-tools a").removeClass("disabled")

        # Hide the edit button
        @container.find(".project-file-tools a[href=#edit]").addClass("disabled")

        # Hide the move and delete buttons if and only if this is the top level path
        if path == ""
            @container.find(".project-file-tools a[href=#move]").addClass("disabled")
            @container.find(".project-file-tools a[href=#delete]").addClass("disabled")

        click_file = (e) =>
            obj = $(e.delegateTarget).closest(".project-path-link").data('obj')
            target = $(e.target)
            if target.hasClass("salvus-file-action") or target.parent().hasClass('salvus-file-action')
                @file_action_dialog(obj)
            else
                if obj.isdir
                    @hide_command_line_output()
                    @set_current_path(obj.fullname)
                    @update_file_list_tab()
                else
                    @open_file
                        path       : obj.fullname
                        foreground : not(e.which==2 or (e.ctrlKey or e.metaKey))
            e.preventDefault()

        # TODO: not used
        ###
        that = @
        file_dropped_on_directory = (event, ui) ->
            src = ui.draggable.data('name')
            if not src?
                return
            dest = $(@).data('name')
            that.move_file
                src  : src
                dest : dest
                cb   : (err) =>
                    if not err
                        that.update_file_list_tab(true)
        ###

        if @current_path.length > 0
            # Create special link to the parent directory
            t = template_project_file.clone()
            t.addClass('project-directory-link')
            t.find("a[href=#file-action]").hide()
            parent = @current_path.slice(0, @current_path.length-1).join('/')
            t.data('name', parent)
            t.find(".project-file-name").html("Parent Directory")
            t.find(".project-file-icon").removeClass("fa-file").addClass('fa-reply')
            t.find("input").hide()  # hide checkbox, etc.
            # Clicking to open the directory
            t.click () =>
                @current_path.pop()
                @update_file_list_tab()
                return false
            #t.droppable(drop:file_dropped_on_directory, scope:'files')
            t.find("a").tooltip
                trigger : 'hover'
                delay   : { show: 500, hide: 100 }
            t.find(".fa-arrows").tooltip
                trigger : 'hover'
                delay   : { show: 500, hide: 100 }

            if @public_access
                parent_link = t
                @is_path_published
                    path : parent
                    cb   : (err, is_published) =>
                        if is_published
                            file_or_listing.prepend(parent_link)
            else
                file_or_listing.append(t)

        tm = misc.walltime()

        masked_file_exts_bad  = (key for key of masked_file_exts)
        masked_file_exts_good = (value for key, value of masked_file_exts)
        masked_file_bad_index = []
        masked_file_good_name = []
        n = 0
        @container.find(".project-file-listing-show_all").hide().find('span').text('')
        search = @_file_search_box.val()
        elts = {}
        for obj, i in listing.files
            if not search and (not @_show_all_files and n >= MAX_FILE_LISTING_SIZE)
                @container.find(".project-file-listing-show_all").show().find('span').text(listing.files.length - n)
                break
            n += 1
            t = template_project_file.clone()

            t.data('obj', obj)
            if obj.isdir
                t.addClass('project-directory-link')
                t.find(".project-file-name").text(obj.name)
                date = undefined
                if path == ".snapshots/master" and obj.name.length == '2014-04-04-061502'.length
                    date = misc.parse_bup_timestamp(obj.name)
                    t.find(".project-file-name").text(date)
                else if obj.mtime
                    date = new Date(obj.mtime*1000)
                if date?
                    t.find(".project-file-last-mod-date").attr('title', date.toISOString()).timeago()
                name = obj.name
                t.find(".project-file-icon").removeClass("fa-file").addClass("fa-folder-open-o")
            else
                if obj.name.indexOf('.') != -1
                    ext = filename_extension(obj.name)
                    name = obj.name.slice(0,obj.name.length - ext.length - 1)
                else
                    ext = ''
                    name = obj.name
                t.find(".project-file-name").text(name)
                if ext != ''
                    if ext in masked_file_exts_bad
                        masked_file_bad_index.push(i)
                    if ext in masked_file_exts_good
                        masked_file_good_name.push(obj.name)
                    t.find(".project-file-name-extension").text('.' + ext)
                    if file_associations[ext]? and file_associations[ext].icon?
                        t.find(".project-file-icon").removeClass("fa-file").addClass(file_associations[ext].icon)
                if obj.mtime?
                    date = (new Date(obj.mtime*1000)).toISOString()
                    t.find(".project-file-last-mod-date").attr('title', date).timeago()
                if obj.size?
                    t.find(".project-file-size").text(human_readable_size(obj.size))
                if obj.commit?.date?
                    date = (new Date(obj.commit.date*1000)).toISOString()
                    t.find(".project-file-last-commit-date").attr('title', date).timeago()
                else
                    t.find(".project-file-last-commit-date-container").hide()
                if obj.commit?.message?
                    t.find(".project-file-last-commit-message").text(trunc(obj.commit.message, 70))
            #end if

            obj.fullname = if path != "" then path + '/' + obj.name else obj.name
            elts[obj.fullname] = t
            directory_is_empty = false
            # Add our new listing entry to the list:
            file_or_listing.append(t)
            t.click(click_file)

            ###
            # Define file actions using a closure
            @_init_listing_actions(t, path, obj.name, obj.fullname, obj.isdir? and obj.isdir, obj.snapshot?)

            # Drag handle for moving files via drag and drop.
            handle = t.find(".project-file-drag-handle")
            handle.click () =>
                # do not want clicking on the handle to open the file.
                return false
            t.draggable
                handle         : handle
                zIndex         : 100
                opacity        : 0.75
                revertDuration : 200
                revert         : "invalid"
                axis           : 'y'
                scope          : 'files'

            t.find("a").tooltip
                trigger : 'hover'
                delay   : { show: 500, hide: 100 }
            t.find(".fa-arrows").tooltip
                trigger : 'hover'
                delay   : { show: 500, hide: 100 }
            ###

        if not @public_access
            # Very explicitly label the public paths as such, so user is reminding
            # that whatever they are changing is publicly visible.
            @is_path_published
                path : path
                cb   : (err, is_published) =>
                    if err or path != @current_pathname()
                        # path changed since request, so don't mess things up
                        return
                    if is_published
                        # show all public labels next to files/directories
                        file_or_listing.find(".salvus-file-action-public-label").show()
                        # also, show public label at top
                        @container.find("a[href=#file-action-current-path]").find(".salvus-file-action-public-label").show()
                    else
                        @container.find("a[href=#file-action-current-path]").find(".salvus-file-action-public-label").hide()
                        # determine which files/paths in the current directory
                        # are public, and set their labels
                        @paths_that_are_public
                            paths : (obj.fullname for obj in listing.files)
                            cb    : (err, public_paths) =>
                                if not err and path == @current_pathname()
                                    v = (x.path for x in public_paths)
                                    for fullname in v
                                        elts[fullname]?.find(".salvus-file-action-public-label").show()

        # Masks (greys out) files that the user probably doesn't want to open
        if account.account_settings.settings.other_settings.mask_files
            # mask compiled files corresponding to source files
            for index in masked_file_bad_index
                filename = listing.files[index].name
                ext = filename_extension(filename)
                name = filename.slice(0, filename.length - ext.length - 1)
                compare_name = name

                # TODO: other unusual cases may need to be added here
                if ext == 'gz'
                    second_extension = 'synctex'
                    if filename_extension(name) == second_extension
                        compare_name = name.slice(0, name.length - second_extension.length - 1)
                    else
                        continue

                good_name_index = masked_file_good_name.indexOf(compare_name + "." + masked_file_exts[ext])
                if good_name_index != -1
                    # mask the matched file
                    i = if path == "" then index else index + 1 # skip over 'Parent Directory' link
                    $(@container.find(".project-file-listing-file-list").children()[i]).addClass("project-file-listing-masked-file")

            # mask files starting with a '.'
            for file, index in listing.files
                if file.name.indexOf('.') == 0
                    i = if path == "" then index else index + 1 # skip over 'Parent Directory' link
                    $(@container.find(".project-file-listing-file-list").children()[i]).addClass("project-file-listing-masked-file")

        @clear_file_search()
        #console.log("done building listing in #{misc.walltime(tm)}")
        tm = misc.walltime()
        @update_file_search()
        #console.log("done building file search #{misc.walltime(tm)}")
        tm = misc.walltime()

        # No files
        if not @public_access and directory_is_empty and path != ".trash" and path.slice(0,10) != ".snapshots"
            @container.find(".project-file-listing-no-files").show()
        else
            @container.find(".project-file-listing-no-files").hide()

        if path.slice(0,10) == '.snapshots'
            @container.find(".project-file-listing-snapshot-warning").show()
        else
            @container.find(".project-file-listing-snapshot-warning").hide()

        if no_focus? and no_focus
            cb?(); return

        @focus_file_search()
        #console.log("done with everything #{misc.walltime(tm)}")

        cb?()

    _init_listing_actions: (t, path, name, fullname, isdir, is_snapshot) =>
        if not fullname?
            if path != ""
                fullname = path + '/' + name
            else
                fullname = name

        t.data('name', fullname)  # save for other uses outside this function

        b = t.find(".project-file-buttons")

        open = (e) =>
            if isdir
                @set_current_path(fullname)
                @update_file_list_tab()
            else
                @open_file
                    path : fullname
                    foreground : not(e.which==2 or (e.ctrlKey or e.metaKey))
            return false

        file_link = t.find("a[href=#open-file]")

        if not (is_snapshot or isdir)
            # Opening a file
            file_link.mousedown(open)

            # Clicking on link -- open the file
            # do not use t.mousedown here, since that breaks the download, etc., links.
            t.click(open)

        if isdir
            t.find("a[href=#open-file]").click(open)

        if is_snapshot
            restore = () =>
                n = fullname.slice(".snapshot/xxxx-xx-xx/".length)
                i = n.indexOf('/')
                if i != -1
                    snapshot = n.slice(0,i)
                    path = n.slice(i+1)
                else
                    snapshot = n
                    path = '.'
                m = "Are you sure you want to <b>overwrite</b> '#{path}' with the version from #{snapshot}?  Any modified overwritten files will be moved to the trash before being overwritten."
                bootbox.confirm m, (result) =>
                    if result
                        alert_message
                            type    : "info"
                            timeout : 3
                            message : "Restoring '#{snapshot}/#{path}'... (this can take a few minutes)"
                        salvus_client.call
                            message:
                                message.snap
                                    command    : 'restore'
                                    project_id : @project.project_id
                                    snapshot   : snapshot
                                    path       : path
                                    timeout    : 1800
                            timeout :
                                1800
                            cb : (err, resp) =>
                                if err or resp.event == 'error'
                                    alert_message(type:"error", message:"Error restoring '#{path}'")
                                else
                                    x = path.split('/')
                                    @current_path = x.slice(0, x.length-1)
                                    @update_file_list_tab()
                                    alert_message(type:"success", message:"Restored '#{path}' from #{snapshot}.")

                return false

            t.find("a[href=#restore]").click(restore)

            # This is temporary -- open-file should show a preview and changelog, but that will
            # take some time to implement.
            if not isdir
                t.find("a[href=#open-file]").click(restore)

            return

        # Show project file buttons on hover only
        if not IS_MOBILE
            t.hover( (() -> b.show()) ,  (() -> b.hide()))

        # Downloading a file
        dl = b.find("a[href=#download-file]")
        dl.click () =>
            dl.find(".spinner").show()
            @download_file
                path : fullname
                cb   : () =>
                    dl.find(".spinner").hide()
            return false

        # Deleting a file
        del = b.find("a[href=#delete-file]")
        del.click () =>
            del.find(".spinner").show()
            @trash_file
                path : fullname
                cb   : () =>
                    del.find(".spinner").hide()
            return false

        copy = b.find("a[href=#copy-file]")
        copy.click () =>
            @copy_file_dialog(fullname)
            return false

        # Renaming a file
        rename_link = t.find('a[href=#rename-file]')

        rename_link.click () =>
            @click_to_rename_file(path, file_link)
            return false

    copy_file_dialog:  (path, isdir, cb) =>
        dialog = $(".project-copy-file-dialog").clone()
        dialog.modal()
        args = undefined
        rsync = ""
        new_src = undefined
        new_dest = undefined
        async.series([
            (cb) =>
                if path.slice(0,'.snapshots/'.length) == '.snapshots/'
                    dest = "/projects/#{@project.project_id}/" + path.slice('.snapshots/master/2014-04-06-052506/'.length)
                else
                    dest = path
                if isdir   # so the file goes *into* the destination folder
                    dest += '/'

                args = () =>
                    new_src  = dialog.find(".copy-file-src").val()
                    new_dest = dialog.find(".copy-file-dest").val()
                    return ['-rltgoDxH', '--backup', '--backup-dir=.trash/', new_src, new_dest]

                update_rsync_command = (evt) =>
                    v = []
                    for a in args()
                        if a.indexOf(' ') != -1
                            v.push("'#{a}'")
                        else
                            v.push(a)
                    rsync = "rsync #{v.join(' ')}"
                    dialog.find(".salvus-rsync-command").text(rsync)
                    if evt?.which == 13
                        submit(true)

                dialog.find(".copy-file-src").val(path).keyup(update_rsync_command)
                dialog.find(".copy-file-dest").val(dest).focus().select().keyup(update_rsync_command)

                update_rsync_command()

                submit = (ok) =>
                    dialog.modal('hide')
                    if not ok
                        new_dest = undefined
                    cb()
                    return false
                dialog.find(".btn-close").click(()=>submit(false))
                dialog.find(".btn-submit").click(()=>submit(true))
            (cb) =>
                if not new_dest?
                    cb(); return
                alert_message(type:'info', message:"Copying #{new_src} to #{new_dest}...")
                salvus_client.exec
                    project_id : @project.project_id
                    command    : 'rsync'  # don't use "a" option to rsync, since on snapshots results in destroying project access!
                    args       : args()
                    timeout    : 120   # how long rsync runs on client
                    network_timeout : 120   # how long network call has until it must return something or get total error.
                    err_on_exit: true
                    path       : '.'
                    cb         : (err, output) =>
                        if err
                            alert_message(type:"error", message:"Error copying #{new_src} to #{new_dest} -- #{err}")
                        else
                            alert_message(type:"success", message:"Successfully copied #{new_src} to #{new_dest}")
                            @update_file_list_tab()
                        cb(err)
        ], (err) => cb?(err))

    copy_to_another_not_ready_dialog: (signed_in_already) =>
        dialog = $(".salvus-project-copy-file-signin-dialog").clone()
        dialog.find(".btn-close").click () ->
            dialog.modal('hide')
            return false
        if signed_in_already
            dialog.find('.salvus-signed-in-already').show()
            dialog.find("a[href=#create-project]").click () ->
                dialog.modal('hide')
                require('projects').create_new_project_dialog()
                return false
        else
            dialog.find('.salvus-not-signed-in-already').show()
            dialog.find("a[href=#create-account]").click () ->
                dialog.modal('hide')
                top_navbar.switch_to_page('account')
                account.show_page("account-create_account")
                return false
            dialog.find("a[href=#sign-in]").click () ->
                dialog.modal('hide')
                top_navbar.switch_to_page('account')
                account.show_page("account-sign_in")
                return false
        dialog.modal()

    copy_to_another_project_dialog: (path, isdir, cb) =>
        if not require('account').account_settings.is_signed_in()
            @copy_to_another_not_ready_dialog()
            cb?("not signed in")
            return

        dialog = $(".salvus-project-copy-to-another-project-dialog").clone()

        src_path          = undefined
        target_project_id = undefined
        target_project    = undefined
        target_path       = undefined
        overwrite_newer   = undefined
        delete_missing    = undefined
        project_list      = undefined
        is_public         = undefined
        async.series([
            (cb) =>
                require('projects').get_project_list
                    update : false   # uses cached version if available, rather than downloading from server
                    select : dialog.find(".salvus-project-target-project-id")
                    cb : (err, x) =>
                        if err
                            cb(err)
                        else
                            project_list = (a for a in x when not a.deleted)
                            if project_list.length == 0
                                @copy_to_another_not_ready_dialog(true)
                                cb('no projects')
                            else
                                dialog.modal()
                                cb()
            (cb) =>
                # determine whether or not the source path is available via public access
                if @public_access
                    is_public = true
                    cb()
                else
                    @is_path_published
                        path : path
                        cb   : (err, x) =>
                            is_public = x
                            cb(err)
            (cb) =>
                if path.slice(0,'.snapshots/'.length) == '.snapshots/'
                    dest = path.slice('.snapshots/master/2014-04-06-052506/'.length)
                else
                    dest = path
                dialog.find(".salvus-project-copy-src-path").val(path)
                dialog.find(".salvus-project-copy-target-path").val(path)
                if isdir
                    dialog.find(".salvus-project-copy-dir").show()
                else
                    dialog.find(".salvus-project-copy-file").show()

                submit = (ok) =>
                    dialog.modal('hide')
                    if ok
                        src_path          = dialog.find(".salvus-project-copy-src-path").val()
                        selector          = dialog.find(".salvus-project-target-project-id")
                        target_project_id = selector.val()
                        target_project    = selector.find("option[value='#{target_project_id}']:first").text()
                        target_path       = dialog.find(".salvus-project-copy-target-path").val()
                        overwrite_newer   = dialog.find(".salvus-project-overwrite-newer").is(":checked")
                        delete_missing    = dialog.find(".salvus-project-delete-missing").is(":checked")
                    cb()
                    return false
                dialog.find(".btn-close").click(()=>submit(false))
                dialog.find(".btn-submit").click(()=>submit(true))
            (cb) =>
                if not src_path? or not target_path? or not target_project_id?
                    cb(); return
                alert_message(type:'info', message:"Copying #{src_path} to #{target_path} in #{target_project}...")
                salvus_client.copy_path_between_projects
                    public            : is_public
                    src_project_id    : @project.project_id
                    src_path          : src_path
                    target_project_id : target_project_id
                    target_path       : target_path
                    overwrite_newer   : overwrite_newer
                    delete_missing    : delete_missing
                    timeout           : 120
                    cb         : (err) =>
                        if err
                            alert_message(type:"error", message:"Error copying #{src_path} to #{target_path} in #{target_project} -- #{err}")
                        else
                            alert_message(type:"success", message:"Successfully copied #{src_path} to #{target_path} in #{target_project}")
                        cb(err)
        ], (err) =>
            if err
                cb?(err)
            else
                cb?(undefined, {project_id:target_project_id, path: target_path})
        )

    move_file_dialog:  (path, cb) =>
        dialog = $(".project-move-file-dialog").clone()
        dialog.modal()
        new_dest = undefined
        new_src = undefined
        async.series([
            (cb) =>
                if path.slice(0,'.snapshots/'.length) == '.snapshots/'
                    dest = path.slice('.snapshots/master/2014-04-06-052506/'.length)
                else
                    dest = path
                dialog.find(".move-file-src").val(path)
                dialog.find(".move-file-dest").val(dest).focus()
                submit = (ok) =>
                    dialog.modal('hide')
                    if ok
                        new_src = dialog.find(".move-file-src").val()
                        new_dest = dialog.find(".move-file-dest").val()
                    cb()
                    return false
                dialog.find(".btn-close").click(()=>submit(false))
                dialog.find(".btn-submit").click(()=>submit(true))
            (cb) =>
                if not new_dest?
                    cb(); return
                alert_message(type:'info', message:"Moving #{new_src} to #{new_dest}...")
                salvus_client.exec
                    project_id : @project.project_id
                    command    : 'mv'
                    args       : [new_src, new_dest]
                    timeout    : 60
                    network_timeout : 75   # how long network call has until it must return something or get total error.
                    err_on_exit: true
                    path       : '.'
                    cb         : (err, output) =>
                        if err
                            alert_message(type:"error", message:"Error moving #{new_src} to #{new_dest} -- #{err}")
                        else
                            alert_message(type:"success", message:"Successfully moved #{new_src} to #{new_dest}")
                            if path == @current_pathname()
                                @chdir(new_dest)
                            @update_file_list_tab()
                        cb(err)
        ], (err) => cb?(err))


    click_to_rename_file: (path, link) =>
        if link.attr('contenteditable')
            # already done.
            return
        link.attr('contenteditable',true)
        link.focus()
        original_name = link.text()
        link.text(original_name)
        doing_rename = false
        rename = () =>
            if doing_rename
                return
            new_name = link.text()
            if original_name != new_name
                doing_rename = true
                @rename_file(path, original_name, new_name)
                return false

        # Capture leaving box
        link.on 'blur', rename

        # Capture pressing enter
        link.keydown (evt) ->
            if evt.keyCode == 13
                rename()
                return false

        return false


    rename_file: (path, original_name, new_name, cb) =>
        if new_name.indexOf('/') != -1
            cb("filename may not contain a forward slash /")
            return
        @move_file
            src : original_name
            dest : new_name
            path : path
            cb   : cb

    move_file: (opts) =>
        opts = defaults opts,
            src   : required
            dest  : required
            path  : undefined   # default to root of project
            cb    : undefined   # cb(true or false)
            mv_args : undefined
            alert : true        # show alerts
        args = [opts.src, opts.dest]
        if opts.mv_args?
            args = args.concat(opts.mv_args)
        salvus_client.exec
            project_id : @project.project_id
            command    : 'mv'
            args       : args
            timeout    : 15  # move should be fast..., unless across file systems.
            network_timeout : 20
            err_on_exit : false
            path       : opts.path
            cb         : (err, output) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:"Error while moving '#{opts.src}' to '#{opts.dest}' -- #{err}")
                    else if output.event == 'error'
                        alert_message(type:"error", message:"Error moving '#{opts.src}' to '#{opts.dest}' -- #{output.error}")
                    else
                        alert_message(type:"info", message:"Moved '#{opts.src}' to '#{opts.dest}'")
                opts.cb?(err or output.event == 'error')

    ensure_directory_exists: (opts) =>
        opts = defaults opts,
            path  : required
            cb    : undefined  # cb(true or false)
            alert : true
        salvus_client.exec
            project_id : @project.project_id
            command    : "mkdir"
            timeout    : 15
            args       : ['-p', opts.path]
            cb         : (err, result) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:err)
                    else if result.event == 'error'
                        alert_message(type:"error", message:result.error)
                opts.cb?(err or result.event == 'error')

    ensure_file_exists: (opts) =>
        opts = defaults opts,
            path  : required
            cb    : undefined  # cb(true or false)
            alert : true

        async.series([
            (cb) =>
                dir = misc.path_split(opts.path).head
                if dir == ''
                    cb()
                else
                    @ensure_directory_exists(path:dir, alert:opts.alert, cb:cb)
            (cb) =>
                #console.log("ensure_file_exists -- touching '#{opts.path}'")
                salvus_client.exec
                    project_id : @project.project_id
                    command    : "touch"
                    timeout    : 15
                    args       : [opts.path]
                    cb         : (err, result) =>
                        if opts.alert
                            if err
                                alert_message(type:"error", message:err)
                            else if result.event == 'error'
                                alert_message(type:"error", message:result.error)
                        opts.cb?(err or result.event == 'error')
        ], (err) -> opts.cb?(err))

    get_from_web: (opts) =>
        opts = defaults opts,
            url     : required
            dest    : undefined
            timeout : 45
            alert   : true
            cb      : undefined     # cb(true or false, depending on error)

        {command, args} = transform_get_url(opts.url)

        salvus_client.exec
            project_id : @project.project_id
            command    : command
            timeout    : opts.timeout
            path       : opts.dest
            args       : args
            cb         : (err, result) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:err)
                    else if result.event == 'error'
                        alert_message(type:"error", message:result.error)
                opts.cb?(err or result.event == 'error')

    visit_trash: () =>
        @ensure_directory_exists
            path:'.trash'
            cb: (err) =>
                if not err
                    @current_path = ['.trash']
                    @update_file_list_tab()

    init_refresh_files: () =>
        @container.find("a[href=#refresh-listing]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            @hide_command_line_output()
            @update_file_list_tab()
            return false

    init_hidden_files_icon: () =>
        elt = @container.find(".project-hidden-files")
        elt.find("a").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            elt.find("a").toggle()
            @update_file_list_tab()
            return false

    init_sort_files_icon: () =>
        elt = @container.find(".project-sort-files")

        @_sort_by_time = local_storage(@project.project_id, '', 'sort_by_time')

        if not @_sort_by_time?
            settings = account?.account_settings?.settings
            if settings?
                @_sort_by_time = settings.other_settings.default_file_sort == 'time'
            else
                @_sort_by_time = false

        if @_sort_by_time
            elt.find("a").toggle()
        elt.find("a").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            elt.find("a").toggle()
            @_sort_by_time = elt.find("a[href=#sort-by-time]").is(":visible")
            local_storage(@project.project_id, '', 'sort_by_time', @_sort_by_time)
            @update_file_list_tab()
            return false

    init_project_activity: () =>
        if @public_access
            return
        page = @container.find(".project-activity")
        page.find("h1").icon_spin(start:true, delay:500)
        @_project_activity_log = page.find(".project-activity-log")

        click_type_button = (event) =>
            button = $(event.delegateTarget)
            text = button.text()
            if button.hasClass('btn-default')
                button.removeClass('btn-default').addClass('btn-warning')
                delete localStorage["project-activity-button-#{text}"]
            else
                button.removeClass('btn-warning').addClass('btn-default')
                localStorage["project-activity-button-#{text}"] = true
            @render_project_activity_log()
            return false

        if window.salvus_base_url
            LOG_FILE = '.sagemathcloud-local.log'
        else
            LOG_FILE = '.sagemathcloud.log'
        for button in @container.find(".project-activity-type-buttons").children()
            $(button).click(click_type_button)
            text = $(button).text()
            if localStorage["project-activity-button-#{text}"]
                $(button).removeClass('btn-warning').addClass('btn-default')

        @container.find(".salvus-project-activity-search").keyup (e) =>
            @_project_activity_log_page = 0
            @render_project_activity_log()
            if e?.keyCode == 13
                first = @container.find(".first-entry")
                if first.length != 0
                    first.find(".project-activity-open-filename").click()

        @container.find(".salvus-project-activity-search-clear").click () =>
            @container.find(".salvus-project-activity-search").val('').focus()
            @_project_activity_log_page = 0
            @render_project_activity_log()

        async.series([
            (cb) =>
                @ensure_file_exists
                    path  : LOG_FILE
                    alert : false
                    cb    : cb

            (cb) =>
                require('syncdoc').synchronized_string
                    project_id : @project.project_id
                    filename   : LOG_FILE
                    cb         : (err, doc) =>
                        @project_log = doc
                        cb(err)

            (cb) =>
                log_output = page.find(".project-activity-log")
                @project_log.on 'sync', () =>
                    @activity_indicator()
                    @render_project_activity_log()

                @project_activity({event:'open_project'})

                chat_input = page.find(".project-activity-chat")
                chat_input.keydown (evt) =>
                    if evt.which == 13 and not evt.shiftKey
                        mesg = $.trim(chat_input.val())
                        if mesg
                            @project_activity({event:'chat', mesg:mesg})
                            chat_input.val('')
                        return false

                @_project_activity_log_page = 0
                page.find(".project-activity-newer").click () =>
                    if page.find(".project-activity-newer").hasClass('disabled')
                        return false
                    @_project_activity_log_page -= 1
                    page.find(".project-activity-older").removeClass('disabled')
                    if @_project_activity_log_page < 0
                        @_project_activity_log_page = 0
                    else
                        @render_project_activity_log()
                    if @_project_activity_log_page == 0
                        page.find(".project-activity-newer").addClass('disabled')
                    return false

                page.find(".project-activity-older").click () =>
                    if page.find(".project-activity-older").hasClass('disabled')
                        return false
                    @_project_activity_log_page += 1
                    page.find(".project-activity-newer").removeClass('disabled')
                    @render_project_activity_log()
                    return false

                cb()

        ], (err) =>
            page.find("h1").icon_spin(false)
            if err
                # Just try again with exponential backoff  This can and does fail if say the project is first being initailized.
                if not @_init_project_activity?
                    @_init_project_activity = 3000
                else
                    @_init_project_activity = Math.min(1.3*@_init_project_activity, 60000)

                setTimeout((() => @init_project_activity()), @_init_project_activity)
            else
                @_init_project_activity = undefined
        )

    project_activity: (mesg, delay) =>
        if @project_log?
            #console.log("project_activity", mesg)
            mesg.fullname   = account.account_settings.fullname()
            mesg.account_id = account.account_settings.account_id()
            s = misc.to_json(new Date())
            mesg.date = s.slice(1, s.length-1)
            @project_log.live(@project_log.live() + '\n' + misc.to_json(mesg))
            @render_project_activity_log()
            @project_log.save()
        else
            if not delay?
                delay = 300
            else
                delay = Math.min(15000, delay*1.3)
            f = () =>
                @project_activity(mesg, delay)
            setTimeout(f, delay)

    render_project_activity_log: () =>
        if not @project_log? or @current_tab?.name != 'project-activity'
            return
        log = @project_log.live()
        if @_render_project_activity_log_last? and @_render_project_activity_log == log
            return
        else
            @_render_project_activity_log_last = log

        items_per_page = 30
        page = @_project_activity_log_page

        @_project_activity_log.html('')

        y = $.trim(@container.find(".salvus-project-activity-search").val())
        if y.length > 0
            search = (x.toLowerCase() for x in y.split(/[ ]+/))
        else
            search = []

        lines = log.split('\n')
        lines.reverse()
        start = page*items_per_page
        stop  = (page+1)*items_per_page

        types = []
        button_types = ['open', 'open_project', 'chat']
        for button, i in @container.find(".project-activity-type-buttons").children()
            if $(button).hasClass("btn-warning")
                types.push(button_types[i])
        if search.length > 0 or types.length != button_types.length
            if search.length == 1
                s = search[0]
                f = (x) ->
                    x.toLowerCase().indexOf(s) != -1
            else
                f = (x) ->
                    y = x.toLowerCase()
                    for k in search
                        if y.indexOf(k) == -1
                            return false
                    return true
            z = []
            for x in lines
                if x != ""
                    if f(x) and JSON.parse(x).event in types
                        z.push(x)
                        if z.length > stop
                            break
            lines = z

        lines = lines.slice(start, stop)

        template = $(".project-activity-templates")
        template_entry = template.find(".project-activity-entry")
        that = @

        if lines.length < items_per_page
            @container.find(".project-activity-older").addClass('disabled')
        else
            @container.find(".project-activity-older").removeClass('disabled')
        first = -1
        for e, i in lines
            if not $.trim(e)
                continue
            try
                entry = JSON.parse(e)
            catch e
                entry = {event:'other'}

            elt = undefined
            switch entry.event
                when 'chat'
                    elt = template.find(".project-activity-chat").clone()
                    elt.find(".project-activity-chat-mesg").text(entry.mesg).mathjax()
                when 'open_project'
                    elt = template.find(".project-activity-open_project").clone()
                when 'open'
                    elt = template.find(".project-activity-open").clone()
                    if first == -1 and @_project_activity_log_page == 0
                        first = i
                    f = (e) ->
                        filename = $(@).text()
                        if filename == ".sagemathcloud.log"
                            alert_message(type:"error", message:"Edit .sagemathcloud.log via the terminal (this is safe).")
                        else
                            that.open_file
                                path       : filename
                                foreground : not(e.which==2 or (e.ctrlKey or e.metaKey))
                        return false
                    elt.find(".project-activity-open-filename").text(entry.filename).click(f)
                    elt.find(".project-activity-open-type").text(entry.type)
                else
                    elt = template.find(".project-activity-other").clone()
                    elt.find(".project-activity-value").text(e)

            if elt?
                x = template_entry.clone()
                if i == first
                    x.addClass("first-entry")
                x.find(".project-activity-value").append(elt)
                if entry.fullname?
                    x.find(".project-activity-name").text(entry.fullname)
                else
                    x.find(".project-activity-name").hide()
                if entry.date?
                    try
                       x.find(".project-activity-date").attr('title',(new Date(entry.date)).toISOString()).timeago()
                    catch e
                       console.log("TODO: ignoring invalid project log time value -- #{entry.date}")
                else
                    x.find(".project-activity-date").hide()

                @_project_activity_log.append(x)


    init_delete_project: () =>
        if @project.deleted
            @container.find(".project-settings-delete").hide()
        else
            @container.find(".project-settings-delete").show()

        link = @container.find("a[href=#delete-project]")
        m = "<h4 style='color:red;font-weight:bold'><i class='fa-warning-sign'></i>  Delete Project</h4>Are you sure you want to delete this project?<br><br><span class='lighten'>You can always undelete the project later from the Projects tab.</span>"
        link.click () =>
            bootbox.confirm m, (result) =>
                if result
                    link.find(".spinner").show()
                    salvus_client.delete_project
                        project_id : @project.project_id
                        timeout    : 30
                        cb         : (err) =>
                            link.find(".spinner").hide()
                            if err
                                alert_message
                                    type : "error"
                                    message: "Error trying to delete project \"#{@project.title}\".   Please try again later. #{err}"
                            else
                                @close()
                                alert_message
                                    type : "info"
                                    message : "Successfully deleted project \"#{@project.title}\".  (If this was a mistake, you can undelete the project from the Projects tab.)"
                                    timeout : 5
            return false

    init_undelete_project: () =>

        if @project.deleted
            @container.find(".project-settings-undelete").show()
        else
            @container.find(".project-settings-undelete").hide()

        link = @container.find("a[href=#undelete-project]")

        m = "<h4 style='color:red;font-weight:bold'><i class='fa-warning-sign'></i>  Undelete Project</h4>Are you sure you want to undelete this project?"
        link.click () =>
            bootbox.confirm m, (result) =>
                if result
                    link.find(".spinner").show()
                    salvus_client.undelete_project
                        project_id : @project.project_id
                        timeout    : 10
                        cb         : (err) =>
                            link.find(".spinner").hide()
                            if err
                                alert_message
                                    type : "error"
                                    message: "Error trying to undelete project.  Please try again later. #{err}"
                            else
                                link.hide()
                                @container.find(".project-settings-undelete").hide()
                                @container.find(".project-settings-delete").show()
                                alert_message
                                    type : "info"
                                    message : "Successfully undeleted project \"#{@project.title}\"."
            return false

    init_hide_project: () =>
        if @project.hidden
            @container.find(".project-settings-hide").hide()
        else
            @container.find(".project-settings-hide").show()

        link = @container.find("a[href=#hide-project]")
        link.click () =>
            link.find(".spinner").show()
            salvus_client.hide_project_from_user
                project_id : @project.project_id
                cb         : (err) =>
                    link.find(".spinner").hide()
                    if err
                        alert_message
                            type : "error"
                            message: "Error trying to hide project \"#{@project.title}\".   Please try again later. #{err}"
                    else
                        @container.find(".project-settings-unhide").show()
                        @container.find(".project-settings-hide").hide()
                        alert_message
                            type : "info"
                            message : "Successfully hid project \"#{@project.title}\"."
                            timeout : 5
            return false

    init_unhide_project: () =>

        if @project.hidden
            @container.find(".project-settings-unhide").show()
        else
            @container.find(".project-settings-unhide").hide()

        link = @container.find("a[href=#unhide-project]")
        link.click () =>
            link.find(".spinner").show()
            salvus_client.unhide_project_from_user
                project_id : @project.project_id
                cb         : (err) =>
                    link.find(".spinner").hide()
                    if err
                        alert_message
                            type : "error"
                            message: "Error trying to unhide project.  Please try again later. #{err}"
                    else
                        @container.find(".project-settings-unhide").hide()
                        @container.find(".project-settings-hide").show()
                        alert_message
                            type : "info"
                            message : "Successfully unhid project \"#{@project.title}\"."
            return false

    init_make_public: () =>
        link = @container.find("a[href=#make-public]")
        m = "<h4 style='color:red;font-weight:bold'><i class='fa-warning-sign'></i>  Make Public</h4>Are you sure you want to make this project public?"
        link.click () =>
            bootbox.confirm m, (result) =>
                if result
                    link.find(".spinner").show()
                    salvus_client.update_project_data
                        project_id : @project.project_id
                        data       : {public:true}
                        cb         : (err) =>
                            link.find(".spinner").hide()
                            if err
                                alert_message
                                    type : "error"
                                    message: "Error trying to make project public.  Please try again later. #{err}"
                            else
                                @reload_settings()
                                alert_message
                                    type : "info"
                                    message : "Successfully made project \"#{@project.title}\" public."
            return false

    init_make_private: () =>
        link = @container.find("a[href=#make-private]")
        m = "<h4 style='color:red;font-weight:bold'><i class='fa-warning-sign'></i>  Make Private</h4>Are you sure you want to make this project private?"
        link.click () =>
            bootbox.confirm m, (result) =>
                if result
                    link.find(".spinner").show()
                    salvus_client.update_project_data
                        project_id : @project.project_id
                        data       : {public:false}
                        cb         : (err) =>
                            link.find(".spinner").hide()
                            if err
                                alert_message
                                    type : "error"
                                    message: "Error trying to make project private.  Please try again later. #{err}"
                            else
                                @reload_settings()
                                alert_message
                                    type : "info"
                                    message : "Successfully made project \"#{@project.title}\" private."
            return false

    init_add_noncloud_collaborator: () =>
        button = @container.find(".project-add-noncloud-collaborator").find("a")
        button.click () =>
            dialog = $(".project-invite-noncloud-users-dialog").clone()
            query = @container.find(".project-add-collaborator-input").val()
            @container.find(".project-add-collaborator-input").val('')
            dialog.find("input").val(query)
            email = "Please collaborate with me using the SageMathCloud on '#{@project.title}'.\n\n    https://cloud.sagemath.com\n\n--\n#{account.account_settings.fullname()}"
            dialog.find("textarea").val(email)
            dialog.modal()
            submit = () =>
                dialog.modal('hide')
                salvus_client.invite_noncloud_collaborators
                    project_id : @project.project_id
                    to         : dialog.find("input").val()
                    email      : dialog.find("textarea").val()
                    cb         : (err, resp) =>
                        if err
                            alert_message(type:"error", message:err)
                        else
                            alert_message(message:resp.mesg)
                return false
            dialog.submit(submit)
            dialog.find("form").submit(submit)
            dialog.find(".btn-submit").click(submit)
            dialog.find(".btn-close").click(() -> dialog.modal('hide'); return false)
            return false

    move_project_dialog: (opts) =>
        opts = defaults opts,
            target  : required
            nonfree : required
            desc    : required
        console.log("move_project_dialog")
        # if select nonfree target and no subscription, ask to upgrade
        # if select nonfree target and no card, ask for card
        dialog = $(".smc-move-project-dialog").clone()
        btn_submit = dialog.find(".btn-submit")
        dialog.find(".smc-move-project-dialog-desc").text(opts.desc)

        free    = dialog.find(".smc-move-project-dialog-free")
        nonfree = dialog.find(".smc-move-project-dialog-nonfree")
        if opts.nonfree
            stripe = require('stripe').stripe_user_interface()
            free.hide()
            nonfree.show()
            pay_checkbox = dialog.find(".smc-move-project-dialog-pay-checkbox")
            pay_checkbox.change () =>
                if pay_checkbox.is(':checked')
                    console.log("clicked pay_checkbox")
                    if stripe.has_a_billing_method()
                        btn_submit.removeClass('disabled')
                    else
                        stripe.new_card (created) =>
                            console.log("created=", created)
                            if created
                                btn_submit.removeClass('disabled')
                            else
                                pay_checkbox.attr('checked', false)
                                stripe.update()  # just in case maybe they entered it in another browser?
                else
                    btn_submit.addClass('disabled')
        else
            free.show()
            nonfree.hide()
        dialog.modal()
        submit = (do_it) =>
            console.log("submit: do_it=#{do_it}")
            dialog.modal('hide')
            if not do_it
                @set_project_location_select()
                return
            @container.find(".smc-project-moving").show()
            alert_message(timeout:60, type:"info", message:"Moving project '#{@project.title}' to #{opts.desc}...")
            salvus_client.move_project
                project_id : @project.project_id
                target     : opts.target
                cb         : (err, location) =>
                    @container.find(".smc-project-moving").hide()
                    if err
                        alert_message(timeout:60, type:"error", message:"Error moving project '#{@project.title}' to #{opts.desc} -- #{misc.to_json(err)}")
                    else
                        alert_message(timeout:60, type:"success", message:"Project '#{@project.title}' is now running at #{opts.desc}.")
                        @project.location = location
                        @project.datacenter = opts.target
                        @set_location()
                        @set_project_location_select()

        dialog.find(".btn-close").click(()=>submit(false))
        btn_submit.click(()=>submit(true))

    set_project_location_select: () =>
        @container.find(".smc-project-location-select").val(@project.datacenter)

    init_move_project: () =>
        @project.datacenter = 'dc0'   # fake
        #console.log("init_move_project")
        #window.project = @project
        @set_project_location_select()
        select = @container.find(".smc-project-location-select").change () =>
            target = select.val()
            e      = select.find("option[value=#{target}]")
            desc   = e.text()
            nonfree = e.hasClass("smc-nonfree")
            @move_project_dialog
                target  : target
                desc    : desc
                nonfree : nonfree


    ###
    xxx_init_move_project: () =>
        button = @container.find(".project-settings-move").find(".project-move-button")

        button.click () =>
            dialog = $(".project-location-dialog").clone()
            replica_template = dialog.find(".salvus-project-replica")

            dialog.modal()
            dialog.find(".btn-close").click(() -> dialog.modal('hide').remove(); return false)

            refresh = () =>
                dialog.find("a[href=#refresh-status]").find("i").addClass('fa-spin')
                salvus_client.project_snap_status
                    project_id : @project.project_id
                    cb         : (err, status) =>
                        dialog.find("a[href=#refresh-status]").find("i").removeClass('fa-spin')
                        if err
                            dialog.find(".salvus-project-location-dialog-error").show().text("Unable to load project snapshot status: #{err}")
                            return

                        replicas = dialog.find(".salvus-project-replicas")
                        replicas.children(":not(:first)").remove()
                        f = (loc) =>
                            #console.log("f(#{loc})")
                            data = status.locations[loc]
                            #console.log("data=",data)
                            if data?
                                replica = replica_template.clone()
                                if loc == status.current_location
                                    l = loc+" (current)"
                                else
                                    l = loc
                                replica.find(".salvus-project-replica-host").text(l)
                                replica.find(".salvus-project-replica-datacenter").text(data.datacenter)
                                if data.status?
                                    if data.status.status != 'up'
                                        available = false
                                        replica.find(".salvus-project-replica-status").html('<b>DOWN</b>')
                                        replica.css('background-color':'#ff0000', 'color':'#ffffff')
                                    else if data.status.disabled
                                        available = false
                                        replica.find(".salvus-project-replica-status").html('<b>NOT AVAILABLE</b>')
                                        replica.css('background-color':'#0000ff', 'color':'#ffffff')
                                    else
                                        available = true
                                        replica.find(".salvus-project-replica-timeago").attr('title', data.newest_snapshot+".000Z").timeago()
                                        stats = "#{data.status.ram_used_GB+data.status.ram_free_GB}GB RAM (#{data.status.ram_free_GB}GB free), #{data.status.load15} load, #{data.status.nprojects} running projects, #{data.status.nproc} cores"
                                        replica.find(".salvus-project-replica-status").text(stats)
                                else
                                    replica.find(".salvus-project-replica-timeago").text('...')
                                    replica.find(".salvus-project-replica-status").text('...')

                                if loc == status.current_location or not available
                                    replica.addClass("salvus-project-replica-current")
                                    replica.click () =>
                                        if loc == status.current_location
                                            m = "<h3>Move Project</h3><hr><br>Project is already on '#{loc}'."
                                        else
                                            m = "<h3>Move Project</h3><hr><br>The host '#{loc}' is not currently available."
                                        bootbox.alert(m)
                                        return false
                                else
                                    replica.addClass("salvus-project-replica-clickable")
                                    replica.click () =>
                                        @move_to_specific_target_dialog loc, (close) =>
                                            if close
                                                dialog.modal('hide').remove()
                                        return false
                                replicas.append(replica.show())

                        if status.current_location?
                            f(status.current_location)
                        for loc, data of status.locations
                            if loc != status.current_location and loc in status.canonical_locations
                                f(loc)

            refresh()
            dialog.find("a[href=#refresh-status]").click(()=>refresh();return false)

    move_to_specific_target_dialog: (target, cb) ->
        m = "<h3>Move Project</h3><hr><br>Are you sure you want to <b>move</b> your project to '#{target}'.  Your project will be opened on '#{target}' using the last available snapshot, so you may loose a few minutes of changes.  Your project will be unavailable for about a minute during the move."
        bootbox.confirm m, (result) =>
            if not result
                cb(false); return
            cb(true)
            @container.find(".project-location").text("moving to #{target}...")
            @container.find(".project-location-heading").icon_spin(start:true)
            alert_message(timeout:60, message:"Moving project '#{@project.title}': this takes a few minutes and changes you make during the move may be lost...")
            salvus_client.move_project
                project_id : @project.project_id
                target     : target
                cb         : (err, location) =>
                    @container.find(".project-location-heading").icon_spin(false)
                    if err
                        alert_message(timeout:60, type:"error", message:"Error moving project '#{@project.title}' to #{target} -- #{err}")
                    else
                        alert_message(timeout:60, type:"success", message:"Project '#{@project.title}' is now running on #{location.host}.")
                        @project.location = location
                        @set_location()
    ###

    init_add_collaborators: () =>
        input   = @container.find(".project-add-collaborator-input")
        select  = @container.find(".project-add-collaborator-select")
        collabs = @container.find(".project-collaborators")
        collabs_button = @container.find(".project-add-collaborator-button")
        collabs_search_loaded = @container.find(".project-collaborator-search-loaded")
        collabs_search_loading = @container.find(".project-collaborator-search-loading")
        collabs_loading = @container.find(".project-collaborators-loading")

        add_button = @container.find("a[href=#add-collaborator]").tooltip(delay:{ show: 500, hide: 100 })
        select.change () =>
            if select.find(":selected").length == 0
                add_button.addClass('disabled')
            else
                add_button.removeClass('disabled')

        remove_collaborator = (c) =>
            # c = {first_name:? , last_name:?, account_id:?}
            m = "Are you sure that you want to <b>remove</b> #{c.first_name} #{c.last_name} as a collaborator on '#{@project.title}'?"
            bootbox.confirm m, (result) =>
                if not result
                    return
                salvus_client.project_remove_collaborator
                    project_id : @project.project_id
                    account_id : c.account_id
                    cb         : (err, result) =>
                        if err
                            alert_message(type:"error", message:"Error removing collaborator #{c.first_name} #{c.last_name} -- #{err}")
                        else
                            alert_message(type:"success", message:"Successfully removed #{c.first_name} #{c.last_name} as a collaborator on '#{@project.title}'.")
                            update_collaborators()

        already_collab = {}
        # Update actual list of collabs on a project
        update_collaborators = () =>
            collabs_loading.show()
            salvus_client.project_users
                project_id : @project.project_id
                cb : (err, users) =>
                    collabs_loading.hide()
                    if err
                        # TODO: make nicer; maybe have a retry button...
                        collabs.html("(error loading collaborators)")
                        return
                    collabs.empty()
                    already_collab = {}

                    for mode in ['collaborator', 'viewer', 'owner', 'invited_collaborator', 'invited_viewer']
                        for x in users[mode]
                            already_collab[x.account_id] = true
                            c = template_project_collab.clone()
                            c.find(".project-collab-first-name").text(x.first_name)
                            c.find(".project-collab-last-name").text(x.last_name)
                            c.find(".project-collab-mode").text(mode)
                            if mode == 'owner'
                                c.find(".project-close-button").hide()
                                c.css('background-color', '#51a351')
                                c.tooltip(title:"Project owner (cannot be revoked)", delay: { show: 500, hide: 100 })
                            else
                                c.find(".project-close-button").data('collab', x).click () ->
                                    remove_collaborator($(@).data('collab'))
                                    return false

                                if x.account_id == salvus_client.account_id
                                    extra_tip = " (delete to remove your own access to this project)"
                                    c.css("background-color","#bd362f")
                                else
                                    extra_tip = ""


                                if mode == 'collaborator'
                                    c.tooltip(title:"Collaborator"+extra_tip, delay: { show: 500, hide: 100 })
                                else if mode == 'viewer'
                                    if extra_tip == ""
                                        c.css('background-color', '#f89406')
                                    c.tooltip(title:"Viewer"+extra_tip, delay: { show: 500, hide: 100 })
                            collabs.append(c)

        # Update the search list
        update_collab_list = () =>
            x = input.val()
            if x == ""
                select.html("").hide()
                @container.find("a[href=#invite-friend]").hide()
                @container.find(".project-add-noncloud-collaborator").hide()
                @container.find(".project-add-collaborator").hide()
                return
            @_last_query_id = if @_last_query_id? then @_last_query_id + 1 else 0
            collabs_search_loaded.hide()
            collabs_search_loading.show()
            salvus_client.user_search
                query    : x
                limit    : 30
                query_id : @_last_query_id
                cb       : (err, result, query_id) =>
                    # Ignore any query that is not the most recent
                    if query_id == @_last_query_id
                        collabs_search_loading.hide()
                        collabs_search_loaded.show()
                        select.html("")
                        result = (r for r in result when not already_collab[r.account_id]?)   # only include not-already-collabs
                        if result.length > 0
                            select.show()
                            select.attr(size:Math.min(10,result.length))
                            @container.find(".project-add-noncloud-collaborator").hide()
                            @container.find(".project-add-collaborator").show()
                            for r in result
                                name = r.first_name + ' ' + r.last_name
                                select.append($("<option>").attr(value:r.account_id, label:name).text(name))
                            select.show()
                            add_button.addClass('disabled')
                        else
                            select.hide()
                            @container.find(".project-add-collaborator").hide()
                            @container.find(".project-add-noncloud-collaborator").show()


        invite_selected = () =>
            for y in select.find(":selected")
                x = $(y)
                name = x.attr('label')
                salvus_client.project_invite_collaborator
                    project_id : @project.project_id
                    account_id : x.attr("value")
                    cb         : (err, result) =>
                        if err
                            alert_message(type:"error", message:"Error adding collaborator -- #{err}")
                        else
                            alert_message(type:"success", message:"Successfully added #{name} as a collaborator.")
                            update_collaborators()

        add_button.click () =>
            if add_button.hasClass('disabled')
                return false
            invite_selected()
            return false

        timer = undefined
        input.keyup (event) ->
            if event.keyCode == 13 # Enter key
                update_collab_list()
            return false

        collabs_button.click () ->
            update_collab_list()

        return update_collaborators

    init_linked_projects: () =>

        @linked_project_list = []
        element    = @container.find(".project-linked-projects-box")
        input      = element.find(".project-add-linked-project-input")
        select     = element.find(".project-add-linked-project-select")
        add_button = element.find("a[href=#add-linked-project]").tooltip(delay:{ show: 500, hide: 100 })
        linked     = element.find(".project-linked-projects")
        loading    = element.find(".project-linked-projects-loading")

        projects   = require('projects')

        select.change () =>
            if select.find(":selected").length == 0
                add_button.addClass('disabled')
            else
                add_button.removeClass('disabled')

        add_projects = (project_ids, cb) =>
            salvus_client.linked_projects
                project_id : @project.project_id
                add        : project_ids
                cb         : (err) =>
                    cb(err)


        remove_project = (project_id, cb) =>
            salvus_client.linked_projects
                project_id : @project.project_id
                remove     : project_id
                cb         : (err) =>
                    if err
                        alert_message(type:'error', message:'error deleted selected projects')
                        cb?()
                    else
                        update_linked_projects(cb)

        add_selected = (cb) =>
            add_projects ($(y).attr('value') for y in select.find(":selected")), (err) =>
                if err
                    alert_message(type:'error', message:'error adding selected projects')
                    cb?()
                else
                    update_linked_projects(cb)

        add_button.click () =>
            if add_button.hasClass('disabled')
                return false
            add_selected()
            return false

        # update list of currently linked projects
        update_linked_projects = (cb) =>
            loading.show()
            salvus_client.linked_projects
                project_id : @project.project_id
                cb         : (err, x) =>
                    loading.hide()
                    if err
                        cb?(err); return

                    @linked_project_list = x
                    update_linked_projects_search_list()
                    result = projects.matching_projects(@linked_project_list)

                    linked.empty()
                    for project in result.projects
                        c = template_project_linked.clone()
                        c.find(".project-linked-title").text(project.title)
                        if project.description != "No description"
                            c.find(".project-linked-description").text(project.description)
                        project_id = project.project_id
                        c.find(".project-close-button").data('project_id', project_id).click () ->
                            remove_project($(@).data('project_id'))
                            update_linked_projects()
                            return false
                        c.find("a").data('project_id', project_id).click () ->
                            projects.open_project($(@).data('project_id'))
                            return false
                        linked.append(c)
                    cb?()

        # display result of searching for linked projects
        update_linked_projects_search_list = () =>
            x = input.val()

            if x == ""
                select.html("").hide()
                element.find(".project-add-linked-project").hide()
                element.find(".project-add-linked-projects-desc").hide()
                return

            x = projects.matching_projects(x)
            if @linked_project_list?
                result = (project for project in x.projects when @linked_project_list.indexOf(project.project_id) == -1)
            else
                result = x.projects
            element.find(".project-add-linked-projects-desc").text(x.desc)

            if result.length > 0
                select.html("")
                add_button.addClass('disabled')
                select.show()
                select.attr(size:Math.min(10,result.length))
                element.find(".project-add-linked-project").show()
                for r in result
                    x = r.title
                    if $.trim(r.description) not in ['', 'No description']
                        x += '; ' + r.description
                    select.append($("<option>").attr(value:r.project_id, label:x).text(x))
                select.show()
                add_button.addClass('disabled')
            else
                select.hide()


        timer = undefined
        input.keyup (event) ->
            if timer?
                clearTimeout(timer)
            timer = setTimeout(update_linked_projects_search_list, 100)
            return false

        return update_linked_projects

    init_worksheet_server_restart: () =>
        # Restart worksheet server
        link = @container.find("a[href=#restart-worksheet-server]").tooltip(delay:{ show: 500, hide: 100 })
        link.click () =>
            link.find("i").addClass('fa-spin')
            #link.icon_spin(start:true)
            salvus_client.exec
                project_id : @project.project_id
                command    : "sage_server stop; sage_server start"
                timeout    : 30
                cb         : (err, output) =>
                    link.find("i").removeClass('fa-spin')
                    #link.icon_spin(false)
                    if err
                        alert_message
                            type    : "error"
                            message : "Error trying to restart worksheet server.  Try restarting the project server instead."
                    else
                        alert_message
                            type    : "info"
                            message : "Worksheet server restarted.  Restarted worksheets will use a new Sage session."
                            timeout : 4
            return false

    init_project_restart: () =>
        # Restart local project server
        link = @container.find("a[href=#restart-project]").tooltip(delay:{ show: 500, hide: 100 })
        link.click () =>
            async.series([
                (cb) =>
                    m = "<h2><i class='fa fa-refresh'> </i> Restart Project Server</h2><hr><br>Are you sure you want to restart the project server?  Everything you have running in this project (terminal sessions, Sage worksheets, and anything else) will be killed."
                    bootbox.confirm m, (result) =>
                        if result
                            cb()
                        else
                            cb(true)
                (cb) =>
                    link.find("i").addClass('fa-spin')
                    #link.icon_spin(start:true)
                    salvus_client.restart_project_server
                        project_id : @project.project_id
                        cb         : cb
                    # temporarily be more aggressive about getting status
                    for n in [1,2,5,8,10,15,18,20]
                        setTimeout(@update_local_status_link, n*1000)
                (cb) =>
                    link.find("i").removeClass('fa-spin')
                    #link.icon_spin(false)
                    #alert_message
                    #    type    : "success"
                    #    message : "Successfully restarted project server!  Your terminal and worksheet processes have been reset."
                    #    timeout : 5
            ])
            return false

    init_ssh: () =>
        @container.find("a[href=#ssh]").click () =>
            async.series([
                (cb) =>
                    @ensure_directory_exists
                        path : '.ssh'
                        cb   : cb
                (cb) =>
                    @open_file
                        path       : '.ssh/authorized_keys'
                        foreground : true
                    cb()
            ])
            return false

    # Completely move the project, possibly moving it if it is on a broken host.
    ###
    init_project_move: () =>
        # Close local project
        link = @container.find("a[href=#move-project]").tooltip(delay:{ show: 500, hide: 100 })
        link.click () =>
            async.series([
                (cb) =>
                    m = "Are you sure you want to <b>MOVE</b> the project?  Everything you have running in this project (terminal sessions, Sage worksheets, and anything else) will be killed and the project will be opened on another server using the most recent snapshot.  This could take about a minute."
                    bootbox.confirm m, (result) =>
                        if result
                            cb()
                        else
                            cb(true)
                (cb) =>
                    link.find("i").addClass('fa-spin')
                    alert_message
                        type    : "info"
                        message : "Moving project..."
                        timeout : 15
                    salvus_client.move_project
                        project_id : @project.project_id
                        cb         : cb
                (cb) =>
                    link.find("i").removeClass('fa-spin')
                    #link.icon_spin(false)
                    alert_message
                        type    : "success"
                        message : "Successfully moved project."
                        timeout : 5
            ])
            return false
    ###

    init_snapshot_link: () =>
        @container.find("a[href=#snapshot]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            @visit_snapshot()
            return false

    update_local_status_link: () =>
        if @_update_local_status_link_lock
            return
        @_update_local_status_link_lock = true
        timer = setTimeout((()=>delete @_update_local_status_link_lock), 30000)  # ensure don't lock forever
        salvus_client.project_get_local_state
            project_id : @project.project_id
            cb         : (err, state) =>
                delete @_update_local_status_link_lock
                clearTimeout(timer)
                if not err
                    if state.state?
                        e = @container.find(".salvus-project-status-indicator")
                        upper_state = state.state[0].toUpperCase() + state.state.slice(1)
                        e.text(upper_state)
                        @editor.resize_open_file_tabs()
                        if state.state in ['starting', 'stopping', 'saving', 'restarting']  # intermediate states -- update more often
                            setTimeout(@update_local_status_link, 3000)
                            @container.find("a[href=#restart-project]").addClass("disabled")
                        else
                            @container.find("a[href=#restart-project]").removeClass("disabled")

    init_local_status_link: () =>
        @update_local_status_link()
        #@container.find(".salvus-project-status-indicator-button").click () =>
        #    @display_tab("project-settings")
        #    return false

    # browse to the snapshot viewer.
    visit_snapshot: () =>
        @current_path = ['.snapshots', 'master']
        @display_tab("project-file-listing")
        @update_file_list_tab()

    init_trash_link: () =>
        @container.find("a[href=#trash]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            @visit_trash()
            return false

        @container.find("a[href=#empty-trash]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            bootbox.confirm "<h1><i class='fa fa-trash-o pull-right'></i></h1> <h4>Permanently erase the items in the Trash?</h4><br> <span class='lighten'>Old versions of files, including the trash, are stored as snapshots.</span>  ", (result) =>
                if result == true
                    salvus_client.exec
                        project_id : @project.project_id
                        command    : "rm"
                        timeout    : 60
                        args       : ['-rf', '.trash']
                        cb         : (err, result) =>
                            if err
                                alert_message(type:"error", message:"Network error while trying to delete the trash -- #{err}")
                            else if result.event == 'error'
                                alert_message(type:"error", message:"Error deleting the trash -- #{result.error}")
                            else
                                alert_message(type:"success", message:"Successfully deleted the contents of your trash.")
                                @visit_trash()
            return false

    #***************************************
    # public paths
    #***************************************
    publish_path: (opts) =>
        opts = defaults opts,
            path        : required
            description : undefined  # if undefined, user will be interactively queried
            cb          : undefined

        salvus_client.publish_path
            project_id  : @project.project_id
            path        : opts.path
            description : opts.description
            cb          : (err) =>
                delete @_public_paths_cache
                @invalidate_render_file_listing_cache()
                opts.cb?(err)

    unpublish_path: (opts)=>
        opts = defaults opts,
            path : required
            cb   : undefined
        salvus_client.unpublish_path
            project_id : @project.project_id
            path       : opts.path
            cb         : (err) =>
                delete @_public_paths_cache
                @invalidate_render_file_listing_cache()
                opts.cb?(err)

    is_path_published: (opts)=>
        opts = defaults opts,
            path : required
            cb   : required     # cb(err, undefined or {public_path:..., path:path, description:description})
        @paths_that_are_public
            paths : [opts.path]
            cb    : (err, v) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, v[0])

    # return public paths in this project; cached for a while
    _public_paths: (cb) =>    # cb(err, [{path:., description:.}])
        if @_public_paths_cache?
            cb(undefined, @_public_paths_cache)
        else
            salvus_client.get_public_paths
                project_id : @project.project_id
                cb         : (err, public_paths) =>
                    if err
                        cb(err)
                    else
                        @_public_paths_cache = public_paths
                        setTimeout((()=>delete @_public_paths_cache), PUBLIC_PATHS_CACHE_TIMEOUT_MS)
                        cb(undefined, public_paths)


    # given a list of paths, returns list of those that are public; more
    # precisely, returns list of {path:., description:.} of those that are
    # public.
    paths_that_are_public: (opts) =>
        opts = defaults opts,
            paths : required
            cb    : required     # cb(err, )
        @_public_paths (err, public_paths) =>
            if err
                opts.cb(err)
            else
                v = []
                for path in opts.paths
                    q = misc.path_is_in_public_paths(path, public_paths)
                    if q
                        v.push({path:path, description:q.description, public_path:q.path})
                opts.cb(undefined, v)


    #***************************************
    # end public paths
    #***************************************

    trash_file: (opts) =>
        opts = defaults opts,
            path : required
            cb   : undefined
        async.series([
            (cb) =>
                @ensure_directory_exists(path:'.trash', cb:cb)
            (cb) =>
                @move_file(src:opts.path, dest:'.trash', cb:cb, alert:false, mv_args:['--backup=numbered'])
        ], (err) =>
            opts.cb?(err)
            @update_file_list_tab(true)
        )

    # TODO: was used before; not used now, but might need it in case of problems... (?)
    download_file_using_database: (opts) =>
        opts = defaults opts,
            path    : required
            timeout : 45
            prefix  : undefined   # prefix = added to front of filename
            cb      : undefined   # cb(err) when file download from browser starts.
        salvus_client.read_file_from_project
            project_id : @project.project_id
            path       : opts.path
            timeout    : opts.timeout
            cb         : (err, result) =>
                if err
                    alert_message(type:"error", message:"#{err} -- #{misc.to_json(result)}")
                    opts.cb?(err)
                else if result.event == "error"
                    alert_message(type:"error", message:"File download prevented -- (#{result.error})")
                    opts.cb?(result.error)
                else
                    url = misc.encode_path(result.url) + "&download"
                    if opts.prefix?
                        i = url.lastIndexOf('/')
                        url = url.slice(0,i+1) + opts.prefix + url.slice(i+1)
                    iframe = $("<iframe>").addClass('hide').attr('src', url).appendTo($("body"))
                    setTimeout((() -> iframe.remove()), 30000)
                    opts.cb?()

    download_file: (opts) =>
        opts = defaults opts,
            path    : required
            auto    : true
            timeout : 45
            cb      : undefined   # cb(err) when file download from browser starts -- instant since we use raw path

        if misc.filename_extension(opts.path) == 'pdf'
            # unfortunately, download_file doesn't work for pdf these days...
            opts.auto = false

        url = "#{window.salvus_base_url}/#{@project.project_id}/raw/#{misc.encode_path(opts.path)}"
        if opts.auto
            download_file(url)
            bootbox.alert("<h3><i class='fa fa-cloud-download'> </i> Download File</h3><hr> If <b>#{opts.path}</b> isn't downloading try <a target='_blank' href='#{url}'>#{url}</a>.")
        else
            window.open(url)
            #bootbox.alert("<h3><i class='fa fa-cloud-download'> </i> Download File</h3> <hr><a target='_blank' href='#{url}'> Open #{opts.path} in another tab</a>.")

        opts.cb?()

    open_file_in_another_browser_tab: (path) =>
        salvus_client.read_file_from_project
            project_id : @project.project_id
            path       : path
            cb         : (err, result) =>
                window.open(misc.encode_path(result.url))

    open_file: (opts) =>
        opts = defaults opts,
            path       : required
            foreground : true      # display in foreground as soon as possible

        ext = filename_extension(opts.path)

        if @public_access and not public_access_supported(opts.path)
            @file_action_dialog
                fullname : opts.path
                isdir    : false
            return

        @editor.open opts.path, (err, opened_path) =>
            if err
                # ga('send', 'event', 'file', 'open', 'error', opts.path, {'nonInteraction': 1})
                alert_message(type:"error", message:"Error opening '#{opts.path}' -- #{misc.to_json(err)}", timeout:10)
            else
                # ga('send', 'event', 'file', 'open', 'success', opts.path, {'nonInteraction': 1})
                if opts.foreground
                    @display_tab("project-editor")

                # make tab for this file actually visible in the editor
                @editor.display_tab
                    path       : opened_path
                    foreground : opts.foreground


    init_add_collaborators_button: () =>
        @container.find("a[href=#projects-add-collaborators]").click () =>
            @show_add_collaborators_box()
            return false

    show_add_collaborators_box: () =>
        @display_tab('project-settings')
        @container.find(".project-add-collaborator-input").focus()
        collab = @container.find(".project-collaborators-box")
        collab.css(border:'2px solid red')
        setTimeout((()->collab.css(border:'')), 5000)
        collab.css('box-shadow':'8px 8px 4px #888')
        setTimeout((()->collab.css('box-shadow':'')), 5000)


project_pages = {}

# Function that returns the project page for the project with given id,
# or creates it if it doesn't exist.
project_page = exports.project_page = (project) ->
    p = project_pages[project.project_id]
    if p?
        return p
    p = new ProjectPage(project)
    project_pages[project.project_id] = p
    top_navbar.init_sortable_project_list()
    return p


# Apply various transformations to url's before downloading a file using the "+ New" from web thing:
# This is useful, since people often post a link to a page that *hosts* raw content, but isn't raw
# content, e.g., ipython nbviewer, trac patches, github source files (or repos?), etc.

URL_TRANSFORMS =
    'http://trac.sagemath.org/attachment/ticket/':'http://trac.sagemath.org/raw-attachment/ticket/'
    'http://nbviewer.ipython.org/urls/':'https://'


transform_get_url = (url) ->  # returns something like {command:'wget', args:['http://...']}
    if misc.startswith(url, "https://github.com/") and url.indexOf('/blob/') != -1
        url = url.replace("https://github.com", "https://raw.github.com").replace("/blob/","/")

    if misc.startswith(url, 'git@github.com:')
        command = 'git'  # kind of useless due to host keys...
        args = ['clone', url]
    else if url.slice(url.length-4) == ".git"
        command = 'git'
        args = ['clone', url]
    else
        # fall back
        for a,b of URL_TRANSFORMS
            url = url.replace(a,b)  # only replaces first instance, unlike python.  ok for us.
        command = 'wget'
        args = [url]

    return {command:command, args:args}