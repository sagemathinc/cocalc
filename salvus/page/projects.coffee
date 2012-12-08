###################################################
#
# View and manipulate the list of user projects
#
###################################################

{salvus_client} = require('salvus_client')
{top_navbar}    = require('top_navbar')
{alert_message} = require('alerts')
{project_page}  = require('project')

top_navbar.on "switch_to_page-projects", () ->
    update_project_list?()
    $("#projects-find-input").focus()

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
                compute_search_data()
                update_project_view()


# update caused by update happenin on some other client
salvus_client.on('project_list_updated', ((data) -> update_project_list()))

# search as you type
$("#projects-find-input").keyup((event) -> update_project_view())
# search when you click a button (which must be uncommented in projects.html):
#$("#projects-find-input").change((event) -> update_project_view())
#$("#projects").find(".form-search").find("button").click((event) -> update_project_view(); return false;)

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


DEFAULT_MAX_PROJECTS = 20

$("#projects-show_all").click( (event) -> update_project_view(true) )

update_project_view = (show_all=false) ->
    if not project_list?
        return
    X = $("#projects-project_list")
    X.empty()
    $("#projects-count").html(project_list.length)
    find_text = $("#projects-find-input").val().toLowerCase()
    n = 0
    for project in project_list
        if find_text != "" and project.search.indexOf(find_text) == -1
            continue
        if only_public != null and project.public != only_public
            continue
        n += 1
        if not show_all and n > DEFAULT_MAX_PROJECTS
            break
        template = $("#projects-project_list_item_template")
        item = template.clone().show().data("project", project)

        if project.public
            item.find(".projects-public-icon").show()
            item.find(".projects-private-icon").hide()
        else
            item.find(".projects-private-icon").show()
            item.find(".projects-public-icon").hide()
            item.addClass("private-project")
        item.find(".projects-title").text(project.title)
        item.find(".projects-description").text(project.description)
        item.click (event) ->
            open_project ($(@).data("project"))
            return false
        item.appendTo(X)

    if n > DEFAULT_MAX_PROJECTS and not show_all
        $("#projects-show_all").show()
    else
        $("#projects-show_all").hide()

open_project = (project) ->
    project_page(project.project_id).set_model(project)
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

create_project.find(".close").click((event) -> console.log('foo'); close_create_project())

$("#projects-create_project-button-cancel").click((event) -> close_create_project())

create_project.on("shown", () -> $("#projects-create_project-title").focus())

$("#projects-create_project-button-create_project").click (event) ->
    title = $("#projects-create_project-title").val()
    if title == ""
        title = "Untitled"
    salvus_client.create_project
        title       : title
        description : $("#projects-create_project-description").val()
        public      : $("#projects-create_project-public").is(":checked")
        cb : (error, mesg) ->
            if error
                alert_message("Error creating project: #{error}")
            else
                update_project_list()
    close_create_project()
