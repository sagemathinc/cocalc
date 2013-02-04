###############################################################################
#
# Project page -- browse the files in a project, etc.
#
###############################################################################

{top_navbar}    = require('top_navbar')
{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')
{series}        = require('async')
{filename_extension, defaults, required, to_json, from_json, trunc, keys} = require('misc')
{Editor}        = require('editor')
{Consoles}      = require('consoles')
{scroll_top, human_readable_size}    = require('misc_page')

MAX_TITLE_LENGTH = 25

templates = $("#salvus-project-templates")
template_project_file          = templates.find(".project-file-link")
template_project_directory     = templates.find(".project-directory-link")
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
        $("#footer").before(@container)

        # Create a new tab in the top navbar
        @container.top_navbar
            id    : @project.project_id
            label : @project.project_id
            onclose : () => delete project_pages[@project.project_id]

        # current_path is a possibly empty list of directories, where
        # each one is contained in the one before it.
        @current_path = []

        @init_tabs()
        @reload()

        @update_topbar()

        @create_editor()
        @create_consoles()

        # Set the project id
        @container.find(".project-id").text(@project.project_id)

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
                            alert_message(type:'error', message:"Error contacting server to save modified project title.")
                        else if mesg.event == "error"
                            alert_message(type:'error', message:mesg.error)
                        else
                            that.project.title = new_title

        @container.find(".project-project_description").blur () ->
            new_desc = $(@).text()
            if new_desc != that.project.description
                salvus_client.update_project_data
                    project_id : that.project.project_id
                    data       : {description:new_desc}
                    cb         : (err, mesg) ->
                        if err
                            alert_message(type:'error', message:err)
                        else if mesg.event == "error"
                            alert_message(type:'error', message:mesg.error)
                        else
                            that.project.description = new_desc

        # Activate the command line
        @container.find("form.project-command-line").submit () ->
            try
                that.command_line_exec($(@))
            catch e
                console.log(e)
            return false


        # Make it so typing something into the "create a new branch..." box
        # makes a new branch.
        @container.find(".project-branches").find('form').submit () ->
            that.branch_op(branch:$(@).find("input").val(), op:'create')
            return false

        file_tools = @container.find(".project-file-tools")

        file_tools.find("a[href=#delete]").click () ->
            if not $(@).hasClass("disabled")
                delete_path_dialog.show(that)
            return false

        file_tools.find("a[href=#move]").click () ->
            if not $(@).hasClass("disabled")
                move_path_dialog.show(that)
            return false

        ########################################
        # Only for temporary testing
        #########################################

        @container.find(".project-new-file").click(@new_file_dialog)
        @container.find(".project-save").click(() => @save_project(show_success_alert:true))
        @container.find(".project-close").click(@close_project_dialog)
        @container.find(".project-meta").click @reload

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
                    @reload()

    command_line_exec: (form) =>
        input = form.find("input")
        command = input.val()
        command += "\npwd"
        input.val("")
        t = setTimeout((() => @container.find(".project-command-line-spinner").show().spin()), 1000)
        salvus_client.exec
            project_id : @project.project_id
            command    : command
            timeout    : 3
            max_output : 100000
            bash       : true
            path       : @current_pathname()
            cb         : (err, output) =>
                clearTimeout(t)
                @container.find(".project-command-line-spinner").spin(false).hide()
                if err
                    alert_message(type:'error', message:err)
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
                            @current_path = cwd.split('/')
                        else
                            # HOME
                            @current_path = []

                        output.stdout = if i == -1 then "" else output.stdout.slice(0,i)
                    # We display the output of the command.
                    form.find(".project-command-line-stdout").text(output.stdout).show()
                    form.find(".project-command-line-stderr").text(output.stderr).show()
                @update_file_list_tab()

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

        series([
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
            (c) =>
                @reload()
        ], opts.cb)

    init_tabs: () ->
        @tabs = []
        that = @
        for item in @container.find(".project-pages").children()
            t = $(item)
            name = t.find("a").attr('href').slice(1)
            t.data("name", name)
            tab = {label:t, name:name, target:@container.find(".#{name}")}
            @tabs.push(tab)
            t.click () ->
                that.display_tab($(@).data("name"))
                return false

            if name == "project-file-listing"
                tab.onshow = () ->
                    that.update_file_list_tab()

        @display_tab("project-file-listing")

    create_editor: (initial_files) =>   # initial_files (optional)
        @editor = new Editor
            project_id    : @project.project_id
            counter       : @container.find(".project-editor-file-count")
            initial_files : initial_files
        @container.find(".project-editor").append(@editor.element)

    create_consoles: (initial_consoles) =>   # initial_consoles (optional)
        try
            @consoles = new Consoles
                project_id       : @project.project_id
                counter          : @container.find(".project-consoles-count")
                initial_sessions : initial_consoles
            @container.find(".project-consoles").append(@consoles.element)
        catch e
            console.log("Error creating new Consoles...: #{e}")

    display_tab: (name) =>
        scroll_top()
        for tab in @tabs
            if tab.name == name
                tab.target.show()
                tab.label.addClass('active')
                if tab.onshow?
                    tab.onshow()
            else
                tab.target.hide()
                tab.label.removeClass('active')

    save_project: (opts={}) =>
        opts = defaults opts,
            commit_mesg : ""
            cb          : undefined
            show_success_alert : false
        salvus_client.save_project
            project_id : @project.project_id
            commit_mesg : opts.commit_mesg
            cb         : (err, mesg) ->
                if err
                    alert_message(type:"error", message:"Connection error saving project.")
                else if mesg.event == "error"
                    alert_message(type:"error", message:mesg.error)
                else if opts.show_success_alert
                    alert_message(type:"success", message: "Project successfully saved.")
                opts.cb?()

    close_project_dialog: () =>
        salvus_client.close_project
            project_id : @project.project_id
            cb         : (err, mesg) ->
                if err
                    alert_message(type:"error", message:"Connection error.")
                else if mesg.event == "error"
                    alert_message(type:"error", message:mesg.error)
                else
                    alert_message(type:"success", message: "Project closed.")

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
                        commit_mesg : "Created a new file."
                        cb : (err, mesg) =>
                            if not err and mesg.event != 'error'
                                @reload()

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
        return @


    reload: (cb) =>
        salvus_client.get_project_meta
            project_id : @project.project_id
            cb  : (err, _meta) =>
                if err
                    alert_message(type:'error', message:err)
                else
                    files = from_json(_meta.files)
                    logs = from_json(_meta.logs)
                    branches = keys(files)
                    branches.sort()
                    @meta =
                        files          : files
                        logs           : logs
                        current_branch : _meta.current_branch
                        display_branch : _meta.current_branch  # start the same
                        branches       : branches
                    @update_file_list_tab()
                    @update_commits_tab()
                    @update_branches_tab()
                cb?()


    # Return the string representation of the current path, as a
    # relative path from the root of the project.
    current_pathname: () => @current_path.join('/')

    # Render the slash-separated and clickable path that sits above
    # the list of files (or current file)
    update_current_path: () =>
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

        # Put a link to create a new file or directory here.
        t.append(template_segment_sep.clone())
        t.append(template_new_file_link.clone().data("current_path", @current_path).click( (elt) ->
            that.new_file($(@).data("current_path").join('/'))
        ))  #.tooltip(placement:'right'))  # TODO -- should use special plugin and depend on settings.


    # Update the listing of files in the current_path, or display of the current file.
    update_file_list_tab: () =>
        # Update the display of the path above the listing or file preview
        @update_current_path()
        spinner = @container.find(".project-file-listing-spinner")
        spinner.show().spin()

        # focus on the command line
        @container.find("form.project-command-line").find("input").focus()

        salvus_client.project_directory_listing
            project_id : @project.project_id
            path       : @current_path.join('/')
            cb         : (err, listing) =>
                spinner.spin(false).hide()
                if (err)
                    alert_message(type:"error", message:err)
                    return

                if not listing?
                    return

                # Now rendering the listing or file preview
                file_or_listing = @container.find(".project-file-listing-file-list")
                file_or_listing.empty()

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
                # Show the files
                for obj in listing['files']
                    if obj.isdir? and obj.isdir
                        t = template_project_directory.clone()
                        t.find(".project-directory-name").text(obj.name)
                        # Clicking to open the directory
                        t.data('name', obj.name).click (e) ->
                            that.current_path.push($(@).data('name'))
                            that.update_file_list_tab()
                            return false
                    else
                        t = template_project_file.clone()
                        t.find(".project-file-name").text(obj.name)

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

                        # Clicking -- open the file in the editor
                        if path != ""
                            name = path + '/' + obj.name
                        else
                            name = obj.name
                        t.data('name', name).click (e) ->
                            that.open_file($(@).data('name'))
                            return false
                    file_or_listing.append(t)

    open_file: (path) =>
        ext = filename_extension(path)
        switch ext
            when "salvus"
                @display_tab("project-consoles")
                # Do not open if already open
                for id, c of @consoles.tabs
                    if c.console.path == path
                        @consoles.display_tab(id)
                        return
                @consoles.create_tab(type:"worksheet", path:path)
            else
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

        series([
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
                    commit_mesg : "save before #{opts.action}"
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
                    commit_mesg : opts.commit_mesg
                    cb          : cb

            # Reload the files/branches/etc to take into account new commit, file deletions, etc.
            (cb) =>
                clearTimeout(spin_timer)
                @reload(cb)

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

