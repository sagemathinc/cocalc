###############################################################################
#
# Project page -- browse the files in a project, etc.
#
###############################################################################

{top_navbar}    = require('top_navbar')
{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')
{to_json, from_json, trunc} = require('misc')

MAX_TITLE_LENGTH = 25

templates = $("#salvus-project-templates")
template_project_file = templates.find(".project-file-link")
template_project_directory = templates.find(".project-directory-link")
template_home_icon = templates.find(".project-home-icon")
template_new_file_icon = templates.find(".project-new-file-icon")
template_segment_sep = templates.find(".project-segment-sep")
template_new_file_link = templates.find(".project-new-file-link")

class ProjectPage
    constructor: (@project_id) ->
        @container = templates.find(".salvus-project").clone()
        $("#footer").before(@container)

        @container.top_navbar
            id    : @project_id
            label : @project_id

        @cwd = []
        @update_meta()

        ########################################
        # Only for temporary testing
        #########################################

        @container.find(".project-new-file").click(@new_file_dialog)
        @container.find(".project-save").click(@save_project_dialog)
        @container.find(".project-close").click(@close_project_dialog)

        @container.find(".project-meta").click () =>
            salvus_client.get_project_meta
                project_id : @project_id
                cb  : (err, meta) ->
                    console.log("err = #{err}")
                    console.log("meta =", meta)

        @container.find(".project-read-text-file").click () =>
            salvus_client.read_text_file_from_project
                project_id : @project_id
                path : 'new_file.txt'
                cb : (err, contents) ->
                    console.log("err = #{err}")
                    console.log("contents =", contents)

        @container.find(".project-read-file").click () =>
            salvus_client.read_file_from_project
                project_id : @project_id
                path : 'new_file.txt'
                cb : (err, url) ->
                    console.log("err = #{err}")
                    console.log("url =", url)
                    # test it manually at this point..

        @container.find(".project-move-file").click () =>
            salvus_client.move_file_in_project
                project_id : @project_id
                src : 'new_file.txt'
                dest : 'new_file2.txt'
                cb : (err, mesg) ->
                    console.log("err = #{err}, mesg = ", mesg)

        @container.find(".project-make-directory").click () =>
            salvus_client.make_directory_in_project
                project_id : @project_id
                path : 'new_directory'
                cb : (err, mesg) ->
                    console.log("err = #{err}, mesg = ", mesg)

        @container.find(".project-remove-file").click () =>
            salvus_client.remove_file_from_project
                project_id : @project_id
                path : 'new_file.txt'
                cb : (err, mesg) ->
                    console.log("err = #{err}, mesg = ", mesg)

        @container.find(".project-remove-directory").click () =>
            salvus_client.remove_file_from_project
                project_id : @project_id
                path : 'new_directory'
                cb : (err, mesg) ->
                    console.log("err = #{err}, mesg = ", mesg)

    save_project_dialog: () =>
        salvus_client.save_project
            project_id : @project_id
            commit_mesg : "a commit message"
            cb         : (err, mesg) ->
                if err
                    alert_message(type:"error", message:"Connection error.")
                else if mesg.event == "error"
                    alert_message(type:"error", message:mesg.error)
                else
                    alert_message(type:"success", message: "Project successfully saved.")

    close_project_dialog: () =>
        salvus_client.close_project
            project_id : @project_id
            cb         : (err, mesg) ->
                if err
                    alert_message(type:"error", message:"Connection error.")
                else if mesg.event == "error"
                    alert_message(type:"error", message:mesg.error)
                else
                    alert_message(type:"success", message: "Project closed.")

    new_file_dialog: () =>
        salvus_client.write_text_file_to_project
            project_id : @project_id,
            path       : 'new_file.txt',
            content    : 'This is a new file.'
            cb         : (err, mesg) ->
                if err
                    alert_message(type:"error", message:"Connection error.")
                else if mesg.event == "error"
                    alert_message(type:"error", message:mesg.error)
                else
                    alert_message(type:"success", message: "New file created.")

    new_file: (path) =>
        salvus_client.write_text_file_to_project
            project_id : @project_id
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
                        project_id : @project_id
                        commit_mesg : "Created a new file."
                        cb : (err, mesg) =>
                            console.log(err, mesg)
                            if not err and mesg.event != 'error'
                                #console.log("updating meta")
                                @update_meta()

    set_model: (project) ->
        @project = project
        @update_view()

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

    update_view: () ->
        if not @project?
            return

        @container.find(".project-project_title").text(@project.title)
        @container.find(".project-project_description").text(@project.description)

        label = @project.title.slice(0,MAX_TITLE_LENGTH) + if @project.title.length > MAX_TITLE_LENGTH then "..." else ""
        top_navbar.set_button_label(@project.project_id, label)
        return @


    update_meta: () =>
        salvus_client.get_project_meta
            project_id : @project_id
            cb  : (err, _meta) =>
                if err
                    alert_message(type:'error', message:err)
                else
                    #console.log("got", _meta)
                    @meta =
                        files          : from_json(_meta.files)
                        logs           : from_json(_meta.logs)
                        current_branch : _meta.current_branch
                    @container.find(".project-branch").text(@meta.current_branch)
                    @update_file_list()
                    @update_log()

    # Returns array of objects
    #    {filename:..., is_file:..., commit:...reference to commit object if is_file true...}
    # for the current working directory and branch.
    # If the cwd is invalid, return the empty array.
    current_files: () =>
        file_data = @meta.files[@meta.current_branch]
        log = @meta.logs[@meta.current_branch]
        for segment in @cwd
            file_data = file_data[segment]
            if not file_data?
                return []

        directories = []
        files = []
        for filename, d of file_data
            obj = {filename:filename}
            if typeof d == 'string'  # a commit id -- consult the log
                obj.is_file = true
                obj.commit = log[d]
                files.push(obj)
            else  # a directory
                obj.is_file = false
                directories.push(obj)

        cmp = (a,b) ->
            if a.filename < b.filename
                return -1
            else if a.filename == b.filename
                return 0
            else
                return 1
        directories.sort(cmp)
        files.sort(cmp)
        return directories.concat(files)

    update_cwd: () =>
        t = @container.find(".project-file-listing-cwd")
        t.empty()
        t.append($("<a>").html(template_home_icon.clone().click(() => @cwd=[]; @update_file_list())))
        new_cwd = []
        that = @
        for segment in @cwd
            new_cwd.push(segment)
            t.append(template_segment_sep.clone())
            t.append($("<a>"
            ).html(segment
            ).data("cwd",new_cwd[..]  # make a copy
            ).click((elt) =>
                console.log($(elt.target).data("cwd"))
                @cwd = $(elt.target).data("cwd")
                @update_file_list()
            ))
        t.append(template_segment_sep.clone())
        t.append(template_new_file_link.clone().data("cwd", @cwd).click( (elt) ->
            that.new_file($(@).data("cwd").join('/'))
        ).tooltip(placement:'right'))  # TODO -- should use special plugin and depend on settings.

    update_file_list: () =>
        console.log("update_file_list of project #{@project_id}")
        @update_cwd()
        listing = @container.find(".project-file-listing-file-list")
        listing.empty()
        console.log(@current_files())
        that = @
        for obj in @current_files()
            if obj.is_file
                t = template_project_file.clone()
                t.find(".project-file-name").text(obj.filename)
                t.find(".project-file-last-edited").text($.timeago(new Date(obj.commit.date)))
                t.find(".project-file-last-commit-message").text(trunc(obj.commit.message, 70))
                t.data("filename",obj.filename).click (e) ->
                    that.open_file($(@).data('filename'))
            else
                t = template_project_directory.clone()
                t.find(".project-directory-name").text(obj.filename)
                t.data('filename',obj.filename).click (e) ->
                    that.cwd.push($(@).data('filename'))
                    that.update_file_list()

            listing.append(t)

    update_log: () =>
        console.log("update_log of project #{@project_id}")
        log = @meta.logs[@meta.current_branch]
        console.log(log)


project_pages = {}

# Function that returns the project page for the project with given id,
# or creates it if it doesn't exist.
project_page = exports.project_page = (project_id) ->
    p = project_pages[project_id]
    if p?
        return p
    p = new ProjectPage(project_id)
    project_pages[project_id] = p
    return p

