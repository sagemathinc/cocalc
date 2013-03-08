###################################################
#
# View and manipulate the list of user projects
#
###################################################

{salvus_client} = require('salvus_client')
{top_navbar}    = require('top_navbar')
{alert_message} = require('alerts')
{misc}          = require('misc')
{project_page, download_project, close_project}  = require('project')
{human_readable_size} = require('misc_page')

top_navbar.on "switch_to_page-projects", () ->
    update_project_list?()
    $(".projects-find-input").focus()

project_list = undefined
compute_search_data = () ->
    if project_list?
        for project in project_list
            project.search = (project.title+' '+project.description).toLowerCase()

update_project_list = exports.update_project_list = () ->
    salvus_client.get_projects
        cb: (error, mesg) ->
            if not error and mesg.event == 'all_projects'
                project_list = mesg.projects

                # EXPERIMENTAL
                #if salvus_client.account_id?
                #    console.log("save project list")
                #    localStorage[salvus_client.account_id + 'project_list'] = JSON.stringify(project_list)
            else

                alert_message(type:"error", message:"Problem getting updated list of projects. #{error}. #{misc.to_json(mesg)}")

                #if salvus_client.account_id?
                #    x = localStorage[salvus_client.account_id + 'project_list']
                #    if x?
                #        console.log("loading project_list from cache")
                #        project_list = misc.from_json(x)

            if project_list?
                compute_search_data()
                update_project_view()



# update caused by update happenin on some other client
salvus_client.on('project_list_updated', ((data) -> update_project_list()))

# search as you type
$(".projects-find-input").keyup (event) ->
    update_project_view()
    return false

# search when you click a button (which must be uncommented in projects.html):
#$(".projects-find-input").change((event) -> update_project_view())
#$(".projects").find(".form-search").find("button").click((event) -> update_project_view(); return false;)

select_filter_button = (which) ->
    for w in ['all', 'public', 'private']
        a = $("#projects-#{w}-button")
        if w == which
            a.removeClass("btn-info").addClass("btn-inverse")
        else
            a.removeClass("btn-inverse").addClass("btn-info")

only_public = null
$("#projects-all-button").click (event) ->
    only_public = null
    select_filter_button('all')
    update_project_view()

$("#projects-public-button").click (event) ->
    only_public = true
    select_filter_button('public')
    update_project_view()

$("#projects-private-button").click (event) ->
    only_public = false
    select_filter_button('private')
    update_project_view()


DEFAULT_MAX_PROJECTS = 50

$("#projects-show_all").click( (event) -> update_project_view(true) )
template = $("#projects-project_list_item_template")

create_project_item = (project) ->
    item = template.clone().show().data("project", project)

    if project.public
        item.find(".projects-public-icon").show()
        item.find(".projects-private-icon").hide()
    else
        item.find(".projects-private-icon").show()
        item.find(".projects-public-icon").hide()
        item.addClass("private-project")
    item.find(".projects-title").text(project.title)
    #if project.host != ""
    #    item.find(".projects-active").show().tooltip(title:"This project is opened, so you can access it quickly, search it, etc.", placement:"top", delay:500)
    item.find(".projects-last_edited").attr('title', project.last_edited).timeago()
    if project.size?
        item.find(".projects-size").text(human_readable_size(project.size))
    item.find(".projects-description").text(project.description)
    if project.host.username?
        d = "#{project.host.username}@#{project.host.host}"
        if project.host.path != '.'
            d += ':' + project.host.path
        if project.host.port != 22
            d += " -p#{project.host.port}"
        item.find(".projects-host").text(d)
    item.click (event) ->
        open_project(project)
        return false
    item.find("a[href='#download-project']").click () ->
        download_project
            project_id : project.project_id
            filename   : project.title
        return false

    return item

update_project_view = (show_all=false) ->
    if not project_list?
        return
    X = $("#projects-project_list")
    X.empty()
    # $("#projects-count").html(project_list.length)
    find_text = $(".projects-find-input").val().toLowerCase()
    n = 0
    for project in project_list
        if find_text != "" and project.search.indexOf(find_text) == -1
            continue
        if only_public != null and project.public != only_public
            continue
        n += 1
        if not show_all and n > DEFAULT_MAX_PROJECTS
            break
        create_project_item(project).appendTo(X)

    if n > DEFAULT_MAX_PROJECTS and not show_all
        $("#projects-show_all").show()
    else
        $("#projects-show_all").hide()

open_project = (project) ->
    project_page(project)
    top_navbar.switch_to_page(project.project_id)


################################################
# Create a New Project
################################################
$("#new_project-button").click((event) -> create_project.modal('show'))

create_project = $("#projects-create_project")

close_create_project = () ->
    create_project.modal('hide').find('input').val('')
    $("#projects-create_project-public").attr("checked", true)
    $("#projects-create_project-private").attr("checked", false)
    $("#projects-create_project-host").val('')

create_project.find(".close").click((event) -> close_create_project())

$("#projects-create_project-button-cancel").click((event) -> close_create_project())

create_project.on("shown", () -> $("#projects-create_project-title").focus())

$("#projects-create_project-button-create_project").click (event) ->
    title = $("#projects-create_project-title").val()
    if title == ""
        title = $("#projects-create_project-title").attr("placeholder")
    description = $("#projects-create_project-description").val()
    if description == ""
        description = $("#projects-create_project-description").attr("placeholder")
    spinner = $(".projects-create-new-spinner").show().spin()

    host = $.trim($("#projects-create_project-host").val())
    if host == ""
        host = {}
    else
        try
            console.log("host = ", host)
            v = host.split("-p")
            if v.length > 1
                port = parseInt($.trim(v[1]))
            else
                port = 22
            w = v[0].split(":")
            if w.length > 1
                path = $.trim(w[1])
            else
                path = '.'
            w2 = w[0].split('@')
            username = w2[0]
            hostname = w2[1]
            host = {username:username, host:hostname, port:port, path:path}
            console.log("host = ", host)
        catch e
            alert_message(type:'error', message:'Enter the unix user as "username@host[:path] [-p port]"')
            # do not close modal
            return true

    salvus_client.create_project
        title       : title
        description : description
        host        : host
        public      : $("#projects-create_project-public").is(":checked")
        cb : (error, mesg) ->
            spinner.spin(false).hide()
            if error
                alert_messgae(type:"error", message:"Unable to connect to server to create new project '#{title}'; please try again later.")
            else if mesg.event == "error"
                alert_message(type:"error", message:mesg.error)
            else
                update_project_list()
    close_create_project()



################################################
# Shutdown all projects button
################################################
#$("#projects").find("a[href=#close-all-projects]").click () ->
#    close_all_projects()
#    return false
#
#close_all_projects = () ->
#    salvus_client.get_projects
#        cb : (err, mesg) ->
#            if err or mesg.event != 'all_projects'
#                alert_message(type:"error", message:"Unable to get list of projects. #{error}. #{misc.to_json(mesg)}")
#            else
                # # TODO -- use async.parallel, etc.? to know when done, and refresh as we go.
                # for project in mesg.projects
                #     if project.host != ""
                #         close_project
                #             project_id : project.project_id
                #             title      : project.title
                #             show_success_alert : true
                #             cb : (err) ->
                #                 update_project_list()


################################################
# Download all projects button
################################################
