###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
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

async      = require('async')
underscore = require('underscore')
immutable  = require('immutable')

# At most this many of the most recent log messages for a project get loaded:
MAX_PROJECT_LOG_ENTRIES = 5000

misc      = require('smc-util/misc')
{MARKERS} = require('smc-util/sagews')
{alert_message} = require('./alerts')
{salvus_client} = require('./salvus_client')
{defaults, required} = misc

{Actions, Store, Table, register_project_store, redux}  = require('./smc-react')

# Register this module with the redux module, so it can be used by the reset of SMC easily.
register_project_store(exports)

project_file = require('project_file')
wrapped_editors = require('editor_react_wrapper')

masked_file_exts =
    'py'   : ['pyc']
    'java' : ['class']
    'cs'   : ['exe']
    'tex'  : 'aux bbl blg fdb_latexmk glo idx ilg ind lof log nav out snm synctex.gz toc xyc'.split(' ')

BAD_FILENAME_CHARACTERS       = '\\'
BAD_LATEX_FILENAME_CHARACTERS = '\'"()"~%'
BANNED_FILE_TYPES             = ['doc', 'docx', 'pdf', 'sws']

FROM_WEB_TIMEOUT_S = 45

QUERIES =
    project_log :
        query :
            project_id : null
            account_id : null
            time       : null  # if we wanted to only include last month.... time       : -> {">=":misc.days_ago(30)}
            event      : null
        options : [{order_by:'-time'}, {limit:MAX_PROJECT_LOG_ENTRIES}]

    public_paths :
        query :
            id          : null
            project_id  : null
            path        : null
            description : null
            disabled    : null

must_define = (redux) ->
    if not redux?
        throw Error('you must explicitly pass a redux object into each function in project_store')

# Name used by the project_store for the sub-stores corresponding to that project.
exports.redux_name = key = (project_id, name) ->
    s = "project-#{project_id}"
    if name?
        s += "-#{name}"
    return s


