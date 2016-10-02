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


underscore      = require('underscore')
async           = require('async')

misc            = require('smc-util/misc')

# ensure the project_store is initialized -- this is needed to render projects.
project_store   = require('./project_store')

{IS_MOBILE}     = require("./feature")
{top_navbar}    = require('./top_navbar')
{salvus_client} = require('./salvus_client')
{alert_message} = require('./alerts')
misc_page       = require('./misc_page')

{redux}         = require('./smc-react')

{filename_extension, defaults, required, to_json, from_json, trunc, keys, uuid} = misc
{file_associations, Editor, local_storage, public_access_supported} = require('./editor')

{download_file} = misc_page

# How long to cache public paths in this project
PUBLIC_PATHS_CACHE_TIMEOUT_MS = 1000*60

# if a project_id is in this list, do not show the quota warning
warning_banner_hidden = []

##################################################
# Define the project page class
##################################################

class ProjectPage
    constructor: (@project_id) ->
        if typeof(@project_id) != 'string'
            throw Error('ProjectPage constructor now takes a string')
        @project = {project_id: @project_id}   # TODO: a lot of other code assumes the ProjectPage has this; since this is going away; who cares for now...

        # the html container for everything in the project.
        @container = $("#salvus-project-templates").find(".salvus-project").clone()
        @container.data('project', @)
        $("body").append(@container)

        # react initialization
        @actions        = redux.getProjectActions(@project_id)
        @store          = redux.getProjectStore(@project_id)
        @projects_store = redux.getStore('projects')

        redux.getActions('projects').set_project_state_open(@project_id)

        @create_editor()
        @init_tabs()
        @init_sortable_editor_tabs()
        @init_new_tab_in_navbar()
        @free_project_warning()
        @projects_store.wait
            until   : (s) => s.get_my_group(@project_id)
            timeout : 60
            cb      : (err, group) =>
                if not err
                    @public_access = (group == 'public')
                    @editor.public_access = @public_access  # TODO: terrible
                    if @public_access
                        @container.find(".salvus-project-write-access").hide()
                        @container.find(".salvus-project-public-access").show()
                    else
                        @container.find(".salvus-project-write-access").show()
                        @container.find(".salvus-project-public-access").hide()
        #@projects_store.on('change', @render)

    activity_indicator: () =>
        top_navbar.activity_indicator(@project_id)

    # call when project is closed completely
    destroy: () =>
        #@projects_store?.removeListener('change', @render)
        @save_browser_local_data()
        @container.empty()
        @editor?.destroy()
        delete project_pages[@project_id]
        @project_log?.disconnect_from_session()
        clearInterval(@_update_last_snapshot_time)
        @_cmdline?.unbind('keydown', @mini_command_line_keydown)
        delete @editor
        redux.getActions('projects').set_project_state_close(@project_id)
        project_store.deleteStoreActionsTable(@project_id, redux)
        delete @projects_store
        delete @actions
        delete @store

    free_project_warning: () =>
        if underscore.contains(warning_banner_hidden, @project_id)
            return
        @projects_store.wait
            until   : (s) => s.get_total_project_quotas(@project_id)
            timeout : 60
            cb      : (err, quotas) =>
                if not err and quotas?
                    host     = not quotas.member_host
                    internet = not quotas.network
                    box  = @container.find('.smc-project-free-quota-warning')
                    {PolicyPricingPageUrl} = require('./customize')
                    long_warning_server = """
                    <p>This project runs on a heavily loaded randomly rebooted free server.
                    Please upgrade your project to run on a members-only server for more reliability and faster code execution.</p>"""
                    long_warning_internet = """
                    <p>This project does not have external network access, so you cannot use internet
                    resources directly from this project; in particular, you can't
                    install software from the internet,
                    download from sites like GitHub,
                    or download data from public data portals.</p>"""
                    long_warning_info = """
                    <ul>
                        <li>Learn about <a href='#{PolicyPricingPageUrl}' class='pricing' target='_blank'>Pricing and Subscriptions</a></li>
                        <li>Read the billing <a href="#{PolicyPricingPageUrl}#faq" class='faq' target='_blank'>Frequently Asked Questions</a></li>
                        <li>Visit <a href='#' class='billing'>Billing</a> to <em>subscribe</em> to a plan</li>
                        <li>Upgrade <em>this</em> project in <a href='#' class='settings'>Project Settings</a></li>
                    </ul></p>"""
                    if host or internet
                        extra = ""
                        html = "<p><i class='fa fa-exclamation-triangle'></i> WARNING: This project runs"
                        if host
                            html += " on a <b>free server</b>"
                            extra += long_warning_server
                        if internet
                            html += " without <b>internet access</b>"
                            extra += long_warning_internet
                        html += " &mdash; <a href='#' class='learn'>learn more...</a> "
                        html += "<a href='#' class='dismiss'>×</a></p>"
                        html += "<div class='longtext'>#{extra} #{long_warning_info}</div>"
                        box.find("div").html(html)
                        box.find('div a.learn').click (evt) ->
                            box.find('div.longtext').show()
                        box.find("div a.billing").click (evt) ->
                            require('./history').load_target('settings/billing')
                            evt.stopPropagation()
                        box.find("div a.settings").click =>
                            @load_target('settings')
                        box.find(".dismiss").click (evt) =>
                            warning_banner_hidden.push(@project_id)
                            box.hide()
                        box.show()
                    else
                        box.hide()


    init_new_tab_in_navbar: () =>
        # Create a new tab in the top navbar (using top_navbar as a jquery plugin)
        @container.top_navbar
            id    : @project_id
            label : @project_id
            icon  : 'fa-edit'

            onclose : () =>
                # do on next render loop since react flips if we do this too soon.
                setTimeout(@destroy, 1)

            onblur: () =>
                @editor?.remove_handlers()
                redux.getActions('projects').setState(foreground_project:undefined) # TODO: temporary

            onshow: () =>
                if @project?
                    @actions.push_state()
                @editor?.activate_handlers()
                @editor?.refresh()
                #TODO: this will go away
                require('./browser').set_window_title(redux.getStore('projects').get_title(@project_id))  # change title bar
                redux.getActions('projects').setState(foreground_project: @project_id)

            onfullscreen: (entering) =>
                if @project?
                    if entering
                        @hide_tabs()
                    else
                        @show_tabs()
                    $(window).resize()

        # Replace actual tab content by a React component that gets dynamically updated
        # when the project title is changed, and can display other information from the store.
        require('./project_settings').init_top_navbar(@project_id)


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
                    @set_current_path(segments.slice(1, segments.length-1).join('/'))
                    @display_tab("project-file-listing")
                else
                    # open a file -- foreground option is relevant here.
                    if foreground
                        @set_current_path(segments.slice(1, segments.length-1).join('/'))
                        @display_tab("project-editor")
                    @actions.open_file
                        path       : segments.slice(1).join('/')
                        foreground : foreground
                        foreground_project : foreground
            when 'new'  # ignore foreground for these and below, since would be nonsense
                @set_current_path(segments.slice(1).join('/'))
                @display_tab("project-new-file")
            when 'log'
                @display_tab("project-activity")
            when 'settings'
                @display_tab("project-settings")
            when 'search'
                @set_current_path(segments.slice(1).join('/'))
                @display_tab("project-search")

    close: () =>
        top_navbar.remove_page(@project_id)

    # Reload the @project attribute from the database, and re-initialize
    # ui elements, mainly in settings.
    reload_settings: (cb) =>
        @project = redux.getStore('projects').get_project(@project_id)
        cb?()

    init_sortable_editor_tabs: () =>
        @container.find(".nav.projects").sortable
            axis                 : 'x'
            delay                : 50
            containment          : 'parent'
            tolerance            : 'pointer'
            placeholder          : 'nav-projects-placeholder'
            forcePlaceholderSize : true

    ########################################
    # ...?
    ########################################

    hide_tabs: () =>
        @container.find(".project-pages").hide()
        @container.find(".file-pages").hide()

    show_tabs: () =>
        @container.find(".project-pages").show()
        @container.find(".file-pages").show()

    init_tabs: () =>
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
                    require('./project_files').render_new(that.project.project_id, that.container.find(".smc-react-project-files")[0], redux)
                    that.actions.set_url_to_path(that.store.get('current_path'))
                tab.onblur = () ->
                    require('./project_files').unmount(that.container.find(".smc-react-project-files")[0])
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
                    require('./project_new').render_new(that.project.project_id, that.container.find(".smc-react-project-new")[0], redux)
                    that.actions.push_state('new/' + that.store.get('current_path'))
                tab.onblur = ->
                    require('./project_new').unmount(that.container.find(".smc-react-project-new")[0])
            else if name == "project-activity" and not @public_access
                tab.onshow = () =>
                    require('./project_log').render_log(that.project.project_id, that.container.find(".smc-react-project-log")[0], redux)
                    that.editor?.hide_editor_content()
                    that.actions.push_state('log')
                    # HORRIBLE TEMPORARY HACK since focus isn't working with react... yet  (TODO)
                    @container.find(".project-activity").find("input").focus()
                tab.onblur = ->
                    require('./project_log').unmount(that.container.find(".smc-react-project-log")[0])

            else if name == "project-settings" and not @public_access
                tab.onshow = () ->
                    require('./project_settings').create_page(that.project.project_id, that.container.find(".smc-react-project-settings")[0], redux)
                    that.editor?.hide_editor_content()
                    that.actions.push_state('settings')
                    url = document.URL
                    i = url.lastIndexOf("/settings")
                    if i != -1
                        url = url.slice(0,i)
                    that.container.find(".salvus-settings-url").val(url)
                tab.onblur = ->
                    require('./project_settings').unmount(that.container.find(".smc-react-project-settings")[0])

            else if name == "project-search" and not @public_access
                tab.onshow = () ->
                    require('./project_search').render_project_search(that.project.project_id, that.container.find(".smc-react-project-search")[0], redux)
                    that.editor?.hide_editor_content()
                    that.actions.push_state('search/' + that.store.get('current_path'))
                    that.container.find(".project-search-form-input").focus()
                tab.onblur = ->
                    require('./project_search').unmount(that.container.find(".smc-react-project-search")[0])

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
        if @_last_display_tab_name == name
            # tab already displayed
            return
        @container.find(".project-pages").children().removeClass('active')
        @container.find(".file-pages").children().removeClass('active')
        @container.css(position: 'static')

        # hide the currently open tab
        for tab in @tabs
            if tab.name == @_last_display_tab_name
                tab.onblur?()
                tab.target.hide()
                break
        @_last_display_tab_name = name
        # show the tab we are opening
        for tab in @tabs
            if tab.name == name
                @current_tab = tab
                tab.target.show()
                tab.label.addClass('active')
                tab.onshow?()
                @focus()
                break
        # fix the size of the tabs at the top
        @editor?.resize_open_file_tabs()

        if name == 'project-new-file'
            @actions.set_next_default_filename(require('./account').default_filename())

        if name == 'project-file-listing'
            #temporary
            sort_by_time = @store.get('sort_by_time') ? true
            show_hidden = @store.get('show_hidden') ? false
            @actions.set_directory_files(@store.get('current_path'), sort_by_time, show_hidden)

    show_editor_chat_window: (path) =>
        @editor?.show_chat_window(path)

    save_browser_local_data: (cb) =>
        @editor.save(undefined, cb)

    # Return the string representation of the current path, as a
    # relative path from the root of the project.
    current_pathname: () => @store.get('current_path')

    # Set the current path array from a path string to a directory
    set_current_path: (path) =>
        if path != @store.get('current_path')
            redux.getProjectActions(@project_id).set_current_path(path)

    focus: () =>
        if not IS_MOBILE  # do *NOT* do on mobile, since is very annoying to have a keyboard pop up.
            switch @current_tab.name
                when "project-file-listing"
                    @container.find(".salvus-project-search-for-file-input").focus()
                #when "project-editor"
                #    @editor.focus()

    default_filename: (ext) =>
        return require('./account').default_filename(ext)

    ensure_directory_exists: (opts) =>
        opts = defaults opts,
            path  : required
            cb    : undefined  # cb(true or false)
            alert : true
        salvus_client.exec
            project_id : @project_id
            command    : "mkdir"
            timeout    : 15
            args       : ['-p', '--', opts.path]
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
                    project_id : @project_id
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
            project_id : @project_id
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


    open_file_in_another_browser_tab: (path) =>
        salvus_client.read_file_from_project
            project_id : @project_id
            path       : path
            cb         : (err, result) =>
                window.open(misc.encode_path(result.url))

    open_file: (opts) =>
        opts = defaults opts,
            path       : required
            foreground : true      # display in foreground as soon as possible

        ext = filename_extension(opts.path)

        if @public_access and not public_access_supported(opts.path)
            alert_message(type:"error", message: "Opening '#{opts.path}' publicly not yet supported.")
            return

        @editor.open opts.path, (err, opened_path) =>
            # {analytics_event} = require('./misc_page')
            if err
                # analytics_event('file', 'open', 'error', opts.path, {'nonInteraction': 1})
                alert_message(type:"error", message:"Error opening '#{opts.path}' -- #{misc.to_json(err)}", timeout:10)
            else
                # analytics_event('file', 'open', 'success', opts.path, {'nonInteraction': 1})
                if opts.foreground
                    @display_tab("project-editor")

                # make tab for this file actually visible in the editor
                @editor.display_tab
                    path       : opened_path
                    foreground : opts.foreground

    show_add_collaborators_box: () =>
        @display_tab('project-settings')

    download_file: (opts) =>
        opts = defaults opts,
            path    : required
            auto    : true
            timeout : 45
            cb      : undefined   # cb(err) when file download from browser starts -- instant since we use raw path

        if misc.filename_extension(opts.path) == 'pdf'
            # unfortunately, download_file doesn't work for pdf these days...
            opts.auto = false

        url = @download_href(opts.path)
        if opts.auto
            download_file(url)
        else
            window.open(url)

    download_href: (path) =>
        "#{window.smc_base_url}/#{@project_id}/raw/#{misc.encode_path(path)}"

project_pages = {}

# Function that returns the project page for the project with given id,
# or creates it if it doesn't exist.
project_page = exports.project_page = (project_id) ->
    if typeof(project_id) != 'string'
        throw Error('ProjectPage constructor now takes a string')
    p = project_pages[project_id]
    if p?
        return p
    p = project_pages[project_id] = new ProjectPage(project_id)
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