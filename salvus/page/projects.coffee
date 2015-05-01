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


###################################################
#
# View and manipulate the list of user projects
#
###################################################
async = require('async')


{salvus_client} = require('salvus_client')
{top_navbar}    = require('top_navbar')
{alert_message} = require('alerts')
misc            = require('misc')
{required, defaults} = misc
{project_page}  = require('project')
{human_readable_size, html_to_text} = require('misc_page')
{account_settings} = require('account')

templates = $(".salvus-projects-templates")

project_list = undefined
hidden_project_list = undefined

# get project info, using local cache if possible
exports.get_project_info = (opts) ->
    opts = defaults opts,
        project_id : required
        cb         : required
    if project_list?
        for p in project_list
            if p.project_id == project
                opts.cb(undefined, p)
                return
    if hidden_project_list?
        for p in project_list
            if p.project_id == project
                opts.cb(undefined, p)
                return
    # have to get info from database.
    salvus_client.project_info
        project_id : opts.project_id
        cb         : opts.cb

# Return last downloaded project list
exports.get_project_list = (opts) ->
    opts = defaults opts,
        update   : false      # if false used cached local version if available,
                              # though it may be out of date
        hidden   : false      # whether to list hidden projects (if false don't list any hidden projects; if true list only hidden projects)

        select   : undefined  # if given, populate with selectable list of all projects
        select_exclude : undefined # if given, list of project_id's to exclude from select
        number_recent : 7     # number of recent projects to include at top if selector is given.

        cb       : undefined  # cb(err, project_list)

    update_list = (cb) ->
        if not opts.update and ((project_list? and not opts.hidden) or (hidden_project_list? and opts.hidden))
            # done
            cb()
        else
            salvus_client.get_projects
                hidden : opts.hidden
                cb     : (err, mesg) ->
                    if err
                        cb(err)
                    else if mesg.event == 'error'
                        cb(mesg.error)
                    else
                        if opts.hidden
                            hidden_project_list = mesg.projects
                        else
                            project_list = mesg.projects
                        cb()
    update_list (err) ->
        if err
            opts.cb?(err)
        else
            projects = if opts.hidden then hidden_project_list else project_list
            if opts.select?
                select = opts.select
                exclude = {}
                if opts.select_exclude?
                    for project_id in opts.select_exclude
                        exclude[project_id] = true
                v = ({project_id:x.project_id, title:x.title.slice(0,80)} for x in projects when not exclude[x.project_id])
                # First list newest projects
                for project in v.slice(0,opts.number_recent)
                    select.append("<option value='#{project.project_id}'>#{project.title}</option>")
                v.sort (a,b) ->
                    if a.title < b.title
                        return -1
                    else if a.title > b.title
                        return 1
                    return 0
                # Now list all projects, if there are any more
                if v.length > opts.number_recent
                    select.append('<option class="select-dash" disabled="disabled">----</option>')
                    for project in v
                        select.append("<option value='#{project.project_id}'>#{project.title}</option>")
            opts.cb?(undefined, projects)

project_hashtags = {}
compute_search_data = () ->
    if project_list?
        project_hashtags = {}  # reset global variable
        for project in project_list
            project.search = (project.title+' '+project.description).toLowerCase()
            for k in misc.split(project.search)
                if k[0] == '#'
                    tag = k.slice(1).toLowerCase()
                    project_hashtags[tag] = true
                    project.search += " [#{k}] "

    # NOTE: create_project_item also adds to project.search, with info about the users of the projects

compute_hidden_search_data = () ->
    if hidden_project_list?
        project_hashtags = {}  # reset global variable
        for project in hidden_project_list
            project.search = (project.title+' '+project.description).toLowerCase()
            for k in misc.split(project.search)
                if k[0] == '#'
                    tag = k.slice(1).toLowerCase()
                    project_hashtags[tag] = true
                    project.search += " [#{k}] "

project_list_spinner = $("a[href=#refresh-projects]").find('i')

project_list_spin = () -> project_list_spinner.addClass('fa-spin')
project_list_spin_stop = () -> project_list_spinner.removeClass('fa-spin')

