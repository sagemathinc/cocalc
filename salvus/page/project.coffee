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
diffsync        = require('diffsync')
account         = require('account')
{filename_extension, defaults, required, to_json, from_json, trunc, keys, uuid} = misc
{file_associations, Editor, local_storage} = require('editor')

{Tasks} = require('tasks')

{scroll_top, human_readable_size, download_file} = require('misc_page')

templates = $("#salvus-project-templates")
template_project_file          = templates.find(".project-file-link")
template_home_icon             = templates.find(".project-home-icon")
template_segment_sep           = templates.find(".project-segment-sep")
template_project_commits       = templates.find(".project-commits")
template_project_commit_single = templates.find(".project-commit-single")
template_project_branch_single = templates.find(".project-branch-single")
template_project_collab        = templates.find(".project-collab")
template_project_linked        = templates.find(".project-linked")


exports.masked_file_exts = masked_file_exts =
    'pyc'           : 'py'
    'class'         : 'java'
    'exe'           : 'cs'

for ext in misc.split('blg bbl glo idx toc aux log lof ind nav snm gz xyc out ilg')  # gz really synctex.gz
    masked_file_exts[ext] = 'tex'

#many languages such as fortran or c++ have a default file name of "a.out." when compiled, so .out extensions are not masked

# If there are more
MAX_FILE_LISTING_SIZE = 300

# timeout in seconds when downloading files etc., from web in +New dialog.
FROM_WEB_TIMEOUT_S = 45


##################################################
# Initialize the modal project management dialogs
##################################################
delete_path_dialog = $("#project-delete-path-dialog")
move_path_dialog   = $("#project-move-path-dialog")

class Dialog
    constructor: (opts) ->
        opts = defaults opts,
            dialog      : required
            submit      : required
            before_show : undefined
            after_show  : undefined

        @opts = opts

        submit = () =>
            try
                opts.dialog.modal('hide')
                opts.submit(opts.dialog, @project)
            catch e
                console.log("Exception submitting modal: ", e)
            return false

        opts.dialog.submit submit
        opts.dialog.find("form").submit submit
        opts.dialog.find(".btn-submit").click submit
        opts.dialog.find(".btn-close").click(() -> opts.dialog.modal('hide'); return false)

    show: (project) =>
        @project = project
        @opts.before_show(@opts.dialog, project)
        @opts.dialog.modal()
        @opts.after_show(@opts.dialog, project)
        return false

delete_path_dialog = new Dialog
    dialog      : $("#project-delete-path-dialog")
    submit      : (dialog, project) ->
        path = project.current_path.join('/')
        commit_mesg = dialog.find("input[type=text]").val()
        if commit_mesg == ""
            commit_mesg = "deleted #{path}"
        project.path_action
            action      : 'delete'
            branch      : project.meta.display_branch
            path        : path
            commit_mesg : commit_mesg

    before_show : (dialog, project) ->
        dialog.find(".project-delete-path-dialog-filename").text(project.current_pathname())
        dialog.find("input[type=text]").val("")
    after_show  : (dialog) ->
        dialog.find("input[type=text]").focus()

move_path_dialog = new Dialog
    dialog      : $("#project-move-path-dialog")
    submit      : (dialog, project) ->
        src      = project.current_pathname()
        dest     = dialog.find("input[name=new-filename]").val()
        if src == dest
            # nothing to do
            return
        why      = dialog.find("input[name=why]").val()
        if why == ""
            why = "move #{src} to #{dest}"
        project.path_action
            action      : 'move'
            branch      : project.meta.display_branch
            path        : src
            commit_mesg : why
            extra_options : {dest:dest}
    before_show : (dialog, project) ->
        dialog.find(".project-move-path-dialog-filename").text(project.current_pathname())
        dialog.find("input[name=new-filename]").val(project.current_pathname())
        dialog.find("input[name=why]").val("")
    after_show  : (dialog) ->
        dialog.find("input[name=new-filename]").focus()



##################################################
# Define the project page class
##################################################

