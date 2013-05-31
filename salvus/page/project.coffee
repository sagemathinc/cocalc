###############################################################################
#
# Project page -- browse the files in a project, etc.
#
###############################################################################

{IS_MOBILE} = require("feature")
{top_navbar}    = require('top_navbar')
{salvus_client} = require('salvus_client')
message         = require('message')
{alert_message} = require('alerts')
async           = require('async')
misc            = require('misc')
{filename_extension, defaults, required, to_json, from_json, trunc, keys, uuid} = misc
{file_associations, Editor, local_storage} = require('editor')
{scroll_top, human_readable_size}    = require('misc_page')

MAX_TITLE_LENGTH = 15

templates = $("#salvus-project-templates")
template_project_file          = templates.find(".project-file-link")
template_project_directory     = templates.find(".project-directory-link")
template_project_file_snapshot      = templates.find(".project-file-link-snapshot")
template_project_directory_snapshot = templates.find(".project-directory-link-snapshot")
template_home_icon             = templates.find(".project-home-icon")
template_segment_sep           = templates.find(".project-segment-sep")
template_new_file_link         = templates.find(".project-new-file-link")
template_project_commits       = templates.find(".project-commits")
template_project_commit_single = templates.find(".project-commit-single")
template_project_branch_single = templates.find(".project-branch-single")

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
        $("body").append(@container)

        # Create a new tab in the top navbar (using top_navbar as a jquery plugin)
        @container.top_navbar
            id    : @project.project_id
            label : @project.project_id
            icon  : 'icon-edit'
            onclose : () =>
                @save_browser_local_data()
                delete project_pages[@project.project_id]
            onshow: () =>
                if @project?
                    document.title = "SMC: #{@project.title}"
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

        @create_editor()

        @init_file_search()

        @init_new_file_tab()

        @init_refresh_files()
        @init_hidden_files_icon()
        @init_trash_link()
        @init_snapshot_link()
        @init_project_download()
        @init_project_restart()
        @init_worksheet_server_restart()

        # Set the project id
        @container.find(".project-id").text(@project.project_id)

        if @project.size? and @project.size
            @container.find(".project-size").text(human_readable_size(@project.size))
        else
            @container.find(".project-size-label").hide()

        # Set the project location
        #if @project.location?
        #    l = @project.location
        #    l = "#{l.username}@#{l.host}:#{l.path}" + (if l.port != 22 then " -p #{l.port}" else "")
        #    @container.find(".project-location").text(l)#.attr('contenteditable', true).blur () ->
            #    alert_message(message:"Changing project location not yet implemented.", type:'info')
                # TODO -- actually implement project location change -- show a notification and send
                # a message if makes sense; otherwise, don't.  Also, we should store all past
                # project location in the database, and make it possible for the user to see them (?).
                # console.log('changed to ', $(@).text())

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



    window_resize: () =>
        if @current_tab.name == "project-file-listing"
            @_update_file_listing_size()

    _update_file_listing_size: () =>
        elt = @container.find(".project-file-listing-container")
        elt.height($(window).height() - elt.offset().top)

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
        console.log("initialize console sessions: ", sessions)
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
        console.log("initialize sage sessions: ", sessions)
        #TODO -- not enough info to do this yet.
        #for session_uuid, obj of sessions
        #    tab = @editor.create_tab(filename : obj.path, session_uuid:session_uuid)
        cb?()

    init_file_sessions: (sessions, cb) =>
        for filename, data of local_storage(@project.project_id)
            if data.auto_open
                tab = @editor.create_tab(filename : filename)
        cb?()

    ########################################
    # Search
    ########################################

    init_file_search: () =>
        @_file_search_box = @container.find(".salvus-project-search-for-file-input").tooltip(delay:{ show: 500, hide: 100 })
        @_file_search_box.keyup (event) =>
            if (event.metaKey or event.ctrlKey) and event.keyCode == 79
                @display_tab("project-editor")
                return false
            @update_file_search()

    clear_file_search: () =>
        @_file_search_box.val('')

    focus_file_search: () =>
        if not IS_MOBILE
            @_file_search_box.focus()

    update_file_search: () =>
        search_box = @_file_search_box
        include = 'project-listing-search-include'
        exclude = 'project-listing-search-exclude'
        v = $.trim(search_box.val()).toLowerCase()

        listing = @container.find(".project-file-listing-file-list")

        if v == ""
            # remove all styling
            for entry in listing.children()
                $(entry).removeClass(include)
                $(entry).removeClass(exclude)
            match = (s) -> true
        else
            terms = v.split(' ')
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
            fullpath = entry.data('name')
            filename = misc.path_split(fullpath).tail
            if match(filename, entry.hasClass('project-directory-link'))
                if first and event.keyCode == 13 # enter -- select first match (if any)
                    entry.click()
                    first = false
                if v != ""
                    entry.addClass(include); entry.removeClass(exclude)
            else
                if v != ""
                    entry.addClass(exclude); entry.removeClass(include)
        if first and event.keyCode == 13
            # No matches at all, and user pressed enter -- maybe they want to create a file?
            @display_tab("project-new-file")
            @new_file_tab_input.val(search_box.val())

    init_search_form: () =>
        that = @
        input_boxes = @container.find(".project-search-form-input")
        input_boxes.keypress (evt) ->
            t = $(@)
            if evt.which== 13
                # Do the search.
                try
                    that.search(t.val())
                catch e
                    console.log(e)
                return false

        @container.find(".project-search-output-recursive").change () =>
            @search($(input_boxes[0]).val())
        @container.find(".project-search-output-case-sensitive").change () =>
            @search($(input_boxes[0]).val())

    search: (query) =>
        if $.trim(query) == ""
            return
        @display_tab("project-search")
        @container.find(".project-search-output-path-heading").show()
        @container.find(".project-search-output-terms").text(query)
        search_output = @container.find(".project-search-output").show().empty()
        recursive   = @container.find(".project-search-output-recursive").is(':checked')
        insensitive = not @container.find(".project-search-output-case-sensitive").is(':checked')
        max_results = 1000
        max_output  = 110*max_results  # just in case
        if insensitive
            ins = " -i "
        else
            ins = ""
        if recursive
            cmd = "find * -type f | grep #{ins} #{query}; rgrep -H #{ins} #{query} *"
        else
            cmd = "ls -1 | grep #{ins} #{query}; grep -H #{ins} #{query} *"

        path = @current_pathname()

        path_prefix = path
        if path_prefix != ''
            path_prefix += '/'

        @container.find(".project-search-output-command").text(cmd)
        @container.find(".project-search-output-path").text(@project.location.path + '/' + path)

        spinner = @container.find(".project-search-spinner")
        timer = setTimeout(( () -> spinner.show().spin()), 300)
        that = @
        salvus_client.exec
            project_id : @project.project_id
            command    : cmd + " | cut -c 1-256"  # truncate horizontal line length (imagine a binary file that is one very long line)
            timeout    : 5   # how long grep runs on client
            network_timeout : 10   # how long network call has until it must return something or get total error.
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
                    i = line.indexOf(":")
                    num_results += 1
                    if i == -1
                        # the find part
                        filename = line
                        r = search_result.clone()
                        r.find("a").text(filename).data(filename: path_prefix + filename).click () ->
                            that.open_file($(@).data('filename'))
                    else
                        # the rgrep part
                        filename = line.slice(0,i)
                        context  = trunc(line.slice(i+1), 25)
                        r = search_result.clone()
                        r.find("span").text(context)
                        r.find("a").text(filename).data(filename: path_prefix + filename).click () ->
                            that.open_file($(@).data('filename'))

                    search_output.append(r)
                    if num_results >= max_results
                        break



    ########################################
    # ...?
    ########################################

    git_commit: (input) =>
        @container.find(".project-commit-message-output").text("").hide()
        @container.find(".project-commit-message-spinner").show().spin()
        salvus_client.save_project
            project_id : @project.project_id
            commit_mesg : input.val()
            cb : (err, mesg) =>
                @container.find(".project-commit-message-spinner").spin(false).hide()
                if err
                    alert_message(type:"error", message:"Connection error saving project.")
                else if mesg.event == "error"
                    @container.find(".project-commit-message-output").text(mesg.error).show()
                else
                    input.val("")

    command_line_exec: () =>
        elt = @container.find(".project-command-line")
        input = elt.find("input")
        command0 = input.val()
        command = command0 + "\npwd"
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
                    cwd = output.stdout.slice(i+1, j+1)
                    if cwd.slice(0,6) == "/home/"
                        cwd = cwd.slice(7)
                        k = cwd.indexOf('/')
                        if k != -1
                            cwd = cwd.slice(k+1)
                            path = @project.location.path
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


    branch_op: (opts) =>
        opts = defaults opts,
            branch : required
            op     : required
            cb     : undefined
        # op must be one of ['create', 'checkout', 'delete', 'merge']
        branch = opts.branch
        op = opts.op

        # Quick client-side check for obviously invalid branch name
        if branch.length == 0 or branch.split(/\s+/g).length != 1
            alert_message(type:'error', message:"Invalid branch name '#{branch}'")
            return

        async.series([
            (c) =>
                salvus_client.project_branch_op
                    project_id : @project.project_id
                    op         : op
                    branch     : branch
                    cb         : (err, mesg) ->
                        if err
                            alert_message(type:'error', message:err)
                            c(true) # fail
                        else if mesg.event == "error"
                            alert_message(type:'error', message:mesg.error)
                            c(true) # fail
                        else
                            alert_message(message:"#{op} branch '#{branch}'")
                            c()  # success
            (c) =>
                @save_project(cb:c)
        ], opts.cb)

    hide_tabs: () =>
        @container.find(".project-pages").hide()

    show_tabs: () =>
        @container.find(".project-pages").show()

    init_tabs: () ->
        @tabs = []
        that = @
        for item in @container.find(".project-pages").children()
            t = $(item)
            target = t.find("a").data('target')
            if not target?
                continue

            # activate any a[href=...] links elsewhere on the page
            @container.find("a[href=##{target}]").data('target',target).click () ->
                that.display_tab($(@).data('target'))
                return false

            t.find('a').tooltip(delay:{ show: 1000, hide: 200 })
            name = target
            tab = {label:t, name:name, target:@container.find(".#{name}")}
            @tabs.push(tab)

            t.find("a").click () ->
                that.display_tab($(@).data("target"))
                return false

            if name == "project-file-listing"
                tab.onshow = () ->
                    that.container.css('position', 'absolute')
                    that.update_file_list_tab()
            else if name == "project-editor"
                tab.onshow = () ->
                    that.container.css('position', 'absolute')
                    that.editor.onshow()
            else if name == "project-new-file"
                tab.onshow = () ->
                    that.container.css('position', 'absolute')
                    that.show_new_file_tab()
            else if name == "project-settings"
                tab.onshow = () ->
                    that.container.css('position', 'absolute')
                    that.update_topbar()

        @display_tab("project-file-listing")

    create_editor: (initial_files) =>   # initial_files (optional)
        @editor = new Editor
            project_page  : @
            counter       : @container.find(".project-editor-file-count")
            initial_files : initial_files
        @container.find(".project-editor").append(@editor.element)

    display_tab: (name) =>
        @container.find(".project-pages").children().removeClass('active')
        for tab in @tabs
            if tab.name == name
                @current_tab = tab
                tab.target.show()
                tab.label.addClass('active')
                tab.onshow?()
                @focus()
            else
                tab.target.hide()

    save_browser_local_data: (cb) =>
        @editor.save(undefined, cb)

    save_project: (opts={}) =>
        @save_browser_local_data (err) =>
            if err
                return # will have generated its own error message
            opts.project_id = @project.project_id
            opts.title = @project.title
            save_project(opts)

    close_project: (opts={}) =>
        opts.title = @project.title
        opts.project_id = @project.project_id
        close_project(opts)

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
                    salvus_client.save_project
                        project_id : @project.project_id
                        cb : (err, mesg) =>
                            if not err and mesg.event != 'error'
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

        @container.find(".project-project_title").text(@project.title)
        @container.find(".project-project_description").text(@project.description)

        label = @project.title.slice(0,MAX_TITLE_LENGTH) + if @project.title.length > MAX_TITLE_LENGTH then "..." else ""
        top_navbar.set_button_label(@project.project_id, label)
        document.title = "SMC: #{@project.title}"

        if not (@_computing_usage? and @_computing_usage)
            usage = @container.find(".project-disk_usage")
            # --exclude=.sagemathcloud --exclude=.forever --exclude=.node* --exclude=.npm --exclude=.sage
            @_computing_usage = true
            salvus_client.exec
                project_id : @project.project_id
                command    : 'du -sch .'
                timeout    : 360
                cb         : (err, output) =>
                    delete @_computing_usage
                    if not err
                        usage.text(output.stdout)
                    else
                        usage.text("(timed out running 'du -sch .')")

        return @



    # Return the string representation of the current path, as a
    # relative path from the root of the project.
    current_pathname: () => @current_path.join('/')

    # Set the current path array from a path string to a directory
    set_current_path: (path) =>
        if path == "" or not path?
            @current_path = []
        else
            @current_path = path.split('/')
        @container.find(".project-file-top-current-path-display").text(path)

    # Render the slash-separated and clickable path that sits above
    # the list of files (or current file)
    update_current_path: () =>
        @container.find(".project-file-top-current-path-display").text(@current_pathname())

        t = @container.find(".project-file-listing-current_path")
        t.empty()
        t.append($("<a>").html(template_home_icon.clone().click(() =>
            @current_path=[]; @update_file_list_tab())))

        new_current_path = []
        that = @
        for segment in @current_path
            new_current_path.push(segment)
            t.append(template_segment_sep.clone())
            t.append($("<a>"
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
                when "project-editor"
                    @editor.focus()

    init_dropzone_upload: () =>
        # Dropzone
        uuid = misc.uuid()
        dz_container = @container.find(".project-dropzone")
        dz_container.empty()
        dz = $('<div class="dropzone"></div>')
        dz_container.append(dz)
        dest_dir = encodeURIComponent(@new_file_tab.find(".project-new-file-path").text())
        dz.dropzone
            url: "/upload?project_id=#{@project.project_id}&dest_dir=#{dest_dir}"
            dictDefaultMessage : "Drop a file here, or click to select a file from your computer..."
            maxFilesize: 10 # in megabytes

    init_new_file_tab: () =>

        # Make it so clicking on each of the new file tab buttons does the right thing.
        @new_file_tab = @container.find(".project-new-file")
        @new_file_tab_input = @new_file_tab.find(".project-new-file-path-input")

        path = (ext) =>
            name = $.trim(@new_file_tab_input.val())
            if name.length == 0
                return ''
            s = $.trim(@new_file_tab.find(".project-new-file-path").text() + name)
            if ext?
                if misc.filename_extension(s) != ext
                    s += ext
            return s

        @new_file_tab.find("a[href=#new-terminal]").click () =>
            p = path('.term')
            if p.length == 0
                @new_file_tab_input.focus()
                return false
            @display_tab("project-editor")
            tab = @editor.create_tab(filename:p, content:"")
            @editor.display_tab(p)
            return false

        @new_file_tab.find("a[href=#new-worksheet]").click () =>
            create_file('.sagews')
            return false

        @new_file_tab.find("a[href=#old-worksheet]").click () =>
            p = path('.sage-worksheet')
            if p.length == 0
                @new_file_tab_input.focus()
                return false
            @display_tab("project-editor")
            tab = @editor.create_tab(filename:p, content:"")
            @editor.display_tab(p)
            return false

        create_file = (ext) =>
            p = path(ext)
            if p.length == 0
                @new_file_tab_input.focus()
                return false
            if p[p.length-1] == '/'
                create_folder()
                return false
            @ensure_file_exists
                path : p
                alert : true
                cb : (err) =>
                    if not err
                        alert_message(type:"info", message:"Created new file '#{p}'")
                        @display_tab("project-editor")
                        tab = @editor.create_tab(filename:p, content:"")
                        @editor.display_tab(p)
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

        @new_file_tab.find("a[href=#new-file]").click(() => create_file())
        @new_file_tab.find("a[href=#new-folder]").click(create_folder)
        @new_file_tab_input.keyup (event) =>
            if event.keyCode == 13
                create_file()
                return false
            if (event.metaKey or event.ctrlKey) and event.keyCode == 79     # control-o
                @display_tab("project-file-listing")
                return false


        @get_from_web_input = @new_file_tab.find(".project-import-from-web")
        @new_file_tab.find("a[href=#import-from-web]").click () =>
            url = $.trim(@get_from_web_input.val())
            if url == ""
                @get_from_web_input.focus()
                return false
            dest = @new_file_tab.find(".project-new-file-path").text()
            long = () ->
                alert_message(type:'info', message:"Launched recursive download of '#{url}' to '#{dest}', which may run for up to 15 seconds.")
            timer = setTimeout(long, 3000)
            @get_from_web
                url     : url
                dest    : dest
                timeout : 15
                alert   : true
                cb      : (err) =>
                    clearTimeout(timer)
                    if not err
                        alert_message(type:'info', message:"Finished downloading '#{url}' to '#{dest}'.")
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
        #now = now.slice(0, now.length-2)  # get rid of seconds.
        @new_file_tab_input.val(now).focus()
        @get_from_web_input.val('')


    # Update the listing of files in the current_path, or display of the current file.
    update_file_list_tab: (no_focus) =>
        #console.log("current_path = ", @current_path)
        # Update the display of the path above the listing or file preview
        @update_current_path()

        @container.find("a[href=#empty-trash]").toggle(@current_path[0] == '.trash')
        @container.find("a[href=#trash]").toggle(@current_path[0] != '.trash')

        spinner = @container.find(".project-file-listing-spinner")

        timer = setTimeout( (() -> spinner.show().spin()), 300 )

        path = @current_path.join('/')
        salvus_client.project_directory_listing
            project_id : @project.project_id
            path       : path
            time       : @_sort_by_time
            hidden     : @container.find("a[href=#hide-hidden]").is(":visible")
            cb         : (err, listing) =>
                clearTimeout(timer)
                spinner.spin(false).hide()
                if (err)
                    console.log("error", err)
                    if @_last_path_without_error? and @_last_path_without_error != path
                        console.log("using last path without error:  ", @_last_path_without_error)
                        @set_current_path(@_last_path_without_error)
                        @_last_path_without_error = undefined # avoid any chance of infinite loop
                        @update_file_list_tab(no_focus)
                    else
                        alert_message(type:"error", message:"Error viewing files at '#{path}' in project '#{@project.title}'.")

                    return
                # remember for later
                @_last_path_without_error = path

                if not listing?
                    return

                @_last_listing = listing

                # Now rendering the listing or file preview
                file_or_listing = @container.find(".project-file-listing-file-list")
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
                    t = template_project_directory.clone()
                    parent = that.current_path.slice(0, that.current_path.length-1).join('/')
                    if parent == ""
                        parent = "."
                    t.data('name', parent)
                    t.find(".project-directory-name").html("<i class='icon-reply'> </i> Parent Directory")
                    t.find("input").hide()  # hide checkbox, etc.
                    # Clicking to open the directory
                    t.click () ->
                        that.current_path.pop()
                        that.update_file_list_tab()
                        return false
                    t.droppable(drop:file_dropped_on_directory, scope:'files')
                    t.find("a").tooltip(trigger:'hover', delay: { show: 500, hide: 100 }); t.find(".icon-move").tooltip(trigger:'hover', delay: { show: 500, hide: 100 })
                    file_or_listing.append(t)

                # Show the files
                for obj in listing['files']
                    if obj.isdir? and obj.isdir
                        if obj.snapshot?
                            t = template_project_directory_snapshot.clone()
                            if obj.snapshot == ''
                                t.find(".btn").hide()
                        else
                            t = template_project_directory.clone()
                            t.droppable(drop:file_dropped_on_directory, scope:'files')
                        t.find(".project-directory-name").text(obj.name)
                    else
                        if obj.snapshot?
                            t =  template_project_file_snapshot.clone()
                            if obj.snapshot == ''
                                t.find(".btn").hide()
                        else
                            t = template_project_file.clone()
                        if obj.name.indexOf('.') != -1
                            ext = filename_extension(obj.name)
                            name = obj.name.slice(0,obj.name.length - ext.length - 1)
                        else
                            ext = ''
                            name = obj.name
                        t.find(".project-file-name").text(name)
                        if ext != ''
                            t.find(".project-file-name-extension").text('.' + ext)
                            if file_associations[ext]? and file_associations[ext].icon?
                                t.find(".project-file-icon").removeClass("icon-file").addClass(file_associations[ext].icon)
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

                    # Define file actions using a closure
                    @_init_listing_actions(t, path, obj.name, obj.isdir? and obj.isdir, obj.snapshot?)

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

                    t.find("a").tooltip(trigger:'hover', delay: { show: 500, hide: 100 }); t.find(".icon-move").tooltip(trigger:'hover', delay: { show: 500, hide: 100 })
                    # Finally add our new listing entry to the list:
                    directory_is_empty = false
                    file_or_listing.append(t)

                #@clear_file_search()
                @update_file_search()

                # No files
                if directory_is_empty and path != ".trash" and path.slice(0,9) != ".snapshot"
                    @container.find(".project-file-listing-no-files").show()
                else
                    @container.find(".project-file-listing-no-files").hide()

                if no_focus? and no_focus
                    return
                @focus_file_search()

    _init_listing_actions: (t, path, name, isdir, is_snapshot) =>
        if path != ""
            fullname = path + '/' + name
        else
            fullname = name

        t.data('name', fullname)  # save for other uses outside this function

        b = t.find(".project-file-buttons")

        open = () =>
            if isdir
                @current_path.push(name)
                @update_file_list_tab()
            else
                @open_file(fullname)
            return false

        if not is_snapshot or isdir
            # Opening a file
            file_link = t.find("a[href=#open-file]")
            file_link.click open

            # Clicking on link -- open the file
            t.click open


        if is_snapshot

            restore = () =>
                n = fullname.slice(".snapshot/".length)
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

        # Renaming a file
        rename_link = t.find('a[href=#rename-file]')

        rename_link.click () =>
            @click_to_rename_file(path, file_link)
            return false

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


    rename_file: (path, original_name, new_name) =>
        @move_file
            src : original_name
            dest : new_name
            path : path
            cb   : (err) =>
                if not err
                    @update_file_list_tab(true)

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
            timeout    : 5
            args       : ['-p', opts.path]
            cb         : (err, result) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:err)
                    else if result.event == 'error'
                        alert_message(type:"error", message:result.error)
                opts.cb?(err or output.event == 'error')

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
                salvus_client.exec
                    project_id : @project.project_id
                    command    : "touch"
                    timeout    : 5
                    args       : [opts.path]
                    cb         : (err, result) =>
                        if opts.alert
                            if err
                                alert_message(type:"error", message:err)
                            else if result.event == 'error'
                                alert_message(type:"error", message:result.error)
                        opts.cb?(err or output.event == 'error')
        ], (err) -> opts.cb?(err))

    get_from_web: (opts) =>
        opts = defaults opts,
            url     : required
            dest    : undefined
            timeout : 10
            alert   : true
            cb      : undefined     # cb(true or false, depending on error)
        salvus_client.exec
            project_id : @project.project_id
            command    : "wget"
            timeout    : opts.timeout
            path       : opts.dest
            args       : [opts.url]
            cb         : (err, result) =>
                if opts.alert
                    if err
                        alert_message(type:"error", message:err)
                    else if result.event == 'error'
                        alert_message(type:"error", message:result.error)
                opts.cb?(err or output.event == 'error')

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
            @_sort_by_time = false
        if @_sort_by_time
            elt.find("a").toggle()
        elt.find("a").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            elt.find("a").toggle()
            @_sort_by_time = elt.find("a[href=#sort-by-time]").is(":visible")
            local_storage(@project.project_id, '', 'sort_by_time', @_sort_by_time)
            @update_file_list_tab()
            return false

    init_project_download: () =>
        # Download entire project
        link = @container.find("a[href=#download-project]")
        link.click () =>
            link.find(".spinner").show()
            @download_file
                path   : ""
                prefix : 'project'
                cb     : (err) =>
                    link.find(".spinner").hide()
            return false

    init_worksheet_server_restart: () =>
        # Restart worksheet server
        link = @container.find("a[href=#restart-worksheet-server]").tooltip(delay:{ show: 500, hide: 100 })
        link.click () =>
            link.find(".spinner").show()
            salvus_client.exec
                project_id : @project.project_id
                command    : "sage_server stop; sage_server start"
                timeout    : 10
                cb         : (err, output) =>
                    link.find(".spinner").hide()
                    if err
                        alert_message
                            type    : "error"
                            message : "Error trying to restart worksheet server.  Try restarting the project instead."
                    else
                        alert_message
                            type    : "info"
                            message : "Worksheet server restarted.  Newly (re-)started worksheets will fork off from the newly started Sage session."
                            timeout : 4
            return false


    init_project_restart: () =>
        # Restart local project server
        link = @container.find("a[href=#restart-project]").tooltip(delay:{ show: 500, hide: 100 })
        link.click () =>
            link.find(".spinner").show()
            alert_message
                type    : "info"
                message :"Restarting project server.  This should take around 15 seconds..."
                timeout : 10

            project_id = @project.project_id
            salvus_client.exec
                project_id : project_id
                command    : 'stop_smc'
                timeout    : 3
                cb         : () =>
                    # We do something else now, which will trigger the hub to notice the
                    # server is down and restart it.
                    f = () ->
                        salvus_client.exec
                            project_id : project_id
                            command    : 'ls'  # doesn't matter
                            timeout    : 3
                            cb         : (err, output) =>
                                if err
                                    f()
                                else
                                    link.find(".spinner").hide()
                                    alert_message
                                        type    : "success"
                                        message : "Successfully restarted project server!  Your terminal and worksheet processes have been reset."
                                        timeout : 2
                    f()
            return false

    init_snapshot_link: () =>
        @container.find("a[href=#snapshot]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            @visit_snapshot()
            return false

    # browse to the snapshot viewer.
    visit_snapshot: () =>
        @current_path = ['.snapshot']
        @update_file_list_tab()

    init_trash_link: () =>
        @container.find("a[href=#trash]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            @visit_trash()
            return false

        @container.find("a[href=#empty-trash]").tooltip(delay:{ show: 500, hide: 100 }).click () =>
            bootbox.confirm "<h1><i class='icon-trash pull-right'></i></h1> <h5>Are you sure you want to permanently erase the items in the Trash?</h5><br> <span class='lighten'>Old versions of files, including the trash, are stored as snapshots.</span>  ", (result) =>
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

    download_file: (opts) =>
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
                    setTimeout((() -> iframe.remove()), 1000)
                    opts.cb?()

    open_file_in_another_browser_tab: (path) =>
        salvus_client.read_file_from_project
            project_id : @project.project_id
            path       : path
            cb         : (err, result) =>
                window.open(result.url)


    open_file: (path) =>
        ext = filename_extension(path)
        @editor.open(path)
        @display_tab("project-editor")
        @editor.display_tab(path)

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

            # Save the project in its current state, so this action is undo-able/safe
            (cb) =>
                @save_project
                    cb          : cb

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

            # Save after the action.
            (cb) =>
                @save_project
                    cb          : cb

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
    return p