update_project_list = exports.update_project_list = (cb) ->

    timer = setTimeout(project_list_spin, if project_list? then 2000 else 1)

    salvus_client.get_projects
        hidden : only_hidden
        cb: (error, mesg) ->
            clearTimeout(timer)
            project_list_spin_stop()

            if not error and mesg.event == 'all_projects'
                if only_hidden
                    hidden_project_list = mesg.projects
                else
                    project_list = mesg.projects
            else
                if not error and mesg?.event == 'error'
                    error = mesg.error
                alert_message(type:"error", message:"Unable to update project list (#{error})")

                #if salvus_client.account_id?
                #    x = localStorage[salvus_client.account_id + 'project_list']
                #    if x?
                #        console.log("loading project_list from cache")
                #        project_list = misc.from_json(x)

            if not only_hidden and project_list?
                for p in project_list
                    if p.owner?
                        p.ownername = misc.make_valid_name(p.owner[0].first_name + p.owner[0].last_name)
                compute_search_data()
                update_hashtag_bar()
                update_project_view()

            if only_hidden and hidden_project_list?
                for p in hidden_project_list
                    if p.owner?
                        p.ownername = misc.make_valid_name(p.owner[0].first_name + p.owner[0].last_name)
                compute_hidden_search_data()
                update_hashtag_bar()
                update_project_view()

            cb?()

top_navbar.on "switch_to_page-projects", () ->
    window.history.pushState("", "", window.salvus_base_url + '/projects')
    update_project_list()
    $(".projects-find-input").focus()


project_refresh_button = $("#projects").find("a[href=#refresh-projects]").click () ->
    project_list_spin()
    update_project_list () ->
        project_list_spin_stop()
    return false


# update caused by update happening on some other client
salvus_client.on('project_list_updated', ((data) -> update_project_list()))

# search as you type
$(".projects-find-input").keyup (event) ->
    update_project_view()
    return false

$(".projects-search-form-input-clear").click () =>
    $(".projects-find-input").val('').focus()
    update_project_view()
    return false


# search when you click a button (which must be uncommented in projects.html):
#$(".projects-find-input").change((event) -> update_project_view())
# This comment has been preserved, though the "form-search" class is deprecated
#$(".projects").find(".form-search").find("button").click((event) -> update_project_view(); return false;)

select_filter_button = (which) ->
    for w in ['all', 'deleted', 'hidden']
        a = $("#projects-#{w}-button")
        if w == which
            a.removeClass("btn-info").addClass("btn-warning")
        else
            a.removeClass("btn-warning").addClass("btn-info")

only_deleted = false
only_hidden  = false

$("#projects-all-button").click (event) ->
    only_deleted = false
    only_hidden  = false
    select_filter_button('all')
    update_project_view()
    update_project_list () ->
        update_project_view()


$("#projects-deleted-button").click (event) ->
    only_deleted = true
    only_hidden  = false
    select_filter_button('deleted')
    update_project_view()
    update_project_list () ->
        update_project_view()

$("#projects-hidden-button").click (event) ->
    only_deleted = false
    only_hidden  = true
    select_filter_button('hidden')
    update_project_view()
    update_project_list () ->
        update_project_view()


DEFAULT_MAX_PROJECTS = 50

$("#projects-show_all").click( (event) -> update_project_view(true) )
template = $(".projects-project_list_item_template")

template_project_stored = $(".projects-location-states").find(".projects-location-restoring")
template_project_deploying = $(".projects-location-states").find(".projects-locatin-deploying")

