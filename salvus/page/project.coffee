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


{IS_MOBILE}     = require("feature")
{top_navbar}    = require('top_navbar')
{salvus_client} = require('salvus_client')
{alert_message} = require('alerts')
async           = require('async')
misc            = require('misc')
misc_page       = require('misc_page')

{flux}          = require('flux')

{filename_extension, defaults, required, to_json, from_json, trunc, keys, uuid} = misc
{file_associations, Editor, local_storage, public_access_supported} = require('editor')

{download_file} = misc_page

# How long to cache public paths in this project
PUBLIC_PATHS_CACHE_TIMEOUT_MS = 1000*60

##################################################
# Define the project page class
##################################################

class ProjectPage
    constructor: (@project) ->
        # whether or not we have full access to the project or only very limited
        # public access (since project is public)
        @public_access = !!@project.public_access


        # the html container for everything in the project.
        @container = $("#salvus-project-templates").find(".salvus-project").clone()
        @container.data('project', @)
        $("body").append(@container)

        # react initialization
        flux = require('flux').flux
        @actions = require('project_store').getActions(@project.project_id, flux)
        @store = require('project_store').getStore(@project.project_id, flux)

        flux.getActions('projects').set_project_state_open(@project.project_id)

        if @public_access
            @container.find(".salvus-project-write-access").hide()
            @container.find(".salvus-project-public-access").show()
        else
            @container.find(".salvus-project-write-access").show()
            @container.find(".salvus-project-public-access").hide()

        @init_new_tab_in_navbar()
        @init_tabs()
        @update_topbar()
        @create_editor()
        @init_sortable_editor_tabs()

    activity_indicator: () =>
        top_navbar.activity_indicator(@project.project_id)

    # call when project is closed completely
    destroy: () =>
        @save_browser_local_data()
        @container.empty()
        @editor?.destroy()
        delete project_pages[@project.project_id]
        @project_log?.disconnect_from_session()
        clearInterval(@_update_last_snapshot_time)
        @_cmdline?.unbind('keydown', @mini_command_line_keydown)
        delete @editor
        require('flux').flux.getActions('projects').set_project_state_close(@project.project_id)

    init_new_tab_in_navbar: () =>
        # Create a new tab in the top navbar (using top_navbar as a jquery plugin)
        @container.top_navbar
            id    : @project.project_id
            label : @project.project_id
            icon  : 'fa-edit'

            onclose : () =>
                @destroy()

            onblur: () =>
                @editor?.remove_handlers()
                require('flux').flux.getActions('projects').setTo(foreground_project:undefined) # TODO: temporary

            onshow: () =>
                if @project?
                    misc_page.set_window_title($("<div>").html(@project.title).text())
                    @push_state()
                @editor?.activate_handlers()
                @editor?.refresh()
                require('flux').flux.getActions('projects').setTo(foreground_project: @project.project_id) # TODO: temporary

            onfullscreen: (entering) =>
                if @project?
                    if entering
                        @hide_tabs()
                    else
                        @show_tabs()
                    $(window).resize()

        # Replace actual tab content by a React component that gets dynamically updated
        # when the project title is changed, and can display other information from the store.
        require('project_settings').init_top_navbar(@project.project_id)

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

    set_url_to_path: =>
        url_path = @store.get_current_path().join('/')
        if url_path.length > 0 and not misc.endswith(url_path, '/')
            url_path += '/'
        @push_state('files/' + url_path)

    push_state: (url) =>
        if not url?
            url = @_last_history_state
        if not url?
            url = ''
        @_last_history_state = url
        #if @project.name? and @project.owner?
            #window.history.pushState("", "", window.salvus_base_url + '/projects/' + @project.ownername + '/' + @project.name + '/' + url)
        # For now, we are just going to default to project-id based URL's, since they are stable and will always be supported.
        # I can extend to the above later in another release, without any harm.
        window.history.pushState("", "", window.salvus_base_url + '/projects/' + @project.project_id + '/' + misc.encode_path(url))
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
        #console.log("segments=",segments)
        switch segments[0]
            when 'files'
                if target[target.length-1] == '/'
                    # open a directory
                    #console.log("change to ", segments.slice(1, segments.length-1))
                    @set_current_path(segments.slice(1, segments.length-1))
                    @display_tab("project-file-listing")
                else
                    # open a file -- foreground option is relevant here.
                    if foreground
                        @set_current_path(segments.slice(1, segments.length-1))
                        @display_tab("project-editor")
                    @open_file
                        path       : segments.slice(1).join('/')
                        foreground : foreground
            when 'new'  # ignore foreground for these and below, since would be nonsense
                @set_current_path(segments.slice(1))
                @display_tab("project-new-file")
            when 'log'
                @display_tab("project-activity")
            when 'settings'
                @display_tab("project-settings")
            when 'search'
                @set_current_path(segments.slice(1))
                @display_tab("project-search")

    close: () =>
        top_navbar.remove_page(@project.project_id)

    # Reload the @project attribute from the database, and re-initialize
    # ui elements, mainly in settings.
    reload_settings: (cb) =>
        @project = flux.getStore('projects').get_project(@project.project_id)
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
                #console.log(mesg)
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
                    require('project_files').render_new(that.project.project_id, that.container.find(".smc-react-project-files")[0], flux)
                    that.set_url_to_path()
                tab.onblur = () ->
                    require('project_files').unmount(that.container.find(".smc-react-project-files")[0])
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
                    require('project_new').render_new(that.project.project_id, that.container.find(".smc-react-project-new")[0], flux)
                    that.push_state('new/' + that.store.state.current_path.join('/'))
                tab.onblur = ->
                    require('project_new').unmount(that.container.find(".smc-react-project-new")[0])
            else if name == "project-activity" and not @public_access
                tab.onshow = () =>
                    require('project_log').render_log(that.project.project_id, that.container.find(".smc-react-project-log")[0], flux)
                    that.editor?.hide_editor_content()
                    that.push_state('log')
                    # HORRIBLE TEMPORARY HACK since focus isn't working with react... yet  (TODO)
                    @container.find(".project-activity").find("input").focus()
                tab.onblur = ->
                    require('project_log').unmount(that.container.find(".smc-react-project-log")[0])

            else if name == "project-settings" and not @public_access
                tab.onshow = () ->
                    require('project_settings').create_page(that.project.project_id, that.container.find(".smc-react-project-settings")[0], flux)
                    that.editor?.hide_editor_content()
                    that.push_state('settings')
                    that.update_topbar()
                    url = document.URL
                    i = url.lastIndexOf("/settings")
                    if i != -1
                        url = url.slice(0,i)
                    that.container.find(".salvus-settings-url").val(url)
                tab.onblur = ->
                    require('project_settings').unmount(that.container.find(".smc-react-project-settings")[0])

            else if name == "project-search" and not @public_access
                tab.onshow = () ->
                    require('project_search').render_project_search(that.project.project_id, that.container.find(".smc-react-project-search")[0], flux)
                    that.editor?.hide_editor_content()
                    that.push_state('search/' + that.store.state.current_path.join('/'))
                    that.container.find(".project-search-form-input").focus()
                tab.onblur = ->
                    require('project_search').unmount(that.container.find(".smc-react-project-search")[0])


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
            else if tab.name == @_last_display_tab_name
                tab.onblur?()
                tab.target.hide()
        @_last_display_tab_name = name

        if name == 'project-new-file'
            @actions.set_next_default_filename(require('account').default_filename())

        if name == 'project-file-listing'
            #temporary
            sort_by_time = @store.state.sort_by_time ? true
            show_hidden = @store.state.show_hidden ? false
            @actions.set_directory_files(@store.state.current_path, sort_by_time, show_hidden)
        if name != 'project-editor'
            @editor?.hide()
            @editor?.resize_open_file_tabs()

    show_editor_chat_window: (path) =>
        @editor?.show_chat_window(path)

    save_browser_local_data: (cb) =>
        @editor.save(undefined, cb)

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

        label = $("<div>").html(@project.title).text()  # plain text for this...
        top_navbar.set_button_label(@project.project_id, label)
        misc_page.set_window_title(label)

        return @

    # Return the string representation of the current path, as a
    # relative path from the root of the project.
    current_pathname: () => @store.state.current_path.join('/')

    # Set the current path array from a path string to a directory
    set_current_path: (path) =>
        path = @_parse_path(path)
        if not underscore.isEqual(path, @store.state.current_path)
            require('flux').flux.getProjectActions(@project.project_id).set_current_path(path)

    _parse_path: (path) =>
        if not path?
            return []
        else if typeof(path) == "string"
            while path[path.length-1] == '/'
                path = path.slice(0,path.length-1)
            v = []
            for segment in path.split('/')
                if segment.length > 0
                    v.push(segment)
            return v
        else
            return path[..]  # copy the path

    focus: () =>
        if not IS_MOBILE  # do *NOT* do on mobile, since is very annoying to have a keyboard pop up.
            switch @current_tab.name
                when "project-file-listing"
                    @container.find(".salvus-project-search-for-file-input").focus()
                #when "project-editor"
                #    @editor.focus()

    default_filename: (ext) =>
        return require('account').default_filename(ext)

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

    #***************************************
    # public paths
    #***************************************
    publish_path: (opts) =>
        opts = defaults opts,
            path        : required
            description : undefined  # if undefined, user will be interactively queried
            cb          : undefined

        salvus_client.publish_path
            project_id  : @project.project_id
            path        : opts.path
            description : opts.description
            cb          : (err) =>
                delete @_public_paths_cache
                opts.cb?(err)

    unpublish_path: (opts)=>
        opts = defaults opts,
            path : required
            cb   : undefined
        salvus_client.unpublish_path
            project_id : @project.project_id
            path       : opts.path
            cb         : (err) =>
                delete @_public_paths_cache
                opts.cb?(err)

    is_path_published: (opts)=>
        opts = defaults opts,
            path : required
            cb   : required     # cb(err, undefined or {public_path:..., path:path, description:description})
        @paths_that_are_public
            paths : [opts.path]
            cb    : (err, v) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, v[0])

    # return public paths in this project; cached for a while
    _public_paths: (cb) =>    # cb(err, [{path:., description:.}])
        if @_public_paths_cache?
            cb(undefined, @_public_paths_cache)
        else
            salvus_client.get_public_paths
                project_id : @project.project_id
                cb         : (err, public_paths) =>
                    if err
                        cb(err)
                    else
                        @_public_paths_cache = public_paths
                        setTimeout((()=>delete @_public_paths_cache), PUBLIC_PATHS_CACHE_TIMEOUT_MS)
                        cb(undefined, public_paths)


    # given a list of paths, returns list of those that are public; more
    # precisely, returns list of {path:., description:.} of those that are
    # public.
    paths_that_are_public: (opts) =>
        opts = defaults opts,
            paths : required
            cb    : required     # cb(err, )
        @_public_paths (err, public_paths) =>
            if err
                opts.cb(err)
            else
                v = []
                for path in opts.paths
                    q = misc.path_is_in_public_paths(path, public_paths)
                    if q
                        v.push({path:path, description:q.description, public_path:q.path})
                opts.cb(undefined, v)

    open_file_in_another_browser_tab: (path) =>
        salvus_client.read_file_from_project
            project_id : @project.project_id
            path       : path
            cb         : (err, result) =>
                window.open(misc.encode_path(result.url))

    open_file: (opts) =>
        opts = defaults opts,
            path       : required
            foreground : true      # display in foreground as soon as possible

        ext = filename_extension(opts.path)

        if @public_access and not public_access_supported(opts.path)
            console.log("Public projects not implemented yet; dialog deleted")
            @file_action_dialog
                fullname : opts.path
                isdir    : false
            return

        @editor.open opts.path, (err, opened_path) =>
            if err
                # ga('send', 'event', 'file', 'open', 'error', opts.path, {'nonInteraction': 1})
                alert_message(type:"error", message:"Error opening '#{opts.path}' -- #{misc.to_json(err)}", timeout:10)
            else
                # ga('send', 'event', 'file', 'open', 'success', opts.path, {'nonInteraction': 1})
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

        url = "#{window.salvus_base_url}/#{@project.project_id}/raw/#{misc.encode_path(opts.path)}"
        if opts.auto
            download_file(url)
        else
            window.open(url)

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