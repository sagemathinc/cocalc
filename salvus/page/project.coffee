###############################################################################
#
# Project page -- browse the files in a project, etc.
#
###############################################################################

{top_navbar}    = require('top_navbar')
{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')
{to_json, from_json} = require('misc')

MAX_TITLE_LENGTH = 25

templates = $("#salvus-project-templates")

class ProjectPage
    constructor: (@project_id) ->
        @container = templates.find(".salvus-project").clone()
        $("#footer").before(@container)

        @container.top_navbar
            id    : @project_id
            label : @project_id

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
                    @meta =
                        files          : from_json(_meta.files)
                        logs           : from_json(_meta.logs)
                        current_branch : _meta.current_branch
                    @cwd = []
                    @container.find(".project-branch").text(@meta.current_branch)
                    @update_file_list()
                    @update_log()

    # Returns array of objects
    #    {filename:..., description:..., last_mod:..., is_file:..., commit:...}
    # for the current working directory and branch.
    # If the cwd is invalid, return the empty array.
    current_files: () =>
        files = @meta.files[@meta.current_branch]
        log = @meta.logs[@meta.current_branch]
        for segment in @cwd
            files = files[segment]
            if not files?
                return []
        v = []
        for filename, d of files
            if typeof d == 'string'
                console.log("ddd =", d, log, log[d])
                x = log[d]
            else
                x = "directory"
            v.push({filename:filename, x:x})
        return v

    update_file_list: () =>
        s = ""
        for file in @current_files()
            s += to_json(file) + '<br>'
        @container.find(".project-file-listing").html(s)

    update_log: () =>
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