class ProjectActions extends Actions
    _ensure_project_is_open : (cb, switch_to) =>
        s = @redux.getStore('projects')
        if not s.is_project_open(@project_id)
            @redux.getActions('projects').open_project(project_id:@project_id, switch_to:true)
            s.wait_until_project_is_open(@project_id, 30, cb)
        else
            cb()

    get_store : =>
        return @redux.getStore(@name)

    clear_all_activity : =>
        @setState(activity:undefined)

    set_url_to_path: (current_path) =>
        if current_path.length > 0 and not misc.endswith(current_path, '/')
            current_path += '/'
        @push_state('files/' + current_path)

    push_state: (url) =>
        {set_url} = require('./history')
        if not url?
            url = @_last_history_state
        if not url?
            url = ''
        @_last_history_state = url
        set_url('/projects/' + @project_id + '/' + misc.encode_path(url))
        {analytics_pageview} = require('./misc_page')
        analytics_pageview(window.location.pathname)

    move_file_tab : (opts) =>
        {old_index, new_index, open_files_order} = defaults opts,
            old_index : required
            new_index : required
            open_files_order: required # immutable

        x = open_files_order
        item = x.get(old_index)
        temp_list = x.delete(old_index)
        new_list = temp_list.splice(new_index, 0, item)
        @setState(open_files_order:new_list)

    close_tab : (path) =>
        open_files_order = @get_store().get('open_files_order')
        active_project_tab = @get_store().get('active_project_tab')
        closed_index = open_files_order.indexOf(path)
        size = open_files_order.size
        if misc.path_to_tab(path) == active_project_tab
            if size == 1
                next_active_tab = 'files'
            else
                if closed_index == size - 1
                    next_active_tab = misc.path_to_tab(open_files_order.get(closed_index - 1))
                else
                    next_active_tab = misc.path_to_tab(open_files_order.get(closed_index + 1))
            @set_active_tab(next_active_tab)
        if closed_index == size - 1
            @clear_ghost_file_tabs()
        else
            @add_a_ghost_file_tab()
        @close_file(path)

    # Expects one of ['files', 'new', 'log', 'search', 'settings']
    #            or a file_redux_name
    set_active_tab : (key) =>
        @setState(active_project_tab : key)
        switch key
            when 'files'
                @set_url_to_path(@get_store().get('current_path') ? '')
                store = @get_store()
                sort_by_time = store.get('sort_by_time') ? true
                show_hidden = store.get('show_hidden') ? false
                @set_directory_files(store.get('current_path'), sort_by_time, show_hidden)
            when 'new'
                @push_state('new/' + @get_store().get('current_path'))
                @set_next_default_filename(require('./account').default_filename())
            when 'log'
                @push_state('log')
            when 'search'
                @push_state('search/' + @get_store().get('current_path'))
            when 'settings'
                @push_state('settings')
            else #editor...
                @push_state('files/' + misc.tab_to_path(key))
                @set_current_path(misc.path_split(misc.tab_to_path(key)).head)

    add_a_ghost_file_tab : () =>
        current_num = @get_store().get('num_ghost_file_tabs')
        @setState(num_ghost_file_tabs : current_num + 1)

    clear_ghost_file_tabs : =>
        @setState(num_ghost_file_tabs : 0)

    set_editor_top_position : (pos) =>
        @setState(editor_top_position : pos)

    set_next_default_filename : (next) =>
        @setState(default_filename: next)

    set_activity : (opts) =>
        opts = defaults opts,
            id     : required     # client must specify this, e.g., id=misc.uuid()
            status : undefined    # status update message during the activity -- description of progress
            stop   : undefined    # activity is done  -- can pass a final status message in.
            error  : undefined    # describe an error that happened
        store = @get_store()
        if not store?  # if store not initialized we can't set activity
            return
        x = store.get('activity')?.toJS()
        if not x?
            x = {}
        # Actual implemenation of above specified API is VERY minimal for
        # now -- just enough to display something to user.
        if opts.status?
            x[opts.id] = opts.status
            @setState(activity: x)
        if opts.error?
            error = opts.error
            if error == ''
                @setState(error:error)
            else
                @setState(error:((store.get('error') ? '') + '\n' + error).trim())
        if opts.stop?
            if opts.stop
                x[opts.id] = opts.stop  # of course, just gets deleted below but that is because use is simple still
            delete x[opts.id]
            @setState(activity: x)
        return

    # report a log event to the backend -- will indirectly result in a new entry in the store...
    log : (event) =>
        if @redux.getStore('projects').get_my_group(@project_id) in ['public', 'admin']
            # Ignore log events for *both* admin and public.
            # Admin gets to be secretive (also their account_id --> name likely wouldn't be known to users).
            # Public users don't log anything.
            return # ignore log events
        require('./salvus_client').salvus_client.query
            query :
                project_log :
                    project_id : @project_id
                    time       : new Date()
                    event      : event
            cb : (err) =>
                if err
                    # TODO: what do we want to do if a log doesn't get recorded?
                    console.log('error recording a log entry: ', err)


    open_file: (opts) =>
        opts = defaults opts,
            path               : required
            foreground         : true      # display in foreground as soon as possible
            foreground_project : true
            chat               : false
        @_ensure_project_is_open (err) =>
            if err
                @set_activity(id:misc.uuid(), error:"opening file -- #{err}")
            else
                # We wait here so that the editor gets properly initialized in the
                # ProjectPage constructor.  Really this should probably be
                # something we wait on with _ensure_project_is_open. **TODO** This should
                # go away when we get rid of the ProjectPage entirely, when finishing
                # the React rewrite.
                @redux.getStore('projects').wait
                    until   : (s) => s.get_my_group(@project_id)
                    timeout : 60
                    cb      : (err, group) =>
                        if err
                            @set_activity
                                id    : misc.uuid()
                                error : "opening file -- #{err}"
                            return

                        is_public = group == 'public'

                        ext = misc.filename_extension_notilde(opts.path).toLowerCase()

                        if not is_public and (ext == "sws" or ext.slice(0,4) == "sws~")
                            # sagenb worksheet (or backup of it created during unzip of multiple worksheets with same name)
                            alert_message(type:"info",message:"Opening converted SageMathCloud worksheet file instead of '#{opts.path}...")
                            @convert_sagenb_worksheet opts.path, (err, sagews_filename) =>
                                if not err
                                    @open_file
                                        path : sagews_filename
                                        forgeound : opts.foreground
                                        foreground_project : opts.foreground_project
                                        chat : opts.chat
                                else
                                    require('./alerts').alert_message(type:"error",message:"Error converting Sage Notebook sws file -- #{err}")
                            return

                        if not is_public and ext == "docx"   # Microsoft Word Document
                            alert_message(type:"info", message:"Opening converted plain text file instead of '#{opts.path}...")
                            @convert_docx_file opts.path, (err, new_filename) =>
                                if not err
                                    @open_file
                                        path : new_filename
                                        forgeound : opts.foreground
                                        foreground_project : opts.foreground_project
                                        chat : opts.chat
                                else
                                    require('./alerts').alert_message(type:"error",message:"Error converting Microsoft docx file -- #{err}")
                            return

                        if not is_public
                            # the ? is because if the user is anonymous they don't have a file_use Actions (yet)
                            @redux.getActions('file_use')?.mark_file(@project_id, opts.path, 'open')

                            @log
                                event     : 'open'
                                action    : 'open'
                                filename  : opts.path

                        store = @get_store()
                        if not store?  # if store not initialized we can't set activity
                            return
                        open_files = store.get_open_files()

                        if open_files.has(opts.path) # Already opened
                            if opts.foreground
                                @foreground_opened_file(opts.path)
                            return

                        open_files_order = store.get_open_files_order()

                        # Initialize the file's store and actions
                        name = project_file.initialize(opts.path, @redux, @project_id, is_public)

                        # Make the editor
                        editor = project_file.generate(opts.path, @redux, @project_id, is_public)
                        editor.redux_name = name
                        editor.is_public  = is_public

                        # Add it to open files
                        @setState
                            open_files       : open_files.setIn([opts.path, 'component'], editor)
                            open_files_order : open_files_order.push(opts.path)

                        if opts.foreground
                            @foreground_opened_file(opts.path)
        return

    flag_file_activity: (filename) =>
        if not @_activity_indicator_timers?
            @_activity_indicator_timers = {}
        timer = @_activity_indicator_timers[filename]
        if timer?
            clearTimeout(timer)

        open_files = @get_store().get('open_files')
        set_inactive = () =>
            new_files_data = open_files.setIn([filename, 'has_activity'], false)
            @setState(open_files : new_files_data)

        @_activity_indicator_timers[filename] = setTimeout(set_inactive, 1000)

        new_files_data = open_files.setIn([filename, 'has_activity'], true)
        @setState(open_files : new_files_data)

    foreground_opened_file : (path) =>
        @foreground_project(@project_id)
        @set_active_tab(misc.path_to_tab(path))

    convert_sagenb_worksheet: (filename, cb) =>
        async.series([
            (cb) =>
                ext = misc.filename_extension(filename)
                if ext == "sws"
                    cb()
                else
                    i = filename.length - ext.length
                    new_filename = filename.slice(0, i-1) + ext.slice(3) + '.sws'
                    salvus_client.exec
                        project_id : @project_id
                        command    : "cp"
                        args       : [filename, new_filename]
                        cb         : (err, output) =>
                            if err
                                cb(err)
                            else
                                filename = new_filename
                                cb()
            (cb) =>
                salvus_client.exec
                    project_id : @project_id
                    command    : "smc-sws2sagews"
                    args       : [filename]
                    cb         : (err, output) =>
                        cb(err)
        ], (err) =>
            if err
                cb(err)
            else
                cb(undefined, filename.slice(0,filename.length-3) + 'sagews')
        )

    convert_docx_file: (filename, cb) =>
        salvus_client.exec
            project_id : @project_id
            command    : "smc-docx2txt"
            args       : [filename]
            cb         : (err, output) =>
                if err
                    cb("#{err}, #{misc.to_json(output)}")
                else
                    cb(false, filename.slice(0,filename.length-4) + 'txt')

    # Closes all files and removes all references
    close_all_files : () =>
        file_paths = @get_store().get_open_files_order()
        if file_paths.isEmpty()
            return

        open_files = @get_store().get('open_files')
        empty = file_paths.filter (path) =>
            is_public = open_files.getIn([path, 'component'])?.is_public
            project_file.remove(path, @redux, @project_id, is_public)
            return false

        @setState(open_files_order : empty, open_files : {})

    # closes the file and removes all references
    close_file : (path) =>
        x = @get_store().get_open_files_order()
        index = x.indexOf(path)
        if index != -1
            @setState
                open_files_order : x.delete(index)
                open_files       : @get_store().get('open_files').delete(path)
            open_files = @get_store().get('open_files')
            is_public = open_files.getIn([path, 'component'])?.is_public
            project_file.remove(path, @redux, @project_id, is_public)

    foreground_project : =>
        @_ensure_project_is_open (err) =>
            if err
                # TODO!
                console.log('error putting project in the foreground: ', err, @project_id, path)
            else
                @redux.getActions('projects').foreground_project(@project_id)

    open_directory : (path) =>
        @_ensure_project_is_open (err) =>
            if err
                # TODO!
                console.log('error opening directory in project: ', err, @project_id, path)
            else
                @foreground_project()
                @set_current_path(path, update_file_listing=true)
                @set_active_tab('files')

    set_current_path : (path, update_file_listing=false) =>
        # SMELL: Track from history.coffee
        if path is NaN
            path = ''
        path ?= ''
        if typeof path != 'string'
            window.cpath_args = arguments
            throw "Current path should be a string. Revieved arguments are available in window.cpath_args"
        # Set the current path for this project. path is either a string or array of segments.
        @setState
            current_path           : path
            page_number            : 0
            most_recent_file_click : undefined
        if update_file_listing
            @set_directory_files(path)
            @set_all_files_unchecked()

    set_file_search : (search) =>
        @setState
            file_search            : search
            page_number            : 0
            file_action            : undefined
            most_recent_file_click : undefined
            create_file_alert      : false

    # Update the directory listing cache for the given path
    # Use current path if path not provided
    set_directory_files : (path, sort_by_time, show_hidden) =>
        if not path?
            path = @get_store().get('current_path')

        if not @_set_directory_files_lock?
            @_set_directory_files_lock = {}
        _key = "#{path}-#{sort_by_time}-#{show_hidden}"
        if @_set_directory_files_lock[_key]  # currently doing it already
            return
        @_set_directory_files_lock[_key] = true
        # Wait until user is logged in, project store is loaded enough
        # that we know our relation to this project, namely so that
        # get_my_group is defined.
        id = misc.uuid()
        @set_activity(id:id, status:"getting file listing for #{misc.trunc_middle(path,30)}...")
        group   = undefined
        listing = undefined
        async.series([
            (cb) =>
                # make sure that our relationship to this project is known.
                @redux.getStore('projects').wait
                    until   : (s) => s.get_my_group(@project_id)
                    timeout : 30
                    cb      : (err, x) =>
                        group = x; cb(err)
            (cb) =>
                store = @get_store()
                if not store?
                    cb("store no longer defined"); return
                path         ?= (store.get('current_path') ? "")
                sort_by_time ?= (store.get('sort_by_time') ? true)
                show_hidden  ?= (store.get('show_hidden') ? false)
                get_directory_listing
                    project_id : @project_id
                    path       : path
                    time       : sort_by_time
                    hidden     : show_hidden
                    max_time_s : 4*60  # keep trying for up to 4 minutes
                    group      : group
                    cb         : (err, x) =>
                        listing = x
                        cb(err)
        ], (err) =>
            @set_activity(id:id, stop:'')
            # Update the path component of the immutable directory listings map:
            store = @get_store()
            if not store?
                return
            map = store.get_directory_listings().set(path, if err then misc.to_json(err) else immutable.fromJS(listing.files))
            @setState(directory_listings : map)
            delete @_set_directory_files_lock[_key] # done!
        )

    # Increases the selected file index by 1
    # Assumes undefined state to be identical to 0
    increment_selected_file_index : ->
        current_index = @get_store().get('selected_file_index') ? 0
        @setState(selected_file_index : current_index + 1)

    # Decreases the selected file index by 1.
    # Guaranteed to never set below 0.
    decrement_selected_file_index : ->
        current_index = @get_store().get('selected_file_index')
        if current_index? and current_index > 0
            @setState(selected_file_index : current_index - 1)

    reset_selected_file_index : ->
        @setState(selected_file_index : 0)

    # Set the most recently clicked checkbox, expects a full/path/name
    set_most_recent_file_click : (file) =>
        @setState(most_recent_file_click : file)

    # Set the selected state of all files between the most_recent_file_click and the given file
    set_selected_file_range : (file, checked) =>
        store = @get_store()
        most_recent = store.get('most_recent_file_click')
        if not most_recent?
            # nothing had been clicked before, treat as normal click
            range = [file]
        else
            # get the range of files
            current_path = store.get('current_path')
            names = (misc.path_to_file(current_path, a.name) for a in store.get_displayed_listing().listing)
            range = misc.get_array_range(names, most_recent, file)

        if checked
            @set_file_list_checked(range)
        else
            @set_file_list_unchecked(range)

    # set the given file to the given checked state
    set_file_checked : (file, checked) =>
        store = @get_store()
        if checked
            checked_files = store.get('checked_files').add(file)
        else
            checked_files = store.get('checked_files').delete(file)

        @setState
            checked_files : checked_files
            file_action   : undefined

    # check all files in the given file_list
    set_file_list_checked : (file_list) =>
        @setState
            checked_files : @get_store().get('checked_files').union(file_list)
            file_action   : undefined

    # uncheck all files in the given file_list
    set_file_list_unchecked : (file_list) =>
        @setState
            checked_files : @get_store().get('checked_files').subtract(file_list)
            file_action   : undefined

    # uncheck all files
    set_all_files_unchecked : =>
        @setState
            checked_files : @get_store().get('checked_files').clear()
            file_action   : undefined

    set_file_action : (action) =>
        if action == 'move'
            @redux.getActions('projects').fetch_directory_tree(@project_id)
        @setState(file_action : action)

    ensure_directory_exists: (opts) =>
        opts = defaults opts,
            path  : required
            cb    : undefined  # cb(true or false)
            alert : true
        salvus_client.exec
            project_id : @project_id
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

    get_from_web : (opts) =>
        opts = defaults opts,
            url     : required
            dest    : undefined
            timeout : 45
            alert   : true
            cb      : undefined     # cb(true or false, depending on error)

        {command, args} = misc.transform_get_url(opts.url)

        require('./salvus_client').salvus_client.exec
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

    # function used internally by things that call salvus_client.exec
    _finish_exec : (id) =>
        # returns a function that takes the err and output and does the right activity logging stuff.
        return (err, output) =>
            @set_directory_files()
            if err
                @set_activity(id:id, error:err)
            else if output?.event == 'error' or output?.error
                @set_activity(id:id, error:output.error)
            @set_activity(id:id, stop:'')

    zip_files : (opts) =>
        opts = defaults opts,
            src      : required
            dest     : required
            zip_args : undefined
            path     : undefined   # default to root of project
            id       : undefined
        id = opts.id ? misc.uuid()
        @set_activity(id:id, status:"Creating #{opts.dest} from #{opts.src.length} #{misc.plural(opts.src.length, 'file')}")
        args = (opts.zip_args ? []).concat(['-rq'], [opts.dest], opts.src)
        salvus_client.exec
            project_id      : @project_id
            command         : 'zip'
            args            : args
            timeout         : 50
            network_timeout : 60
            err_on_exit     : true    # this should fail if exit_code != 0
            path            : opts.path
            cb              : @_finish_exec(id)

    copy_files : (opts) =>
        opts = defaults opts,
            src  : required     # Should be an array of source paths
            dest : required
            id   : undefined

        # If files start with a -, make them interpretable by rsync (see https://github.com/sagemathinc/smc/issues/516)
        deal_with_leading_dash = (src_path) ->
            if src_path[0] == '-'
                return "./#{src_path}"
            else
                return src_path

        # Ensure that src files are not interpreted as an option to rsync
        opts.src = opts.src.map(deal_with_leading_dash)

        id = opts.id ? misc.uuid()
        @set_activity(id:id, status:"Copying #{opts.src.length} #{misc.plural(opts.src.length, 'file')} to #{opts.dest}")
        @log
            event  : 'file_action'
            action : 'copied'
            files  : opts.src[0...3]
            count  : if opts.src.length > 3 then opts.src.length
            dest   : opts.dest
        salvus_client.exec
            project_id      : @project_id
            command         : 'rsync'  # don't use "a" option to rsync, since on snapshots results in destroying project access!
            args            : ['-rltgoDxH', '--backup', '--backup-dir=.trash/'].concat(opts.src).concat([opts.dest])
            timeout         : 120   # how long rsync runs on client
            network_timeout : 120   # how long network call has until it must return something or get total error.
            err_on_exit     : true
            path            : '.'
            cb              : @_finish_exec(id)

    copy_paths_between_projects: (opts) =>
        opts = defaults opts,
            public            : false
            src_project_id    : required    # id of source project
            src               : required    # list of relative paths of directors or files in the source project
            target_project_id : required    # if of target project
            target_path       : undefined   # defaults to src_path
            overwrite_newer   : false       # overwrite newer versions of file at destination (destructive)
            delete_missing    : false       # delete files in dest that are missing from source (destructive)
            backup            : false       # make ~ backup files instead of overwriting changed files
            timeout           : undefined   # how long to wait for the copy to complete before reporting "error" (though it could still succeed)
            exclude_history   : false       # if true, exclude all files of the form *.sage-history
            id                : undefined
        # TODO: wrote this but *NOT* tested yet -- needed "copy_click".
        id = opts.id ? misc.uuid()
        @set_activity(id:id, status:"Copying #{opts.src.length} #{misc.plural(opts.src.length, 'path')} to another project")
        src = opts.src
        delete opts.src
        @log
            event   : 'file_action'
            action  : 'copied'
            files   : src[0...3]
            count   : if src.length > 3 then src.length
            dest    : opts.dest
            project : opts.target_project_id
        f = (src_path, cb) =>
            opts0 = misc.copy(opts)
            opts0.cb = cb
            opts0.src_path = src_path
            # we do this for consistent semantics with file copy
            opts0.target_path = misc.path_to_file(opts0.target_path, misc.path_split(src_path).tail)
            salvus_client.copy_path_between_projects(opts0)
        async.mapLimit(src, 3, f, @_finish_exec(id))

    _move_files : (opts) =>  #PRIVATE -- used internally to move files
        opts = defaults opts,
            src     : required
            dest    : required
            path    : undefined   # default to root of project
            mv_args : undefined
            cb      : required
        if not opts.dest and not opts.path?
            opts.dest = '.'

        salvus_client.exec
            project_id      : @project_id
            command         : 'mv'
            args            : (opts.mv_args ? []).concat(['--'], opts.src, [opts.dest])
            timeout         : 15      # move should be fast..., unless across file systems.
            network_timeout : 20
            err_on_exit     : true    # this should fail if exit_code != 0
            path            : opts.path
            cb              : opts.cb

    move_files : (opts) =>
        opts = defaults opts,
            src     : required    # Array of src paths to mv
            dest    : required    # Single dest string
            path    : undefined   # default to root of project
            mv_args : undefined
            id      : undefined
        id = opts.id ? misc.uuid()
        @set_activity(id:id, status: "Moving #{opts.src.length} #{misc.plural(opts.src.length, 'file')} to #{opts.dest}")
        delete opts.id
        opts.cb = (err) =>
            if err
                @set_activity(id:id, error:err)
            else
                @set_directory_files()
            @log
                event  : 'file_action'
                action : 'moved'
                files  : opts.src[0...3]
                count  : if opts.src.length > 3 then opts.src.length
                dest   : opts.dest
            @set_activity(id:id, stop:'')
        @_move_files(opts)

    delete_files : (opts) =>
        opts = defaults opts,
            paths : required
        if opts.paths.length == 0
            return
        id = misc.uuid()
        if underscore.isEqual(opts.paths, ['.trash'])
            mesg = "the trash"
        else if opts.paths.length == 1
            mesg = "#{opts.paths[0]}"
        else
            mesg = "#{opts.paths.length} files"
        @set_activity(id:id, status: "Deleting #{mesg}")
        salvus_client.exec
            project_id : @project_id
            command    : 'rm'
            timeout    : 60
            args       : ['-rf', '--'].concat(opts.paths)
            cb         : (err, result) =>
                if err
                    @set_activity(id:id, error: "Network error while trying to delete #{mesg} -- #{err}", stop:'')
                else if result.event == 'error'
                    @set_activity(id:id, error: "Error deleting #{mesg} -- #{result.error}", stop:'')
                else
                    @set_activity(id:id, status:"Successfully deleted #{mesg}.", stop:'')
                    @log
                        event  : 'file_action'
                        action : 'deleted'
                        files  : opts.paths[0...3]
                        count  : if opts.paths.length > 3 then opts.paths.length


    download_file : (opts) =>
        {download_file} = require('./misc_page')
        opts = defaults opts,
            path    : required
            log     : false
            auto    : true
            timeout : 45
            cb      : undefined   # cb(err) when file download from browser starts -- instant since we use raw path
        if opts.log
            @log
                event  : 'file_action'
                action : 'downloaded'
                files  : opts.path
        if misc.filename_extension(opts.path) == 'pdf'
            # unfortunately, download_file doesn't work for pdf these days...
            opts.auto = false

        url = "#{window.smc_base_url}/#{@project_id}/raw/#{misc.encode_path(opts.path)}"
        if opts.auto
            download_file(url)
        else
            window.open(url)

    download_href: (path) =>
        return "#{window.smc_base_url}/#{@project_id}/raw/#{misc.encode_path(path)}?download"

    # This is the absolute path to the file with given name but with the
    # given extension added to the file (e.g., "md") if the file doesn't have
    # that extension.  If the file contains invalid characters this function
    # will call on_error (if given) and return ''.
    path : (name, current_path, ext, on_empty, on_error) =>
        if name.length == 0
            if on_empty?
                on_empty()
                return ''
            name = require('./account').default_filename()
        for bad_char in BAD_FILENAME_CHARACTERS
            if name.indexOf(bad_char) != -1
                err = "Cannot use '#{bad_char}' in a filename"
                on_error?(err)
                if not on_error?
                    console.warn(err)
                return ''
        s = misc.path_to_file(current_path, name)
        if ext? and misc.filename_extension(s) != ext
            s = "#{s}.#{ext}"
        return s

    create_folder : (opts) =>
        opts = defaults opts,
            name         : required
            current_path : undefined
            on_error     : undefined
            switch_over  : true       # Whether or not to switch to the new folder
        {name, current_path, on_error, switch_over} = opts

        if name[name.length - 1] == '/'
            name = name.slice(0, -1)
        p = @path(name, current_path, undefined, undefined, on_error)
        if p.length == 0
            return
        @ensure_directory_exists
            path : p
            cb   : (err) =>
                if not err and switch_over
                    #TODO reporting of errors...
                    @set_current_path(p, update_file_listing=true)
                    @set_active_tab('files')

    create_file : (opts) =>
        opts = defaults opts,
            name         : undefined
            ext          : undefined
            current_path : undefined
            on_download  : undefined
            on_error     : undefined
            on_empty     : undefined
            switch_over  : true       # Whether or not to switch to the new file
        name = opts.name
        if (name == ".." or name == ".") and not opts.ext?
            opts.on_error?("Cannot create a file named . or ..")
            return
        if name.indexOf('://') != -1 or misc.startswith(name, 'git@github.com')
            opts.on_download?(true)
            @new_file_from_web name, opts.current_path, () =>
                opts.on_download?(false)
            return
        if name[name.length - 1] == '/'
            if not opts.ext?
                @create_folder
                    name          : name
                    current_path  : opts.current_path
                    on_error      : opts.on_error
                return
            else
                name = name.slice(0, name.length - 1)
        p = @path(name, opts.current_path, opts.ext, opts.on_empty, opts.on_error)
        if not p
            return
        ext = misc.filename_extension(p)
        if ext in BANNED_FILE_TYPES
            opts.on_error?("Cannot create a file with the #{ext} extension")
            return
        if ext == 'tex'
            for bad_char in BAD_LATEX_FILENAME_CHARACTERS
                if p.indexOf(bad_char) != -1
                    opts.on_error?("Cannot use '#{bad_char}' in a LaTeX filename")
                    return
        if p.length == 0
            return
        salvus_client.exec
            project_id  : @project_id
            command     : 'smc-new-file'
            timeout     : 10
            args        : [p]
            err_on_exit : true
            cb          : (err, output) =>
                if err
                    opts.on_error?("#{output?.stdout ? ''} #{output?.stderr ? ''} #{err}")
                else if opts.switch_over
                    @open_file
                        path : p

    new_file_from_web : (url, current_path, cb) =>
        d = current_path
        if d == ''
            d = 'root directory of project'
        id = misc.uuid()
        @set_active_tab('files')
        @set_activity
            id:id
            status:"Downloading '#{url}' to '#{d}', which may run for up to #{FROM_WEB_TIMEOUT_S} seconds..."
        @get_from_web
            url     : url
            dest    : current_path
            timeout : FROM_WEB_TIMEOUT_S
            alert   : true
            cb      : (err) =>
                @set_directory_files()
                @set_activity(id: id, stop:'')
                cb?(err)

    ###
    # Actions for PUBLIC PATHS
    ###
    set_public_path: (path, description) =>
        obj = {project_id:@project_id, path:path, disabled:false}
        if description?
            obj.description = description
        @redux.getProjectTable(@project_id, 'public_paths').set(obj)

    disable_public_path: (path) =>
        @redux.getProjectTable(@project_id, 'public_paths').set(project_id:@project_id, path:path, disabled:true)


    ###
    # Actions for Project Search
    ###

    toggle_search_checkbox_subdirectories : =>
        @setState(subdirectories : not @get_store().get('subdirectories'))

    toggle_search_checkbox_case_sensitive : =>
        @setState(case_sensitive : not @get_store().get('case_sensitive'))

    toggle_search_checkbox_hidden_files : =>
        @setState(hidden_files : not @get_store().get('hidden_files'))

    process_results : (err, output, max_results, max_output, cmd) =>
        store = @get_store()
        if (err and not output?) or (output? and not output.stdout?)
            @setState(search_error : err)
            return

        results = output.stdout.split('\n')
        too_many_results = output.stdout.length >= max_output or results.length > max_results or err
        num_results = 0
        search_results = []
        for line in results
            if line.trim() == ''
                continue
            i = line.indexOf(':')
            num_results += 1
            if i isnt -1
                # all valid lines have a ':', the last line may have been truncated too early
                filename = line.slice(0, i)
                if filename.slice(0, 2) == './'
                    filename = filename.slice(2)
                context = line.slice(i + 1)
                # strip codes in worksheet output
                if context.length > 0 and context[0] == MARKERS.output
                    i = context.slice(1).indexOf(MARKERS.output)
                    context = context.slice(i + 2, context.length - 1)

                search_results.push
                    filename    : filename
                    description : context

            if num_results >= max_results
                break

        if store.get('command') is cmd # only update the state if the results are from the most recent command
            @setState
                too_many_results : too_many_results
                search_results   : search_results

    search : =>
        store = @get_store()

        query = store.get('user_input').trim().replace(/"/g, '\\"')
        if query is ''
            return
        search_query = '"' + query + '"'

        # generate the grep command for the given query with the given flags
        if store.get('case_sensitive')
            ins = ''
        else
            ins = ' -i '

        if store.get('subdirectories')
            if store.get('hidden_files')
                cmd = "rgrep -I -H --exclude-dir=.smc --exclude-dir=.snapshots #{ins} #{search_query} -- *"
            else
                cmd = "rgrep -I -H --exclude-dir='.*' --exclude='.*' #{ins} #{search_query} -- *"
        else
            if store.get('hidden_files')
                cmd = "grep -I -H #{ins} #{search_query} -- .* *"
            else
                cmd = "grep -I -H #{ins} #{search_query} -- *"

        cmd += " | grep -v #{MARKERS.cell}"
        max_results = 1000
        max_output  = 110 * max_results  # just in case

        @setState
            search_results     : undefined
            search_error       : undefined
            command            : cmd
            most_recent_search : query
            most_recent_path   : store.get('current_path')

        salvus_client.exec
            project_id      : @project_id
            command         : cmd + " | cut -c 1-256"  # truncate horizontal line length (imagine a binary file that is one very long line)
            timeout         : 10   # how long grep runs on client
            network_timeout : 15   # how long network call has until it must return something or get total error.
            max_output      : max_output
            bash            : true
            err_on_exit     : true
            path            : store.get('current_path')
            cb              : (err, output) =>
                @process_results(err, output, max_results, max_output, cmd)

    # Loads path in this project from string
    #  files/....
    #  new
    #  log
    #  settings
    #  search
    load_target: (target, foreground=true) =>
        segments = target.split('/')
        full_path = segments.slice(1).join('/')
        parent_path = segments.slice(1, segments.length-1).join('/')
        switch segments[0]
            when 'files'
                if target[target.length-1] == '/' or full_path == ''
                    # open a directory
                    @set_current_path(parent_path)
                    @set_active_tab('files')
                else
                    # open a file -- foreground option is relevant here.
                    @open_file
                        path       : full_path
                        foreground : foreground
                        foreground_project : foreground
            when 'new'  # ignore foreground for these and below, since would be nonsense
                @set_current_path(full_path)
                @set_active_tab('new')
            when 'log'
                @set_active_tab('log')
            when 'settings'
                @set_active_tab('settings')
            when 'search'
                @set_current_path(full_path)
                @set_active_tab('search')

    show_extra_free_warning : =>
        @setState(free_warning_extra_shown : true)

    close_free_warning : =>
        @setState(free_warning_closed : true)


class ProjectStore extends Store
    _init : (project_id) =>
        @project_id = project_id
        @on 'change', =>
            if @_last_public_paths != @get('public_paths')
                # invalidate the public_paths_cache
                delete @_public_paths_cache
                @_last_public_paths = @get('public_paths')

    destroy: =>
        @_account_store?.removeListener('change', @_account_store_change)

    get_open_files: =>
        return @get('open_files')

    get_open_files_order: =>
        return @get('open_files_order')

    _match : (words, s, is_dir) =>
        s = s.toLowerCase()
        for t in words
            if t[t.length - 1] == '/'
                if not is_dir
                    return false
                else if s.indexOf(t.slice(0, -1)) == -1
                    return false
            else if s.indexOf(t) == -1
                return false
        return true

    _matched_files : (search, listing) ->
        if not listing?
            return []
        words = search.split(" ")
        return (x for x in listing when @_match(words, x.display_name ? x.name, x.isdir))

    _compute_file_masks: (listing) ->
        filename_map = misc.dict( ([item.name, item] for item in listing) ) # map filename to file
        for file in listing
            filename = file.name

            # mask items beginning with '.'
            if misc.startswith(filename, '.')
                file.mask = true
                continue

            # mask compiled files, e.g. mask 'foo.class' when 'foo.java' exists
            ext = misc.filename_extension(filename)
            basename = filename[0...filename.length - ext.length]
            for mask_ext in masked_file_exts[ext] ? [] # check each possible compiled extension
                filename_map["#{basename}#{mask_ext}"]?.mask = true

    _compute_snapshot_display_names: (listing) ->
        for item in listing
            tm = misc.parse_bup_timestamp(item.name)
            item.display_name = "#{tm}"
            item.mtime = (tm - 0)/1000

    get_directory_listings: =>
        return @get('directory_listings')

    # search_escape_char may or may not be the right way to escape search
    get_displayed_listing : (search_escape_char) =>
        # cached pre-processed file listing, which should always be up to date when called, and properly
        # depends on dependencies.
        # TODO: optimize -- use immutable js and cache result if things haven't changed. (like shouldComponentUpdate)
        # **ensure** that cache clearing depends on account store changing too, as in file_use.coffee.
        path = @get('current_path')
        listing = @get_directory_listings().get(path)
        if typeof(listing) == 'string'
            if listing.indexOf('ECONNREFUSED') != -1 or listing.indexOf('ENOTFOUND') != -1
                return {error:'no_instance'}  # the host VM is down
            else if listing.indexOf('o such path') != -1
                return {error:'no_dir'}
            else if listing.indexOf('ot a directory') != -1
                return {error:'not_a_dir'}
            else if listing.indexOf('not running') != -1  # yes, no underscore.
                return {error:'not_running'}
            else
                return {error:listing}
        if not listing?
            return {}
        if listing?.errno?
            return {error:misc.to_json(listing)}
        listing = listing.toJS()

        # TODO: make this store update when account store updates.
        if @redux.getStore('account')?.getIn(["other_settings", "mask_files"])
            @_compute_file_masks(listing)

        if path == '.snapshots'
            @_compute_snapshot_display_names(listing)

        search = @get('file_search')?.toLowerCase()
        if search and search[0] isnt search_escape_char
            listing = @_matched_files(search, listing)

        map = {}
        for x in listing
            map[x.name] = x

        x = {listing: listing, public:{}, path:path, file_map:map}

        @_compute_public_files(x)

        return x

    ###
    # Store data about PUBLIC PATHS
    ###
    # immutable js array of the public paths in this projects
    get_public_paths: =>
        if @get('public_paths')?
            return @_public_paths_cache ?= immutable.fromJS((misc.copy_without(x,['id','project_id']) for _,x of @get('public_paths').toJS()))

    get_public_path_id: (path) =>
        # (this exists because rethinkdb doesn't have compound primary keys)
        {SCHEMA, client_db} = require('smc-util/schema')
        return SCHEMA.public_paths.user_query.set.fields.id({project_id:@project_id, path:path}, client_db)

    _compute_public_files: (x) =>
        listing = x.listing
        pub = x.public
        v = @get_public_paths()
        if v? and v.size > 0
            head = if @get('current_path') then @get('current_path') + '/' else ''
            paths = []
            map   = {}
            for x in v.toJS()
                map[x.path] = x
                paths.push(x.path)
            for x in listing
                full = head + x.name
                p = misc.containing_public_path(full, paths)
                if p?
                    x.public = map[p]
                    x.is_public = not x.public.disabled
                    pub[x.name] = map[p]

exports.getStore = getStore = (project_id, redux) ->
    must_define(redux)
    name  = key(project_id)
    store = redux.getStore(name)
    if store?
        return store

    # Initialize everything

    # Create actions
    actions = redux.createActions(name, ProjectActions)
    actions.project_id = project_id  # so actions can assume this is available on the object

    set_sort_time = () ->
        if redux.getStore('account').get('other_settings').get('default_file_sort') == 'time'
            return true
        else
            return false

    # Create store
    # open_files :
    #     file_path :
    #         component    : react_renderable
    #         has_activity : bool
    initial_state =
        current_path       : ''
        sort_by_time       : set_sort_time() #TODO
        show_hidden        : false
        checked_files      : immutable.Set()
        public_paths       : undefined
        directory_listings : immutable.Map()
        user_input         : ''
        active_project_tab : 'files'
        open_files_order   : immutable.List([])
        open_files         : immutable.Map({})
        num_ghost_file_tabs: 0

    store = redux.createStore(name, ProjectStore, initial_state)
    store._init(project_id)

    queries = misc.deep_copy(QUERIES)

    create_table = (table_name, q) ->
        #console.log("create_table", table_name)
        class P extends Table
            query: =>
                return "#{table_name}":q.query
            options: =>
                return q.options
            _change: (table, keys) =>
                actions.setState("#{table_name}": table.get())

    for table_name, q of queries
        for k, v of q
            if typeof(v) == 'function'
                q[k] = v()
        q.query.project_id = project_id
        T = redux.createTable(key(project_id, table_name), create_table(table_name, q))

    return store

exports.getActions = (project_id, redux) ->
    must_define(redux)
    if not getStore(project_id, redux)?
        getStore(project_id, redux)
    return redux.getActions(key(project_id))

exports.getTable = (project_id, name, redux) ->
    must_define(redux)
    if not getStore(project_id, redux)?
        getStore(project_id, redux)
    return redux.getTable(key(project_id, name))

exports.deleteStoreActionsTable = (project_id, redux) ->
    must_define(redux)
    name = key(project_id)
    redux.getStore(name)?.destroy?()
    redux.getActions(name).close_all_files()
    redux.removeActions(name)
    for table,_ of QUERIES
        redux.removeTable(key(project_id, table))
    redux.removeStore(name)

get_directory_listing = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        time       : required
        hidden     : required
        max_time_s : required
        group      : required
        cb         : required
    {salvus_client} = require('./salvus_client')
    if opts.group in ['owner', 'collaborator', 'admin']
        method = salvus_client.project_directory_listing
    else
        method = salvus_client.public_project_directory_listing
    listing = undefined
    f = (cb) ->
        method
            project_id : opts.project_id
            path       : opts.path
            time       : opts.time
            hidden     : opts.hidden
            timeout    : 20
            cb         : (err, x) ->
                listing = x
                cb(err)

    misc.retry_until_success
        f        : f
        max_time : opts.max_time_s * 1000
        #log      : console.log
        cb       : (err) ->
            opts.cb(err, listing)