create_project_item = (project) ->
    item = template.clone().show().data("project", project)

    # NOTE: in some places, project title is HTML, but showing arbitrary HTML is danerous, due to
    # (1) cross site scripting, and (2) anybody can add anybody else as a project collaborator right now, without any acceptance (will change)
    title = misc.trunc(html_to_text(project.title),128)
    item.find(".projects-title").text(title)
    #if project.host != ""
    #    item.find(".projects-active").show().tooltip(title:"This project is opened, so you can access it quickly, search it, etc.", placement:"top", delay:500)

    try
        item.find(".projects-last_edited").attr('title', (new Date(project.last_edited)).toISOString()).timeago()
    catch e
        console.log("error setting time of project #{project.project_id} to #{project.last_edited} -- #{e}; please report to wstein@gmail.com")

    #if project.size?
    #    item.find(".projects-size").text(human_readable_size(project.size))

    description = misc.trunc(html_to_text(project.description),128)
    item.find(".projects-description").text(description)

    users = []
    for group in misc.PROJECT_GROUPS
        if project[group]?
            for user in project[group]
                if user.account_id != salvus_client.account_id
                    users.push("#{user.first_name} #{user.last_name}") # (#{group})")  # use color for group...
                    project.search += (' ' + user.first_name + ' ' + user.last_name + ' ').toLowerCase()

    if users.length == 0
        u = ''
    else
        u = '  ' + users.join(', ')
    item.find(".projects-users-list").text(u)

    item.find(".projects-users").click () ->
        open_project
            project : project
            item    : item
            cb      : (err, proj) ->
                if err
                    alert_message(type:"error", message:err)
                    return
                proj.show_add_collaborators_box()
        return false

    if not project.location  # undefined or empty string
        item.find(".projects-location").append(template_project_stored.clone())
    else if project.location == "deploying"
        item.find(".projects-location").append(template_project_deploying.clone())

    item.click (e) ->
        open_project
            project   : project
            item      : item
            switch_to : not(e.which == 2 or (e.ctrlKey or e.metaKey))
            cb        : (err) ->
                if err
                    alert_message(type:"error", message:err)
        return false
    return item

# query = string or array of project_id's
exports.matching_projects = matching_projects = (query) ->
    if only_hidden
        v = hidden_project_list
    else
        v = project_list

    if typeof(query) == 'string'
        find_text = query

        # Returns
        #    {projects:[sorted (newest first) array of projects matching the given search], desc:'description of the search'}
        desc = "Showing "
        if only_deleted
            desc += "deleted projects "
        else if only_hidden
            desc += "hidden projects "
        else
            desc += "projects "
        if find_text != ""
            desc += " whose title, description or users contain '#{find_text}'."

        words = misc.split(find_text)
        match = (search) ->
            if find_text != ''
                for word in words
                    if word[0] == '#'
                        word = '[' + word + ']'
                    if search.indexOf(word) == -1
                        return false
            return true

        ans = {projects:[], desc:desc}
        for project in v
            if not match(project.search)
                continue

            if only_deleted
                if not project.deleted
                    continue
            else
                if project.deleted
                    continue
            ans.projects.push(project)

        return ans

    else

        # array of project_id's
        return {desc:'', projects:(p for p in v when p.project_id in query)}


# Update the list of projects in the projects tab.
# TODO: don't actually make the change until mouse has stayed still for at least some amount of time. (?)
update_project_view = (show_all=false) ->
    if not only_hidden and not project_list?
        return
    if only_hidden and not hidden_project_list?
        return
    top_navbar.activity_indicator('projects')

    X = $("#projects-project_list")
    X.empty()
    # $("#projects-count").html(project_list.length)

    find_text = $(".projects-find-input").val().toLowerCase()

    for tag in selected_hashtags()
        find_text += ' ' + tag

    {projects, desc} = matching_projects(find_text)

    n = 0
    $(".projects-describe-listing").text(desc)

    for project in projects
        n += 1
        if not show_all and n > DEFAULT_MAX_PROJECTS
            break
        create_project_item(project).appendTo(X)

    if n > DEFAULT_MAX_PROJECTS and not show_all
        $("#projects-show_all").show()
    else
        $("#projects-show_all").hide()

########################################
#
# hashtag handling
#
########################################

hashtag_bar = $(".salvus-hashtag-buttons")
hashtag_button_template = templates.find(".salvus-hashtag-button")

# Toggle whether or not the given hashtag button is selected.
toggle_hashtag_button = (button) ->
    tag = button.text()
    if button.hasClass('btn-info')
        button.removeClass('btn-info').addClass('btn-warning')
        localStorage["projects-hashtag-#{tag}"] = true
    else
        button.removeClass('btn-warning').addClass('btn-info')
        delete localStorage["projects-hashtag-#{tag}"]

# Return list of strings '#foo', for each currently selected hashtag
selected_hashtags = () ->
    v = []
    for button in hashtag_bar.children()
        b = $(button)
        if b.hasClass('btn-warning')
            v.push(b.text())
    return v

# Handle user clicking on a hashtag button; updates what is displayed and changes class of button.
click_hashtag = (event) ->
    button = $(event.delegateTarget)
    toggle_hashtag_button(button)
    update_project_view()
    return false