class ProjectPage
    constructor: (@project) ->
        @container = templates.find(".salvus-project").clone()
        @container.data('project', @)
        $("body").append(@container)
        # ga('send', 'event', 'project', 'open', 'project_id', @project.project_id, {'nonInteraction': 1})

        # Create a new tab in the top navbar (using top_navbar as a jquery plugin)
        @container.top_navbar
            id    : @project.project_id
            label : @project.project_id
            icon  : 'fa-edit'
            onclose : () =>
                @editor?.close_all_open_files()
                @save_browser_local_data()
                delete project_pages[@project.project_id]
                @project_log?.disconnect_from_session()
                clearInterval(@_update_last_snapshot_time)
            onshow: () =>
                if @project?
                    document.title = "Project - #{@project.title}"
                    @push_state()
                @editor?.refresh()


            onfullscreen: (entering) =>
                if @project?
                    if entering
                        @hide_tabs()
                    else
                        @show_tabs()
                    $(window).resize()

        $(window).resize () => @window_resize()
        @_update_file_listing_size()

        @init_sort_files_icon()

        # Initialize the search form.
        @init_search_form()

        # Initialize new worksheet/xterm/etc. console buttons

        # current_path is a possibly empty list of directories, where
        # each one is contained in the one before it.
        @current_path = []

        @init_tabs()
        @update_topbar()
        @init_admin()

        @create_editor()

        @init_file_search()

        @init_new_file_tab()

        @init_refresh_files()
        @init_hidden_files_icon()
        @init_trash_link()
        @init_snapshot_link()
        @init_local_status_link()

        @init_project_activity()  # must be after @create_editor()

        @init_project_download()

        @init_project_restart()

        @init_ssh()
        @init_worksheet_server_restart()

        @init_listing_show_all()

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

        # Set the project id
        @container.find(".project-id").text(@project.project_id)
        if window.salvus_base_url != "" # TODO -- should use a better way to decide dev mode.
            @container.find(".salvus-project-id-warning").show()

        @set_location()

        if @project.size? and @project.size
            @container.find(".project-size").text(human_readable_size(@project.size))
        else
            @container.find(".project-size-label").hide()

        # Make it so editing the title and description of the project
        # sends a message to the hub.
        that = @
        @container.find(".project-project_title").blur () ->
            new_title = $(@).text()
            if new_title != that.project.title
                salvus_client.update_project_data
                    project_id : that.project.project_id
                    data       : {title:new_title}
                    cb         : (err, mesg) ->
                        if err
                            $(@).text(that.project.title)  # change it back
                            alert_message(type:'error', message:"Error contacting server to save modified project title.")
                        else if mesg.event == "error"
                            $(@).text(that.project.title)  # change it back
                            alert_message(type:'error', message:mesg.error)
                        else
                            that.project.title = new_title
                            # Also, change the top_navbar header.
                            that.update_topbar()

        @container.find(".project-project_description").blur () ->
            new_desc = $(@).text()
            if new_desc != that.project.description
                salvus_client.update_project_data
                    project_id : that.project.project_id
                    data       : {description:new_desc}
                    cb         : (err, mesg) ->
                        if err
                            $(@).text(that.project.description)   # change it back
                            alert_message(type:'error', message:err)
                        else if mesg.event == "error"
                            $(@).text(that.project.description)   # change it back
                            alert_message(type:'error', message:mesg.error)
                        else
                            that.project.description = new_desc

        # Activate the command line
        cmdline = @container.find(".project-command-line-input").tooltip(delay:{ show: 500, hide: 100 })
        cmdline.keydown (evt) =>
            if evt.which == 13 # enter
                try
                    that.command_line_exec()
                catch e
                    console.log(e)
                return false
            if evt.which == 27 # escape
                @container?.find(".project-command-line-output").hide()
                return false

        # TODO: this will be for command line tab completion
        #cmdline.keydown (evt) =>
        #    if evt.which == 9
        #        @command_line_tab_complete()
        #        return false


        # Make it so typing something into the "create a new branch..." box
        # makes a new branch.
        #@container.find(".project-branches").find('form').submit () ->
        #    that.branch_op(branch:$(@).find("input").val(), op:'create')
        #    return false

        file_tools = @container.find(".project-file-tools")

        file_tools.find("a[href=#delete]").click () ->
            if not $(@).hasClass("disabled")
                delete_path_dialog.show(that)
            return false

        file_tools.find("a[href=#move]").click () ->
            if not $(@).hasClass("disabled")
                move_path_dialog.show(that)
            return false

        @init_file_sessions()

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
        #console.log("push_state: ", url)
        if not url?
            url = @_last_history_state
        if not url?
            url = ''
        @_last_history_state = url
        #if @project.name? and @project.owner?
            #window.history.pushState("", "", window.salvus_base_url + '/projects/' + @project.ownername + '/' + @project.name + '/' + url)
        # For now, we are just going to default to project-id based URL's, since they are stable and will always be supported.
        # I can extend to the above later in another release, without any harm.
        window.history.pushState("", "", window.salvus_base_url + '/projects/' + @project.project_id + '/' + url)
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
        switch segments[0]
            when 'files'
                if target[target.length-1] == '/'
                    # open a directory
                    @display_tab("project-file-listing")
                    @current_path = target.slice(0,target.length-1).split('/').slice(1)
                    @update_file_list_tab()
                else
                    # open a file
                    @display_tab("project-editor")
                    @open_file(path:segments.slice(1).join('/'), foreground:foreground)
                    @current_path = segments.slice(1, segments.length-1)
            when 'new'
                @current_path = segments.slice(1)
                @display_tab("project-new-file")
            when 'log'
                @display_tab("project-activity")
            when 'settings'
                @display_tab("project-settings")
            when 'search'
                @current_path = segments.slice(1)
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

    init_file_sessions: (sessions, cb) =>
        for filename, data of local_storage(@project.project_id)
            if data.auto_open
                tab = @editor.create_tab(filename : filename)
        cb?()
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
            if (event.metaKey or event.ctrlKey) and event.keyCode == 79
                @display_tab("project-new-file")
                return false
            @update_file_search(event)
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
                    console.log(e)
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
        elt = @container.find(".project-command-line")
        input = elt.find("input")
        command0 = input.val()
        command = command0 + "\necho $HOME `pwd`"
        input.val("")
        @container?.find(".project-command-line-output").show()
        t = setTimeout((() => @container.find(".project-command-line-spinner").show().spin()), 300)
        salvus_client.exec
            project_id : @project.project_id
            command    : command
            timeout    : 15
            max_output : 100000
            bash       : true
            path       : @current_pathname()
            cb         : (err, output) =>
                clearTimeout(t)
                @container.find(".project-command-line-spinner").spin(false).hide()
                if err
                    alert_message(type:'error', message:"#{command0} -- #{err}")
                else
                    # All this code below is to find the current path
                    # after the command is executed, and also strip
                    # the output of "pwd" from the output:
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
                    if stdout
                        elt.find(".project-command-line-stdout").text(stdout).show()
                    else
                        elt.find(".project-command-line-stdout").hide()
                    if stderr
                        elt.find(".project-command-line-stderr").text(stderr).show()
                    else
                        elt.find(".project-command-line-stderr").hide()
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

            that.update_file_list_tab()

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
            else if name == "project-new-file"
                tab.onshow = () ->
                    that.editor?.hide_editor_content()
                    that.push_state('new/' + that.current_path.join('/'))
                    that.show_new_file_tab()
            else if name == "project-activity"
                tab.onshow = () =>
                    that.editor?.hide_editor_content()
                    that.push_state('log')
                    @render_project_activity_log()
                    if not IS_MOBILE
                        @container.find(".salvus-project-activity-search").focus()

            else if name == "project-settings"
                tab.onshow = () ->
                    that.editor?.hide_editor_content()
                    that.push_state('settings')
                    that.update_topbar()
                    #that.update_linked_projects()
                    that.update_collaborators()

            else if name == "project-search"
                tab.onshow = () ->
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

            that.update_file_list_tab()
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

        if @project.public
            @container.find(".project-public").show()
            @container.find(".project-private").hide()
            @container.find(".project-heading-well").removeClass("private-project").addClass("public-project")
            @container.find(".project-settings-make-public").hide()
            @container.find(".project-settings-make-private").show()
        else
            @container.find(".project-public").hide()
            @container.find(".project-private").show()
            @container.find(".project-heading-well").addClass("private-project").removeClass("public-project")
            @container.find(".project-settings-make-public").show()
            @container.find(".project-settings-make-private").hide()

        @container.find(".project-project_title").text(@project.title)
        @container.find(".project-project_description").text(@project.description)

        if not @project.title? # make sure that things work even if @project is invalid.
            @project.title = ""
            alert_message(type:"error", message:"Project #{@project.project_id} is corrupt. Please report.")
        label = @project.title
        top_navbar.set_button_label(@project.project_id, label)
        document.title = "Sagemath: #{@project.title}"

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
                            @container.find(".project-settings-ssh").removeClass('lighten')
                            username = @project.project_id.replace(/-/g, '')
                            v = status.ssh.split(':')
                            if v.length > 1
                                port = " -p #{v[1]} "
                            else
                                port = " "
                            address = v[0]

                            @container.find(".salvus-project-ssh").text("ssh#{port}#{username}@#{address}")
                        else
                            @container.find(".project-settings-ssh").addClass('lighten')

                    usage.show()

            @update_local_status_link()
        return @


    init_admin: () ->
        usage = @container.find(".project-disk_usage")

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
                        usage.find(".salvus-" + a).attr("contenteditable", true).css('-webkit-appearance': 'textfield', '-moz-appearance': 'textfield')
                    @container.find(".project-quota-edit").html('<i class="fa fa-thumbs-up"> </i> Done')
                    usage.find(".project-settings-network-access-checkbox").show()
                    usage.find(".project-settings-unlimited-timeout").show()

    # Return the string representation of the current path, as a
    # relative path from the root of the project.
    current_pathname: () => @current_path.join('/')

    # Set the current path array from a path string to a directory
    set_current_path: (path) =>
        if path == "" or not path?
            @current_path = []
        else
            if path.length > 0 and path[path.length-1] == '/'
                path = path.slice(0,path.length-1)
            @current_path = path.split('/')
        @container.find(".project-file-top-current-path-display").text(path)

    # Render the slash-separated and clickable path that sits above
    # the list of files (or current file)
    update_current_path: () =>
        @container.find(".project-file-top-current-path-display").text(@current_pathname())

        t = @container.find(".project-file-listing-current_path")
        t.empty()
        #if @current_path.length == 0
        #    return

        t.append($("<a class=project-file-listing-path-segment-link>").html(template_home_icon.clone().click(() =>
            @current_path=[]; @update_file_list_tab())))

        new_current_path = []
        that = @
        for segment in @current_path
            new_current_path.push(segment)
            t.append(template_segment_sep.clone())
            t.append($("<a class=project-file-listing-path-segment-link>"
            ).text(segment
            ).data("current_path",new_current_path[..]  # [..] means "make a copy"
            ).click((elt) =>
                @current_path = $(elt.target).data("current_path")
                @update_file_list_tab()
            ))


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
        dest_dir = encodeURIComponent(@new_file_tab.find(".project-new-file-path").text())
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

        BANNED_FILE_TYPES = ['doc', 'docx', 'pdf', 'sws']

        create_file = (ext) =>
            p = path(ext)
            ext = misc.filename_extension(p)

            if ext == 'term'
                create_terminal()
                return false

            if ext in BANNED_FILE_TYPES
                alert_message(type:"error", message:"Creation of #{ext} files not supported.", timeout:3)
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
                        for segment in @new_file_tab_input.val().split('/')
                            if segment.length > 0
                                @current_path.push(segment)
                        @display_tab("project-file-listing")
            return false

        click_new_file_button = () =>
            target = @new_file_tab_input.val()
            if target.indexOf("://") != -1 or misc.startswith(target, "git@github.com:")
                download_button.icon_spin(start:true, delay:500)
                new_file_from_web target, () =>
                    download_button.icon_spin(false)

            else
                create_file()
            return false

        @new_file_tab.find("a[href=#new-file]").click(click_new_file_button)

        download_button = @new_file_tab.find("a[href=#new-download]").click(click_new_file_button)

        @new_file_tab.find("a[href=#new-folder]").click(create_folder)
        @new_file_tab_input.keyup (event) =>
            if event.keyCode == 13
                click_new_file_button()
                return false
            if (event.metaKey or event.ctrlKey) and event.keyCode == 79     # control-o
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

    show_new_file_tab: () =>
        # Update the path
        path = @current_pathname()
        if path != ""
            path += "/"
        @new_file_tab.find(".project-new-file-path").text(path)
        @init_dropzone_upload()

        elt = @new_file_tab.find(".project-new-file-if-root")
        if path != ''
            elt.hide()
        else
            elt.show()

        # Clear the filename and focus on it
        now = misc.to_iso(new Date()).replace('T','-').replace(/:/g,'')
        @new_file_tab_input.val(now)
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

    file_action_dialog: (obj) =>
        dialog = $(".salvus-file-action-dialog").clone()
        rename = () =>
            new_name = name.text()
            if new_name != obj.name
                dialog.modal('hide')
                path = misc.path_split(obj.fullname).head
                @rename_file path, obj.name, new_name, (err) =>
                    if err
                        alert_message(type:"error", message:err)
                    else
                        obj.name = new_name
                        if path != ""
                            obj.fullname = path + "/" + new_name
                        else
                            obj.fullname = new_name
                        @update_file_list_tab(true)

        name = dialog.find(".salvus-file-filename").text(obj.name).blur(rename).keydown (evt) =>
            if evt.which == 13
                rename(); return false
            else if evt.which == 27
                name.text(obj.name).blur(); return false

        dialog.find(".btn-close").click () =>
            dialog.modal('hide')
            return false

        dialog.find("a[href=#copy-file]").click () =>
            dialog.modal('hide')
            @copy_file_dialog(obj.fullname, obj.isdir)
            return false

        dialog.find("a[href=#copy-to-another-project]").click () =>
            dialog.modal('hide')
            @copy_to_another_project_dialog(obj.fullname, obj.isdir)
            return false

        dialog.find("a[href=#move-file]").click () =>
            dialog.modal('hide')
            @move_file_dialog(obj.fullname)
            return false

        if obj.isdir
            # until we implement an archive process
            dialog.find("a[href=#download-file]").hide()
        else
            dialog.find("a[href=#download-file]").click () =>
                dialog.modal('hide')
                @download_file
                    path : obj.fullname
                return false
        dialog.find("a[href=#delete-file]").click () =>
            dialog.modal('hide')
            @trash_file
                path : obj.fullname
            return false
        dialog.modal()

    # Update the listing of files in the current_path, or display of the current file.
    update_file_list_tab: (no_focus) =>
        if @_updating_file_list_tab_LOCK
            return # already updating it
        @_updating_file_list_tab_LOCK = true
        @_update_file_list_tab no_focus, () =>
            @_show_all_files = false
            setTimeout( (() => @_updating_file_list_tab_LOCK = false), 500 )

    init_listing_show_all: () =>
        @container.find(".project-file-listing-show_all").click () =>
            @_show_all_files = true
            @update_file_list_tab()
            return false

    _update_file_list_tab: (no_focus, cb) =>

        spinner = @container.find(".project-file-listing-spinner")
        timer = setTimeout( (() -> spinner.show().spin()), 1000 )

        # TODO: ** must change this -- do *not* set @current_path until we get back the correct listing!!!!

        path = @current_path.join('/')

        url_path = path
        if url_path.length > 0 and url_path[path.length-1] != '/'
            url_path += '/'
        @push_state('files/' + url_path)

        that = @
        click_file = (e) ->
            obj = $(e.delegateTarget).closest(".project-path-link").data('obj')
            target = $(e.target)
            if target.hasClass("salvus-file-action") or target.parent().hasClass('salvus-file-action')
                that.file_action_dialog(obj)
            else
                if obj.isdir
                    that.set_current_path(obj.fullname)
                    that.update_file_list_tab()
                else
                    that.open_file
                        path       : obj.fullname
                        foreground : not(e.which==2 or (e.ctrlKey or e.metaKey))
            e.preventDefault()

        @update_snapshot_link()

        tm = misc.walltime()
        #console.log("calling project_directory_listing with path=#{path}")
        salvus_client.project_directory_listing
            project_id : @project.project_id
            path       : path
            time       : @_sort_by_time
            hidden     : @container.find("a[href=#hide-hidden]").is(":visible")
            cb         : (err, listing) =>
                #console.log("got back listing=",listing)
                clearTimeout(timer)
                spinner.spin(false).hide()

                tm = misc.walltime()

                @set_current_path(path)

                # Update the display of the path above the listing or file preview
                @update_current_path()

                if err
                    #console.log("update_file_list_tab: error -- ", err)
                    if @_last_path_without_error? and @_last_path_without_error != path
                        @set_current_path(@_last_path_without_error)
                        @_last_path_without_error = undefined # avoid any chance of infinite loop
                        @update_file_list_tab(no_focus)
                    else
                        @set_current_path('')
                        @_last_path_without_error = undefined # avoid any chance of infinite loop
                        @update_file_list_tab(no_focus)
                    cb?()
                    return

                # remember for later
                @_last_path_without_error = path

                if not listing?
                    cb?()
                    return

                # If the files haven't changed -- a VERY common case -- don't rebuild the whole listing.
                files = misc.to_json(listing)  # use json to deep compare -- e.g., file size matters!
                if @_update_file_list_tab_last_path == path and @_update_file_list_tab_last_path_files == files and @_update_file_sort_by_time == @_sort_by_time and @_last_show_all_files == @_show_all_files
                    cb?()
                    return
                else
                    @_update_file_list_tab_last_path = path
                    @_update_file_list_tab_last_path_files = files
                    @_update_file_sort_by_time = @_sort_by_time
                    @_last_show_all_files = @_show_all_files

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

                # The path we are viewing.
                path = @current_pathname()

                @container.find(".project-file-tools a").removeClass("disabled")

                # Show the command prompt
                # @container.find("span.project-command-line").show().find("pre").hide()

                # Hide the edit button
                @container.find(".project-file-tools a[href=#edit]").addClass("disabled")

                # Hide the move and delete buttons if and only if this is the top level path
                if path == ""
                    @container.find(".project-file-tools a[href=#move]").addClass("disabled")
                    @container.find(".project-file-tools a[href=#delete]").addClass("disabled")

                that = @

                # TODO: not used
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

                if that.current_path.length > 0
                    # Create special link to the parent directory
                    t = template_project_file.clone()
                    t.find("a[href=#file-action]").hide()
                    parent = that.current_path.slice(0, that.current_path.length-1).join('/')
                    if parent == ""
                        parent = "."
                    t.data('name', parent)
                    t.find(".project-file-name").html("Parent Directory")
                    t.find(".project-file-icon").removeClass("fa-file").addClass('fa-reply')
                    t.find("input").hide()  # hide checkbox, etc.
                    # Clicking to open the directory
                    t.click () ->
                        that.current_path.pop()
                        that.update_file_list_tab()
                        return false
                    t.droppable(drop:file_dropped_on_directory, scope:'files')
                    t.find("a").tooltip
                        trigger : 'hover'
                        delay   : { show: 500, hide: 100 }
                    t.find(".fa-arrows").tooltip
                        trigger : 'hover'
                        delay   : { show: 500, hide: 100 }

                    file_or_listing.append(t)



                #console.log("done updating misc stuff", misc.walltime(tm))

                # Show the files
                #console.log("building listing for #{path}...")

                tm = misc.walltime()

                masked_file_exts_bad  = (key for key of masked_file_exts)
                masked_file_exts_good = (value for key, value of masked_file_exts)
                masked_file_bad_index = []
                masked_file_good_name = []
                n = 0
                that.container.find(".project-file-listing-show_all").hide().find('span').text('')
                search = that._file_search_box.val()
                for obj, i in listing.files
                    if not search and (not that._show_all_files and n >= MAX_FILE_LISTING_SIZE)
                        that.container.find(".project-file-listing-show_all").show().find('span').text(listing.files.length - n)
                        break
                    n += 1
                    t = template_project_file.clone()
                    t.data(obj:obj)
                    if obj.isdir
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
                        t.find(".project-file-icon").removeClass("fa-file").addClass("fa-folder-open-o").css('font-size':'21pt')
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
                    directory_is_empty = false
                    # Add our new listing entry to the list:
                    file_or_listing.append(t)
                    t.click(click_file)

                    continue

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

                #@clear_file_search()
                #console.log("done building listing in #{misc.walltime(tm)}")
                tm = misc.walltime()
                @update_file_search()
                #console.log("done building file search #{misc.walltime(tm)}")
                tm = misc.walltime()

                # No files
                if directory_is_empty and path != ".trash" and path.slice(0,10) != ".snapshots"
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

    copy_to_another_project_dialog: (path, isdir) =>
        dialog = $(".salvus-project-copy-to-another-project-dialog").clone()
        dialog.modal()

        src_path          = undefined
        target_project_id = undefined
        target_project    = undefined
        target_path       = undefined
        overwrite_newer   = undefined
        delete_missing    = undefined
        async.series([
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
                selector = dialog.find(".salvus-project-target-project-id")
                v = ({project_id:x.project_id, title:x.title.slice(0,80)} for x in require('projects').get_project_list())
                for project in v.slice(0,7)
                    selector.append("<option value='#{project.project_id}'>#{project.title}</option>")
                v.sort (a,b) ->
                    if a.title < b.title
                        return -1
                    else if a.title > b.title
                        return 1
                    return 0
                selector.append('<option class="select-dash" disabled="disabled">----</option>')
                for project in v
                    selector.append("<option value='#{project.project_id}'>#{project.title}</option>")

                submit = (ok) =>
                    dialog.modal('hide')
                    if ok
                        src_path          = dialog.find(".salvus-project-copy-src-path").val()
                        target_project_id = dialog.find(".salvus-project-target-project-id").val()
                        for p in v  # stupid linear search...
                            if p.project_id == target_project_id
                                target_project = p.title
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
        ], (err) => cb?(err))

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
                            alert_message(type:"error", message:"Error moving #{new_src} to #{new_dest} -- #{output.stderr}")
                        else
                            alert_message(type:"success", message:"Successfully moved #{new_src} to #{new_dest}")
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
            timeout    : 5  # move should be fast..., unless across file systems.
            network_timeout : 10
            err_on_exit : false
            path       : opts.path
            cb         : (err, output) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:"Communication error while moving '#{opts.src}' to '#{opts.dest}' -- #{err}")
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
        if not @_sort_by_time
            @_sort_by_time = true
        if @_sort_by_time
            elt.find("a").toggle()
        elt.find("a").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            elt.find("a").toggle()
            @_sort_by_time = elt.find("a[href=#sort-by-time]").is(":visible")
            local_storage(@project.project_id, '', 'sort_by_time', @_sort_by_time)
            @update_file_list_tab()
            return false

    init_project_activity: () =>
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
            catch
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


    init_project_download: () =>
        # Download entire project -- not implemented!
        ###
        link = @container.find("a[href=#download-project]")
        link.click () =>
            link.find(".spinner").show()
            @download_file
                path   : ""
                cb     : (err) =>
                    link.find(".spinner").hide()
            return false
        ###

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

    init_move_project: () =>
        return
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
                    m = "Are you sure you want to restart the project server?  Everything you have running in this project (terminal sessions, Sage worksheets, and anything else) will be killed."
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
        @update_snapshot_link()

    update_snapshot_link: () =>
        salvus_client.exec
            project_id  : @project.project_id
            command     : "ls ~/.snapshots/master/|tail -2"
            err_on_exit : true
            cb          : (err, output) =>
                if not err
                    try
                        time = misc.parse_bup_timestamp(output.stdout.split('\n')[0])
                        @_last_snapshot_time = time
                        # critical to use replaceWith!
                        c = @container.find(".project-snapshot-last-timeago span")
                        d = $("<span>").attr('title', time.toISOString()).timeago()
                        c.replaceWith(d)
                    catch e
                        console.log("error parsing last snapshot time: ", e)
                        return

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
                    e = @container.find(".salvus-project-status-indicator")
                    upper_state = state.state[0].toUpperCase() + state.state.slice(1)
                    e.text(upper_state)
                    @editor.resize_open_file_tabs()
                    if state.state in ['starting', 'stopping', 'saving', 'restarting']  # intermediate states -- update more often
                        setTimeout(@update_local_status_link, 3000)


    init_local_status_link: () =>
        @update_local_status_link()
        #@container.find(".salvus-project-status-indicator-button").click () =>
        #    @display_tab("project-settings")
        #    return false


    # browse to the snapshot viewer.
    visit_snapshot: () =>
        @current_path = ['.snapshots', 'master']
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
                    url = result.url + "&download"
                    if opts.prefix?
                        i = url.lastIndexOf('/')
                        url = url.slice(0,i+1) + opts.prefix + url.slice(i+1)
                    iframe = $("<iframe>").addClass('hide').attr('src', url).appendTo($("body"))
                    setTimeout((() -> iframe.remove()), 30000)
                    opts.cb?()

    download_file: (opts) =>
        opts = defaults opts,
            path    : required
            timeout : 45
            cb      : undefined   # cb(err) when file download from browser starts.

        url = "#{window.salvus_base_url}/#{@project.project_id}/raw/#{opts.path}"
        download_file(url)
        bootbox.alert("<h3><i class='fa fa-cloud-download'> </i> Download File</h3><b>#{opts.path}</b> should be downloading.  If not, <a target='_blank' href='#{url}'>click here</a>.")
        opts.cb?()

    open_file_in_another_browser_tab: (path) =>
        salvus_client.read_file_from_project
            project_id : @project.project_id
            path       : path
            cb         : (err, result) =>
                window.open(result.url)


    open_file: (opts) =>
        opts = defaults opts,
            path       : required
            foreground : true      # display in foreground as soon as possible

        ext = filename_extension(opts.path)
        @editor.open opts.path, (err, opened_path) =>
            if err
                # ga('send', 'event', 'file', 'open', 'error', opts.path, {'nonInteraction': 1})
                alert_message(type:"error", message:"Error opening '#{opts.path}' -- #{misc.to_json(err)}", timeout:10)
            else
                # ga('send', 'event', 'file', 'open', 'success', opts.path, {'nonInteraction': 1})
                if opts.foreground
                    @display_tab("project-editor")
                @editor.display_tab(path:opened_path, foreground:opts.foreground)

    switch_displayed_branch: (new_branch) =>
        if new_branch != @meta.display_branch
            @meta.display_branch = new_branch
            @update_file_list_tab()
            @update_commits_tab()

    update_commits_tab: () =>
        {commit_list, commits} = @meta.logs[@meta.display_branch]

        # Set the selector that allows one to choose the current branch.
        select = @container.find(".project-commits-branch")
        select.empty()
        for branch in @meta.branches
            select.append($("<option>").text(branch).attr("value",branch))
        select.val(@meta.display_branch)
        that = @
        select.change  () ->
            that.switch_displayed_branch($(@).val())
            return false

        # Set the list of commits for the current branch.
        list = @container.find(".project-commits-list")
        list.empty()
        for id in commit_list
            entry = commits[id]
            t = template_project_commit_single.clone()
            t.find(".project-commit-single-message").text(trunc(entry.message, 80))
            t.find(".project-commit-single-author").text(entry.author)
            t.find(".project-commit-single-date").attr('title', entry.date).timeago()
            t.find(".project-commit-single-sha").text(id.slice(0,10))
            list.append(t)

    # Display all the branches, along with information about each one.
    update_branches_tab: () =>
        list = @container.find(".project-branches-list")
        list.empty()

        current_branch = @meta.current_branch
        @container.find(".project-branch").text(current_branch)
        that = @

        for branch in @meta.branches
            t = template_project_branch_single.clone()
            t.find(".project-branch-single-name").text(branch)
            if branch == current_branch
                t.addClass("project-branch-single-current")
                t.find("a[href=#checkout]").hide()
                #t.find("a[href=#compare]").hide()
                t.find("a[href=#merge]").hide()
            t.data('branch', branch)

            # TODO -- combine following three into a single loop

            # Make it so clicking on the "Checkout" button checks out a given branch.
            t.find("a[href=#checkout]").data("branch", branch).click (evt) ->
                branch = $(@).data('branch')
                that.branch_op(branch:branch, op:'checkout')
                return false

            t.find("a[href=#delete]").data("branch",branch).click (evt) ->
                branch = $(@).data('branch')
                # TODO -- stern warnings
                that.branch_op(branch:branch, op:'delete')
                return false

            t.find("a[href=#merge]").data("branch",branch).click (evt) ->
                branch = $(@).data('branch')
                # TODO -- stern warnings
                that.branch_op(branch:branch, op:'merge')
                return false

            list.append(t)

        @container.find(".project-branches").find("input").attr('placeholder',"Create a new branch from '#{current_branch}'...")

    #########################################
    # Operations on files in a path and branch.
    #########################################

    path_action: (opts) =>
        opts = defaults opts,
            action  : required     # 'delete', 'move'
            branch  : undefined    # defaults to displayed branch
            path    : undefined    # defaults to displayed current_path
            commit_mesg : required
            extra_options : undefined  # needed for some actions

        spin_timer = undefined

        async.series([
            # Display the file/listing spinner
            (cb) =>
                spinner = @container.find(".project-file-listing-spinner")
                spin_timer = setTimeout((()->spinner.show().spin()), 500)
                cb()
            # Switch to different branch if necessary
            (cb) =>
                if opts.branch != @meta.current_branch
                    @branch_op(branch:opts.branch, op:'checkout', cb:cb)
                else
                    cb()

            # Carry out the action
            (cb) =>
                switch opts.action
                    when 'delete'
                        salvus_client.remove_file_from_project
                            project_id : @project.project_id
                            path       : opts.path
                            cb         : (err, mesg) =>
                                if err
                                    cb(err)
                                else if mesg.event == "error"
                                    cb(mesg.error)
                                else
                                    @current_path.pop()
                                    cb()
                    when 'move'
                        salvus_client.move_file_in_project
                            project_id : @project.project_id
                            src        : opts.path
                            dest       : opts.extra_options.dest
                            cb         : (err, mesg) =>
                                if err
                                    cb(err)
                                else if mesg.event == "error"
                                    cb(mesg.error)
                                else
                                    @current_path = opts.extra_options.dest.split('/')
                                    cb()
                    else
                        cb("unknown path action #{opts.action}")

            # Reload the files/branches/etc to take into account new commit, file deletions, etc.
            (cb) =>
                clearTimeout(spin_timer)
                @update_file_list_tab()
                cb()

        ], (err) ->
            if err
                alert_message(type:"error", message:err)
        )

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
