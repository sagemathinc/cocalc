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

update_hashtags = (project_list) ->
    old_hashtags = undefined
    if store.state.hashtags?
        old_hashtags = store.state.hashtags
    else if localStorage.projects_hashtags?
        old_hashtags = JSON.parse(localStorage.projects_hashtags)
    else
        old_hashtags = {}
    hashtags = {}
    for project in project_list
        for k in misc.split((project.title + ' ' + project.description).toLowerCase())
            if k[0] == "#"
                tag = k.slice(1)
                if old_hashtags[tag]
                    hashtags[tag] = true
                else
                    hashtags[tag] = false
    hashtags

update_project_list = exports.update_project_list = (cb) ->
    salvus_client.get_projects
        hidden : store.state.filter == "hidden"
        cb: (error, mesg) ->

            if error or mesg.event != 'all_projects'
                if not error and mesg?.event == 'error'
                    error = mesg.error
                alert_message(type:"error", message:"Unable to update project list (#{error})")
            hashtags = update_hashtags(mesg.projects)
            localStorage.projects_hashtags = JSON.stringify(hashtags)
            require('flux').flux.getActions('projects').setTo
                project_list : mesg.projects
                hashtags : hashtags
                loading : false
            cb?()

# query = string or array of project_id's
exports.matching_projects = matching_projects = (query) ->
    if store.state.filter == "hidden"
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
        else if store.state.filter == "hidden"
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

create_new_project_dialog = exports.create_new_project_dialog = () ->
    create_project.modal('show')
    create_project.find("#projects-create_project-title").focus()

exports.load_target = load_target = (target, switch_to) ->
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