update_hashtag_bar = () ->
    # Create and add click events to all the hashtag buttons.
    if project_hashtags.length == 0
        hashtag_bar.hide()
        return
    hashtag_bar.empty()
    v = misc.keys(project_hashtags)
    v.sort()
    for tag in v
        button = hashtag_button_template.clone()
        button.text("#"+tag)
        button.click(click_hashtag)
        hashtag_bar.append(button)
        if localStorage["projects-hashtag-##{tag}"]
            toggle_hashtag_button(button)
    hashtag_bar.show()


## end hashtag code

exports.open_project = open_project = (opts) ->
    opts = defaults opts,
        project   : required
        item      : undefined
        target    : undefined
        switch_to : true
        cb        : undefined   # cb(err, project)

    project = opts.project
    if typeof(project) == 'string'
        # actually a project id
        x = undefined
        if project_list?
            for p in project_list
                if p.project_id == project
                    x = p
                    break
        if not x?
            # have to get info from database.
            salvus_client.project_info
                project_id : project
                cb         : (err, p) ->
                    if err
                        # try again as a public project
                        salvus_client.public_project_info
                            project_id : project
                            cb         : (err, p) ->
                                if err
                                    opts.cb?("You do not have access to the project with id '#{project}'")
                                else
                                    open_project
                                        project   : p
                                        item      : opts.item
                                        target    : opts.target
                                        switch_to : opts.switch_to
                                        cb        : opts.cb
                    else
                        open_project
                            project   : p
                            item      : opts.item
                            target    : opts.target
                            switch_to : opts.switch_to
                            cb        : opts.cb
            return
        else
            project = x

    proj = project_page(project)
    top_navbar.resize_open_project_tabs()
    if opts.switch_to
        top_navbar.switch_to_page(project.project_id)
    if opts.target?
        proj.load_target(opts.target, opts.switch_to)

    opts.cb?(undefined, proj)

################################################
# Create a New Project
################################################
create_project = $("#projects-create_project")
title_input = $("#projects-create_project-title")
description_input = $("#projects-create_project-description")

create_new_project_dialog = exports.create_new_project_dialog = () ->
    create_project.modal('show')
    create_project.find("#projects-create_project-title").focus()

$("#new_project-button").click () ->
    create_new_project_dialog()
    return false

close_create_project = () ->
    create_project.modal('hide').find('input').val('')
    #$("#projects-create_project-location").val('')

create_project.find(".close").click((event) -> close_create_project())

$("#projects-create_project-button-cancel").click((event) -> close_create_project())

create_project.on("shown", () -> $("#projects-create_project-title").focus())

new_project_button = $("#projects-create_project-button-create_project").click (event) ->
    create_new_project()

# pressing enter on title_input brings you to description_input
title_input.keyup (e) ->
    if e.keyCode == 13
        description_input.focus()

# pressing enter on description_input creates new project
description_input.keyup (e) ->
    if e.keyCode == 13
        create_new_project()

create_new_project = () ->
    title = title_input.val()
    if title == ""
        title = title_input.attr("placeholder")
    description = description_input.val()
    if description == ""
        description = description_input.attr("placeholder")

    new_project_button.icon_spin(start:true)
    alert_message(message:"Creating new project '#{title}'.  Project will automatically appear in the list in a few seconds.", timeout:10)
    salvus_client.create_project
        title       : title
        description : description
        public      : $("#projects-create_project-public").is(":checked")
        cb : (error, mesg) ->
            new_project_button.icon_spin(false)
            if error
                alert_message(type:"error", message:"Unable to connect to server to create new project '#{title}'; please try again later.")
            else if mesg.event == "error"
                alert_message(type:"error", message:mesg.error)
            else
                update_project_list()
    close_create_project()
    return false



# Open something defined by a URL inside a project where
#
# target = project-id/
# target = ownername/projectname/
#                                files/....
#                                recent
#                                new
#                                log
#                                settings
#                                search
#
exports.load_target = load_target = (target, switch_to) ->
    #console.log("projects -- load_target=#{target}")
    if not target or target.length == 0
        top_navbar.switch_to_page("projects")
        return
    segments = target.split('/')
    if misc.is_valid_uuid_string(segments[0])
        t = segments.slice(1).join('/')
        project_id = segments[0]
        open_project
            project   : project_id
            target    : t
            switch_to : switch_to
            cb        : (err) ->
                if err
                    alert_message(type:"error", message:err)


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