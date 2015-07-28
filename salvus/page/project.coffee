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

DROPBOX_ENABLED = false

underscore      = require('underscore')


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
loadDropbox     = require('dropbox').load


{flux}          = require('flux')

{filename_extension, defaults, required, to_json, from_json, trunc, keys, uuid} = misc
{file_associations, Editor, local_storage, public_access_supported} = require('editor')

{Tasks} = require('tasks')

{scroll_top, human_readable_size, download_file} = misc_page

templates = $("#salvus-project-templates")
template_project_file          = templates.find(".project-file-link")
template_home_icon             = templates.find(".project-home-icon")
template_segment_sep           = templates.find(".project-segment-sep")
template_project_collab        = templates.find(".project-collab")
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

        # react initialization
        flux = require('flux').flux
        @actions = require('project_store').getActions(@project.project_id, flux)
        @store = require('project_store').getStore(@project.project_id, flux)
        require('project_settings').create_page(@project.project_id, @container.find(".smc-react-project-settings")[0], flux)
        require('project_log').render_log(@project.project_id, @container.find(".smc-react-project-log")[0], flux)
        #require('project_miniterm').render_miniterm(@project.project_id, @container.find(".smc-react-project-miniterm")[0], flux)
        require('project_search').render_project_search(@project.project_id, @container.find(".smc-react-project-search")[0], flux)
        require('project_new').render_new(@project.project_id, @container.find(".smc-react-project-new")[0], flux)
        require('project_files').render_new(@project.project_id, @container.find(".smc-react-project-files")[0], flux)

        # ga('send', 'event', 'project', 'open', 'project_id', @project.project_id, {'nonInteraction': 1})

        if @public_access
            @container.find(".salvus-project-write-access").hide()
            @container.find(".salvus-project-public-access").show()
        else
            @container.find(".salvus-project-write-access").show()
            @container.find(".salvus-project-public-access").hide()

        @init_new_tab_in_navbar()

        @init_sort_files_icon()

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
            @init_trash_link()
            @init_snapshot_link()

        # Show a warning if using SMC in devel mode. (no longer supported)
        if window.salvus_base_url != ""
            # TODO -- should use a better way to decide dev mode.
            @container.find(".salvus-project-id-warning").show()

    activity_indicator: () =>
        top_navbar.activity_indicator(@project.project_id)

    init_current_path_info_button: () =>
        e = @container.find("a[href=#file-action-current-path]")
        e.click () =>
            @file_action_dialog
                fullname : @current_pathname()
                isdir    : true
                url      : document.URL

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
                    #console.log("change to ", segments.slice(1, segments.length-1))
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

    close: () =>
        top_navbar.remove_page(@project.project_id)

    # Reload the @project attribute from the database, and re-initialize
    # ui elements, mainly in settings.
    reload_settings: (cb) =>
        @project = flux.getStore('projects').get_project(@project.project_id)
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
                                    @actions.set_current_path(cwd.split('/'))
                                else
                                    @actions.set_current_path([])
                        else
                            # root of project
                            @actions.set_current_path([])

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

    hide_tabs: () =>
        @container.find(".project-pages").hide()
        @container.find(".file-pages").hide()

    show_tabs: () =>
        @container.find(".project-pages").show()
        @container.find(".file-pages").show()

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
            else if name == "project-editor"
                tab.onshow = () ->
                    that.editor.onshow()
                t.find("a").click () ->
                    that.editor.hide()
                    that.editor.show_recent()
                    return false
            else if name == "project-new-file" and not @public_access
                tab.onshow = () ->
                    that.editor?.hide_editor_content()
                    that.push_state('new/' + that.store.state.current_path.join('/'))
            else if name == "project-activity" and not @public_access
                tab.onshow = () =>
                    that.editor?.hide_editor_content()
                    that.push_state('log')
                    # HORRIBLE TEMPORARY HACK since focus isn't working with react... yet  (TODO)
                    @container.find(".project-activity").find("input").focus()

            else if name == "project-settings" and not @public_access
                tab.onshow = () ->
                    that.editor?.hide_editor_content()
                    that.push_state('settings')
                    that.update_topbar()
                    url = document.URL
                    i = url.lastIndexOf("/settings")
                    if i != -1
                        url = url.slice(0,i)
                    that.container.find(".salvus-settings-url").val(url)

            else if name == "project-search" and not @public_access
                tab.onshow = () ->
                    that.editor?.hide_editor_content()
                    that.push_state('search/' + that.store.state.current_path.join('/'))
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

        if name == 'project-new-file'
            @actions.setTo(default_filename:misc.to_iso(new Date()).replace('T','-').replace(/:/g,'') )


        if name == 'project-file-listing'
            #temporary
            sort_by_time = @store.state.sort_by_time ? true
            show_hidden = @store.state.show_hidden ? false
            @actions.set_directory_files(@store.state.current_path, sort_by_time, show_hidden)
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

    update_topbar: () ->
        if not @project?
            return

        label = $("<div>").html(@project.title).text()  # plain text for this...
        top_navbar.set_button_label(@project.project_id, label)
        misc_page.set_window_title(label)

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

    # Return the string representation of the current path, as a
    # relative path from the root of the project.
    current_pathname: () => @store.state.current_path.join('/')

    # Set the current path array from a path string to a directory
    set_current_path: (path) =>
        path = @_parse_path(path)
        if not underscore.isEqual(path, @store.state.current_path)
            require('flux').flux.getProjectActions(@project.project_id).set_current_path(path)

    _parse_path: (path) =>
        if not path?
            return []
        else if typeof(path) == "string"
            while path[path.length-1] == '/'
                path = path.slice(0,path.length-1)
            v = []
            for segment in path.split('/')
                if segment.length > 0
                    v.push(segment)
            return v
        else
            return path[..]  # copy the path


    # Render the slash-separated and clickable path that sits above
    # the list of files (or current file)
    update_current_path: () =>

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
        for segment in @store.state.current_path
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
                @set_current_path(path)
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

    default_filename: () =>
        return misc.to_iso(new Date()).replace('T','-').replace(/:/g,'')

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
        @set_current_path(new_path)
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
                        @actions.set_current_path(@store.state.current_path.slice(0, -1))
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

        path = @store.state.current_path.join('/')
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
                        alert_message(type:"error", message:"Problem reading file listing for '#{path}' -- #{misc.trunc(err,100)}; email help@sagemath.com (include the id #{@project.project_id}). If the system is heavily loaded enter your credit card under billing and request a $7/month membership to move your project(s) to a members-only server, or wait until the load is lower.", timeout:15)
                        @set_current_path([])
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

        if @store.state.current_path[0] == '.trash'
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

        if @store.state.current_path.length > 0
            # Create special link to the parent directory
            t = template_project_file.clone()
            t.addClass('project-directory-link')
            t.find("a[href=#file-action]").hide()
            parent = @store.state.current_path.slice(0, @store.state.current_path.length-1).join('/')
            t.data('name', parent)
            t.find(".project-file-name").html("Parent Directory")
            t.find(".project-file-icon").removeClass("fa-file").addClass('fa-reply')
            t.find("input").hide()  # hide checkbox, etc.
            # Clicking to open the directory
            t.click () =>
                @actions.set_current_path(@store.state.current_path.slice(0, -1))
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
                if path == ".snapshots" and obj.name.length == '2014-04-04-061502'.length
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
                                    @set_current_path(x.slice(0, x.length-1))
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
                    dest = "/projects/#{@project.project_id}/" + path.slice('.snapshots/2014-04-06-052506/'.length)
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
                    dest = path.slice('.snapshots/2014-04-06-052506/'.length)
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
                    dest = path.slice('.snapshots/2014-04-06-052506/'.length)
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
        if opts.mv_args?
            args = opts.mv_args
        else
            args = []
        args = args.concat(['--', opts.src, opts.dest])
        salvus_client.exec
            project_id : @project.project_id
            command    : 'mv'
            args       : args
            timeout    : 15  # move should be fast..., unless across file systems.
            network_timeout : 20
            err_on_exit : true    # this should fail if exit_code != 0
            path       : opts.path
            cb         : (err, output) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:"Error while moving '#{opts.src}' to '#{opts.dest}' -- #{err}")
                    else if output.event == 'error'
                        alert_message(type:"error", message:"Error moving '#{opts.src}' to '#{opts.dest}' -- #{output.error}")
                    #else if output.exit_code != 0
                    #    alert_message(type:"error", message:"Error moving '#{opts.src}' to '#{opts.dest}' -- exit_code: #{output.exit_code}")
                    else
                        alert_message(type:"info", message:"Moved '#{opts.src}' to '#{opts.dest}'")
                opts.cb?(err or output.event == 'error') # or output.exit_code != 0)

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
                    @set_current_path(['.trash'])
                    @update_file_list_tab()

    init_refresh_files: () =>
        @container.find("a[href=#refresh-listing]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
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

    project_activity: (mesg, delay) =>
        @actions.log(mesg)

    init_snapshot_link: () =>
        @container.find("a[href=#snapshot]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            @visit_snapshot()
            return false


    # browse to the snapshot viewer.
    visit_snapshot: () =>
        @set_current_path(['.snapshots'])
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
        # TODO: this code below broken by the react changes... but should be redone differently later anyways..
        return
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