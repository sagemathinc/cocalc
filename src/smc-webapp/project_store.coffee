###############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2015 -- 2016, SageMath, Inc.
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
os_path    = require('path')

# At most this many of the most recent log messages for a project get loaded:
# TODO: add a button to load the entire log or load more...
MAX_PROJECT_LOG_ENTRIES = 1000

misc      = require('smc-util/misc')
{MARKERS} = require('smc-util/sagews')
{alert_message} = require('./alerts')
{webapp_client} = require('./webapp_client')
{project_tasks} = require('./project_tasks')
{types, defaults, required} = misc

{Actions, rtypes, computed, depends, project_redux_name, Table, redux}  = require('./smc-react')

# "no such path" and "not a directory" error indicator strings
exports.NO_DIR    = NO_DIR    = 'no_dir'
exports.NOT_A_DIR = NOT_A_DIR = 'not_a_dir'

exports.file_actions = file_actions =
    compress  :
        name  : 'Compress'
        icon  : 'compress'
        allows_multiple_files : true
    delete    :
        name  : 'Delete'
        icon  : 'trash-o'
        allows_multiple_files : true
    rename    :
        name  : 'Rename'
        icon  : 'pencil'
        allows_multiple_files : false
    duplicate :
        name  : 'Duplicate'
        icon  : 'clone'
        allows_multiple_files : false
    move      :
        name  : 'Move'
        icon  : 'arrows'
        allows_multiple_files : true
    copy      :
        name  : 'Copy'
        icon  : 'files-o'
        allows_multiple_files : true
    share     :
        name  : 'Share'
        icon  : 'share-square-o'
        allows_multiple_files : false
    download  :
        name  : 'Download'
        icon  : 'cloud-download'
        allows_multiple_files : true

if window?
    # don't import in case not in browser (for testing)
    project_file = require('./project_file')
    wrapped_editors = require('./editor_react_wrapper')

MASKED_FILE_EXTENSIONS =
    'py'   : ['pyc']
    'java' : ['class']
    'cs'   : ['exe']
    'tex'  : 'aux bbl blg fdb_latexmk fls glo idx ilg ind lof log nav out snm synctex.gz toc xyc synctex.gz(busy) sagetex.sage sagetex.sout sagetex.scmd sagetex.sage.py sage-plots-for-FILENAME'.split(' ')
    'rnw'  : ['tex', 'NODOT-concordance.tex']

COMPUTE_FILE_MASKS = exports.compute_file_masks = (listing) ->
    filename_map = misc.dict( ([item.name, item] for item in listing) ) # map filename to file
    for file in listing
        # note: never skip already masked files, because of rnw->tex
        filename = file.name

        # mask items beginning with '.'
        if misc.startswith(filename, '.')
            file.mask = true
            continue

        # mask compiled files, e.g. mask 'foo.class' when 'foo.java' exists
        ext = misc.filename_extension(filename).toLowerCase()
        basename = filename[0...filename.length - ext.length]
        for mask_ext in MASKED_FILE_EXTENSIONS[ext] ? [] # check each possible compiled extension
            if misc.startswith(mask_ext, 'NODOT')
                bn = basename[... -1]  # exclude the trailing dot
                mask_ext = mask_ext['NODOT'.length ...]
            else if mask_ext.indexOf('FILENAME') >= 0
                bn = mask_ext.replace('FILENAME', filename)
                mask_ext = ''
            else
                bn = basename
            filename_map["#{bn}#{mask_ext}"]?.mask = true

BAD_FILENAME_CHARACTERS       = '\\'
BAD_LATEX_FILENAME_CHARACTERS = '\'"()"~%'
BANNED_FILE_TYPES             = ['doc', 'docx', 'pdf', 'sws']

FROM_WEB_TIMEOUT_S = 45

# src: where the library files are
# start: open this file after copying the directory
LIBRARY =
    first_steps :
        src    : '/ext/library/first-steps/src'
        start  : 'first-steps.tasks'

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
            unlisted    : null
            created     : null
            last_edited : null
            last_saved  : null
            counter     : null

must_define = (redux) ->
    if not redux?
        throw Error('you must explicitly pass a redux object into each function in project_store')

_init_library_index_ongoing = {}
_init_library_index_cache   = {}

class ProjectActions extends Actions
    destroy: =>
        must_define(@redux)
        name = project_redux_name(@project_id)
        @close_all_files()
        for table, _ of QUERIES
            @redux.removeTable(project_redux_name(@project_id, table))

    _ensure_project_is_open: (cb, switch_to) =>
        s = @redux.getStore('projects')
        if not s.is_project_open(@project_id)
            @redux.getActions('projects').open_project(project_id:@project_id, switch_to:true)
            s.wait_until_project_is_open(@project_id, 30, cb)
        else
            cb()

    get_store: =>
        return @redux.getStore(@name)

    clear_all_activity: =>
        @setState(activity:undefined)

    set_url_to_path: (current_path) =>
        if current_path.length > 0 and not misc.endswith(current_path, '/')
            current_path += '/'
        @push_state('files/' + current_path)

    _url_in_project: (local_url) =>
        return '/projects/' + @project_id + '/' + misc.encode_path(local_url)

    push_state: (local_url) =>
        if not local_url?
            local_url = @_last_history_state
        if not local_url?
            local_url = ''
        @_last_history_state = local_url
        {set_url} = require('./history')
        set_url(@_url_in_project(local_url))
        require('./misc_page').analytics_pageview(window.location.pathname)

    move_file_tab: (opts) =>
        {old_index, new_index, open_files_order} = defaults opts,
            old_index : required
            new_index : required
            open_files_order: required # immutable

        x = open_files_order
        item = x.get(old_index)
        temp_list = x.delete(old_index)
        new_list = temp_list.splice(new_index, 0, item)
        @setState(open_files_order:new_list)
        @redux.getActions('page').save_session()

    # Closes a file tab
    # Also closes file references.
    close_tab: (path) =>
        return if not store = @get_store()
        open_files_order = store.open_files_order
        active_project_tab = store.active_project_tab
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
        window.clearTimeout(@last_close_timer)
        @last_close_timer = window.setTimeout(@clear_ghost_file_tabs, 5000)
        @close_file(path)

    # Expects one of ['files', 'new', 'log', 'search', 'settings']
    #            or a file_redux_name
    # Pushes to browser history
    # Updates the URL
    set_active_tab: (key) =>
        return if not store = @get_store()
        if store.active_project_tab == key
            # nothing to do
            return
        @setState(active_project_tab : key)
        switch key
            when 'files'
                @set_url_to_path(store.current_path ? '')
                @fetch_directory_listing()
            when 'new'
                @setState(file_creation_error: undefined)
                @push_state('new/' + store.current_path)
                @set_next_default_filename(require('./account').default_filename())
            when 'log'
                @push_state('log')
            when 'search'
                @push_state('search/' + store.current_path)
            when 'settings'
                @push_state('settings')
            else # editor...
                path = misc.tab_to_path(key)
                @redux.getActions('file_use')?.mark_file(@project_id, path, 'open')
                @push_state('files/' + path)
                @set_current_path(misc.path_split(path).head)

                # Reopen the file if relationship has changed
                is_public = redux.getStore('projects').get_my_group(@project_id) == 'public'
                was_public = store.open_files.getIn([path, 'component']).is_public
                if is_public != was_public
                    @open_file(path : path)

    add_a_ghost_file_tab: () =>
        return if not store = @get_store()
        current_num = store.num_ghost_file_tabs
        @setState(num_ghost_file_tabs : current_num + 1)

    clear_ghost_file_tabs: =>
        @setState(num_ghost_file_tabs : 0)

    set_next_default_filename: (next) =>
        @setState(default_filename: next)

    set_activity: (opts) =>
        opts = defaults opts,
            id     : required     # client must specify this, e.g., id=misc.uuid()
            status : undefined    # status update message during the activity -- description of progress
            stop   : undefined    # activity is done  -- can pass a final status message in.
            error  : undefined    # describe an error that happened
        return if not store = @get_store()
        x = store.activity?.toJS()
        if not x?
            x = {}
        # Actual implementyation of above specified API is VERY minimal for
        # now -- just enough to display something to user.
        if opts.status?
            x[opts.id] = opts.status
            @setState(activity: x)
        if opts.error?
            error = opts.error
            if error == ''
                @setState(error:error)
            else
                @setState(error:((store.error ? '') + '\n' + error).trim())
        if opts.stop?
            if opts.stop
                x[opts.id] = opts.stop  # of course, just gets deleted below but that is because use is simple still
            delete x[opts.id]
            @setState(activity: x)
        return

    # report a log event to the backend -- will indirectly result in a new entry in the store...
    # Returns the random log entry uuid. If called later with that id, then the time isn't
    # changed and the event is merely updated.
    log: (event, id) =>
        if @redux.getStore('projects').get_my_group(@project_id) in ['public', 'admin']
            # Ignore log events for *both* admin and public.
            # Admin gets to be secretive (also their account_id --> name likely wouldn't be known to users).
            # Public users don't log anything.
            return # ignore log events
        obj =
            event      : event
            project_id : @project_id
        if not id
            # new log entry
            id       = misc.uuid()
            obj.time = misc.server_time()
        obj.id = id
        require('./webapp_client').webapp_client.query
            query : {project_log : obj}
            cb    : (err) =>
                if err
                    # TODO: what do we want to do if a log doesn't get recorded?
                    # (It *should* keep trying and store that in localStorage, and try next time, etc...
                    #  of course done in a systematic way across everything.)
                    console.warn('error recording a log entry: ', err, event)
        return id

    log_opened_time: (path) =>
        # Call log_opened with a path to update the log with the fact that
        # this file successfully opened and rendered so that the user can
        # actually see it.  This is used to get a sense for how long things
        # are taking...
        data = @_log_open_time?[path]
        if not data?
            # never setup log event recording the start of open (this would get set in @open_file)
            return
        {id, start} = data
        # do not allow recording the time more than once, which would be weird.
        delete @_log_open_time[path]
        @log({time: misc.server_time() - start}, id)

    # Save the given file in this project (if it is open) to disk.
    save_file: (opts) =>
        opts = defaults opts,
            path : required
        if not @redux.getStore('projects').is_project_open(@project_id)
            return # nothing to do regarding save, since project isn't even open
        # NOTE: someday we could have a non-public relationship to project, but still open an individual file in public mode
        return if not store = @get_store()
        is_public = store.open_files.getIn([opts.path, 'component'])?.is_public
        project_file.save(opts.path, @redux, @project_id, is_public)

    # Save all open files in this project
    save_all_files: () =>
        s = @redux.getStore('projects')
        if not s.is_project_open(@project_id)
            return # nothing to do regarding save, since project isn't even open
        group = s.get_my_group(@project_id)
        if not group? or group == 'public'
            return # no point in saving if not open enough to even know our group or if our relationship to entire project is "public"
        return if not store = @get_store()
        store.open_files.forEach (val, path) =>
            is_public = val.get('component')?.is_public  # might still in theory someday be true.
            project_file.save(path, @redux, @project_id, is_public)
            return

    # Open the given file in this project.
    open_file: (opts) =>
        opts = defaults opts,
            path               : required
            foreground         : true      # display in foreground as soon as possible
            foreground_project : true
            chat               : undefined
            chat_width         : undefined
            ignore_kiosk       : false
            new_browser_window : false     # open in entirely new browser window with a new random session.
            payload            : undefined # optional, some extra information

        #if DEBUG then console.log("ProjectStore::open_file: #{misc.to_json(opts)}")

        # intercept any requests if in kiosk mode
        if (not opts.ignore_kiosk) and (redux.getStore('page').get('fullscreen') == 'kiosk')
            alert_message
                type    : "error",
                message : "CoCalc is in Kiosk mode, so you may not open new files.  Please try visiting #{document.location.origin} directly."
                timeout : 15
            return

        if opts.new_browser_window
            # options other than path don't do anything yet.
            url  = (window.app_base_url ? '') + @_url_in_project('files/' + opts.path)
            url += '?session=' + misc.uuid().slice(0,8)
            url += '&fullscreen=default'
            require('./misc_page').open_popup_window(url, {width: 800, height: 640})
            return

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
                            alert_message(type:"info",message:"Opening converted CoCalc worksheet file instead of '#{opts.path}...")
                            @convert_sagenb_worksheet opts.path, (err, sagews_filename) =>
                                if not err
                                    @open_file
                                        path               : sagews_filename
                                        foreground         : opts.foreground
                                        foreground_project : opts.foreground_project
                                        chat               : opts.chat
                                else
                                    alert_message(type:"error",message:"Error converting Sage Notebook sws file -- #{err}")
                            return

                        if not is_public and ext == "docx"   # Microsoft Word Document
                            alert_message(type:"info", message:"Opening converted plain text file instead of '#{opts.path}...")
                            @convert_docx_file opts.path, (err, new_filename) =>
                                if not err
                                    @open_file
                                        path               : new_filename
                                        foreground         : opts.foreground
                                        foreground_project : opts.foreground_project
                                        chat               : opts.chat
                                else
                                    alert_message(type:"error",message:"Error converting Microsoft docx file -- #{err}")
                            return

                        if not is_public
                            # the ? is because if the user is anonymous they don't have a file_use Actions (yet)
                            @redux.getActions('file_use')?.mark_file(@project_id, opts.path, 'open')
                            event =
                                event     : 'open'
                                action    : 'open'
                                filename  : opts.path
                            id = @log(event)

                            # Save the log entry id, so it is possible to optionally
                            # record how long it took for the file to open.  This
                            # may happen via a call from random places in our codebase,
                            # since the idea of "finishing opening and rendering" is
                            # not simple to define.
                            @_log_open_time ?= {}
                            @_log_open_time[opts.path] = {id:id, start:misc.server_time()}

                            # grab chat state from local storage
                            local_storage = require('./editor').local_storage
                            if local_storage?
                                opts.chat       ?= local_storage(@project_id, opts.path, 'is_chat_open')
                                opts.chat_width ?= local_storage(@project_id, opts.path, 'chat_width')

                            if misc.filename_extension(opts.path) == 'sage-chat'
                                opts.chat = false

                        return if not store = @get_store()
                        open_files = store.open_files

                        # Only generate the editor component if we don't have it already
                        # Also regenerate if view type (public/not-public) changes
                        if not open_files.has(opts.path) or open_files.getIn([opts.path, 'component'])?.is_public != is_public
                            was_public = open_files.getIn([opts.path, 'component'])?.is_public
                            if was_public? and was_public != is_public
                                @setState(open_files : store.open_files.delete(opts.path))
                                project_file.remove(opts.path, @redux, @project_id, was_public)

                            open_files_order = store.open_files_order

                            # Initialize the file's store and actions
                            name = project_file.initialize(opts.path, @redux, @project_id, is_public)

                            # Make the Editor react component
                            Editor = project_file.generate(opts.path, @redux, @project_id, is_public)

                            # Add it to open files
                            # IMPORTANT: info can't be a full immutable.js object, since Editor can't
                            # be converted to immutable,
                            # so don't try to do that.  Of course info could be an immutable map.
                            info =
                                redux_name   : name
                                is_public    : is_public
                                Editor       : Editor
                            open_files = open_files.setIn([opts.path, 'component'], info)
                            open_files = open_files.setIn([opts.path, 'is_chat_open'], opts.chat)
                            open_files = open_files.setIn([opts.path, 'chat_width'], opts.chat_width)
                            index = open_files_order.indexOf(opts.path)
                            if opts.chat
                                require('./chat/register').init(misc.meta_file(opts.path, 'chat'), @redux, @project_id)
                                # Closed by require('./project_file').remove

                            if index == -1
                                index = open_files_order.size
                            @setState
                                open_files       : open_files
                                open_files_order : open_files_order.set(index, opts.path)
                            @redux.getActions('page').save_session()

                        if opts.foreground
                            @foreground_project()
                            @set_active_tab(misc.path_to_tab(opts.path))

                        if opts.payload?
                            a = redux.getEditorActions(@project_id, opts.path)
                            a.dispatch_payload?(opts.payload)
        return

    get_scroll_saver_for: (path) =>
        if path?
            return (scroll_position) =>
                store = @get_store()
                # Ensure prerequisite things exist
                if not store?.open_files?.getIn([path, 'component'])?
                    return
                # WARNING: Saving scroll position does NOT trigger a rerender. This is intentional.
                info = store.open_files.getIn([path, 'component'])
                info.scroll_position = scroll_position

    # If the given path is open, and editor supports going to line, moves to the given line.
    # Otherwise, does nothing.
    goto_line: (path, line) =>
        a = redux.getEditorActions(@project_id, path)
        if not a?
            # try non-react editor
            wrapped_editors.get_editor(@project_id, path)?.programmatical_goto_line?(line)
        else
            a.programmatical_goto_line?(line)

    # Used by open/close chat below.
    _set_chat_state: (path, is_chat_open) =>
        return if not store = @get_store()
        open_files = store.open_files
        if open_files? and path?
            @setState
                open_files : open_files.setIn([path, 'is_chat_open'], is_chat_open)

    # Open side chat for the given file, assuming the file is open, store is initialized, etc.
    open_chat: (opts) =>
        opts = defaults opts,
            path : required
        @_set_chat_state(opts.path, true)
        require('./chat/register').init(misc.meta_file(opts.path, 'chat'), @redux, @project_id)
        require('./editor').local_storage?(@project_id, opts.path, 'is_chat_open', true)

    # Close side chat for the given file, assuming the file itself is open
    close_chat: (opts) =>
        opts = defaults opts,
            path : required
        @_set_chat_state(opts.path, false)
        require('./editor').local_storage?(@project_id, opts.path, 'is_chat_open', false)

    set_chat_width: (opts) =>
        opts = defaults opts,
            path  : required
            width : required     # between 0 and 1
        return if not store = @get_store()
        open_files = store.open_files
        if open_files?
            width = misc.ensure_bound(opts.width, 0.05, 0.95)
            require('./editor').local_storage?(@project_id, opts.path, 'chat_width', width)
            @setState
                open_files : open_files.setIn([opts.path, 'chat_width'], width)

    # OPTIMIZATION: Some possible performance problems here. Debounce may be necessary
    flag_file_activity: (filename) =>
        if not filename?
            return

        if not @_activity_indicator_timers?
            @_activity_indicator_timers = {}
        timer = @_activity_indicator_timers[filename]
        if timer?
            clearTimeout(timer)

        set_inactive = () =>
            return if not store = @get_store()
            current_files = store.open_files
            @setState(open_files : current_files.setIn([filename, 'has_activity'], false))

        @_activity_indicator_timers[filename] = setTimeout(set_inactive, 1000)

        return if not store = @get_store()
        open_files = store.open_files
        new_files_data = open_files.setIn([filename, 'has_activity'], true)
        @setState(open_files : new_files_data)

    convert_sagenb_worksheet: (filename, cb) =>
        async.series([
            (cb) =>
                ext = misc.filename_extension(filename)
                if ext == "sws"
                    cb()
                else
                    i = filename.length - ext.length
                    new_filename = filename.slice(0, i-1) + ext.slice(3) + '.sws'
                    webapp_client.exec
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
                webapp_client.exec
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
        webapp_client.exec
            project_id : @project_id
            command    : "smc-docx2txt"
            args       : [filename]
            cb         : (err, output) =>
                if err
                    cb("#{err}, #{misc.to_json(output)}")
                else
                    cb(false, filename.slice(0,filename.length-4) + 'txt')

    # Closes all files and removes all references
    close_all_files: () =>
        return if not store = @get_store()
        file_paths = store.open_files
        if file_paths.isEmpty()
            return

        empty = file_paths.map (obj, path) =>
            is_public = obj.getIn(['component'])?.is_public
            project_file.remove(path, @redux, @project_id, is_public)
            return false

        @setState(open_files_order : empty, open_files : {})

    # Closes the file and removes all references.
    # Does not update tabs
    close_file: (path) =>
        return if not store = @get_store()
        x = store.open_files_order
        index = x.indexOf(path)
        if index != -1
            open_files = store.open_files
            is_public = open_files.getIn([path, 'component'])?.is_public
            @setState
                open_files_order : x.delete(index)
                open_files       : open_files.delete(path)
            project_file.remove(path, @redux, @project_id, is_public)
            @redux.getActions('page').save_session()

    # Makes this project the active project tab
    foreground_project: =>
        @_ensure_project_is_open (err) =>
            if err
                # TODO!
                console.warn('error putting project in the foreground: ', err, @project_id, path)
            else
                @redux.getActions('projects').foreground_project(@project_id)

    open_directory: (path) =>
        @_ensure_project_is_open (err) =>
            if err
                # TODO!
                console.log('error opening directory in project: ', err, @project_id, path)
            else
                if path[path.length - 1] == '/'
                    path = path.slice(0, -1)
                @foreground_project()
                @set_current_path(path)
                return if not store = @get_store()
                if store.active_project_tab == 'files'
                    @set_url_to_path(path)
                else
                    @set_active_tab('files')
                @set_all_files_unchecked()

    # ONLY updates current path
    # Does not push to URL, browser history, or add to analytics
    # Use internally or for updating current path in background
    set_current_path: (path) =>
        # SMELL: Track from history.coffee
        if path is NaN
            path = ''
        path ?= ''
        if typeof path != 'string'
            window.cpath_args = arguments
            throw Error("Current path should be a string. Revieved arguments are available in window.cpath_args")
        # Set the current path for this project. path is either a string or array of segments.

        return if not store = @get_store()
        history_path = store.history_path ? ''
        if (!history_path.startsWith(path)) or (path.length > history_path.length)
            history_path = path

        @setState
            current_path           : path
            history_path           : history_path
            page_number            : 0
            most_recent_file_click : undefined

        @fetch_directory_listing()

    set_file_search: (search) =>
        @setState
            file_search            : search
            page_number            : 0
            file_action            : undefined
            most_recent_file_click : undefined
            create_file_alert      : false

    # Update the directory listing cache for the given path
    # Use current path if path not provided
    fetch_directory_listing: (opts) =>
        return if not store = @get_store()
        opts = defaults opts,
            path         : store.current_path
            finish_cb    : undefined # WARNING: THINK VERY HARD BEFORE YOU USE THIS
            # In the vast majority of cases, you just want to look at the data.
            # Very rarely should you need something to execute exactly after this
        path = opts.path
        #if DEBUG then console.log('ProjectStore::fetch_directory_listing, opts:', opts, opts.finish_cb)
        if not path?
            # nothing to do if path isn't defined -- there is no current path -- see https://github.com/sagemathinc/cocalc/issues/818
            return

        @_set_directory_files_lock ?= {}
        _key = "#{path}"
        # this makes sure finish_cb is being called, even when there are concurrent requests
        if @_set_directory_files_lock[_key]?  # currently doing it already
            @_set_directory_files_lock[_key].push(opts.finish_cb) if opts.finish_cb?
            #if DEBUG then console.log('ProjectStore::fetch_directory_listing aborting:', _key, opts)
            return
        @_set_directory_files_lock[_key] = []
        # Wait until user is logged in, project store is loaded enough
        # that we know our relation to this project, namely so that
        # get_my_group is defined.
        id = misc.uuid()
        if path
            status = "Loading file list - #{misc.trunc_middle(path,30)}"
        else
            status = "Loading file list"
        @set_activity(id:id, status:status)
        my_group = undefined
        the_listing = undefined
        async.series([
            (cb) =>
                # make sure that our relationship to this project is known.
                @redux.getStore('projects').wait
                    until   : (s) => s.get_my_group(@project_id)
                    timeout : 30
                    cb      : (err, group) =>
                        my_group = group
                        cb(err)
            (cb) =>
                store = @get_store()
                if not store?
                    cb("store no longer defined"); return
                path         ?= store.current_path
                get_directory_listing
                    project_id : @project_id
                    path       : path
                    hidden     : true
                    max_time_s : 15*60  # keep trying for up to 15 minutes
                    group      : my_group
                    cb         : (err, listing) =>
                        the_listing = listing
                        cb(err)
        ], (err) =>
            @set_activity(id:id, stop:'')
            # Update the path component of the immutable directory listings map:
            return if not store = @get_store()
            if err and not misc.is_string(err)
                err = misc.to_json(err)
            map = store.directory_listings.set(path, if err then err else immutable.fromJS(the_listing.files))
            @setState(directory_listings : map)
            # done! releasing lock, then executing callback(s)
            cbs = @_set_directory_files_lock[_key]
            delete @_set_directory_files_lock[_key]
            for cb in cbs ? []
                #if DEBUG then console.log('ProjectStore::fetch_directory_listing cb from lock', cb)
                cb?()
            #if DEBUG then console.log('ProjectStore::fetch_directory_listing cb', opts, opts.finish_cb)
            opts.finish_cb?()
        )

    # Sets the active file_sort to next_column_name
    set_sorted_file_column: (column_name) =>
        current = @get_store()?.active_file_sort
        if current?.column_name == column_name
            is_descending = not current.is_descending
        else
            is_descending = false
        next_file_sort = {is_descending, column_name}
        @setState(active_file_sort : next_file_sort)

    # Increases the selected file index by 1
    # undefined increments to 0
    increment_selected_file_index: =>
        return if not store = @get_store()
        current_index = store.selected_file_index ? -1
        @setState(selected_file_index : current_index + 1)

    # Decreases the selected file index by 1.
    # Guaranteed to never set below 0.
    # Does nothing when selected_file_index is undefined
    decrement_selected_file_index: =>
        return if not store = @get_store()
        current_index = store.selected_file_index
        if current_index? and current_index > 0
            @setState(selected_file_index : current_index - 1)

    zero_selected_file_index: =>
        @setState(selected_file_index : 0)

    clear_selected_file_index: =>
        @setState(selected_file_index : undefined)

    # Set the most recently clicked checkbox, expects a full/path/name
    set_most_recent_file_click: (file) =>
        @setState(most_recent_file_click : file)

    # Set the selected state of all files between the most_recent_file_click and the given file
    set_selected_file_range: (file, checked) =>
        return if not store = @get_store()
        most_recent = store.most_recent_file_click
        if not most_recent?
            # nothing had been clicked before, treat as normal click
            range = [file]
        else
            # get the range of files
            current_path = store.current_path
            names = (misc.path_to_file(current_path, a.name) for a in store.displayed_listing.listing)
            range = misc.get_array_range(names, most_recent, file)

        if checked
            @set_file_list_checked(range)
        else
            @set_file_list_unchecked(range)

    # set the given file to the given checked state
    set_file_checked: (file, checked) =>
        return if not store = @get_store()
        changes = {}
        if checked
            changes.checked_files = store.checked_files.add(file)
            if store.file_action? and changes.checked_files.size > 1 and not file_actions[store.file_action].allows_multiple_files
                changes.file_action = undefined
        else
            changes.checked_files = store.checked_files.delete(file)
            if changes.checked_files.size == 0
                changes.file_action = undefined

        @setState(changes)

    # check all files in the given file_list
    set_file_list_checked: (file_list) =>
        return if not store = @get_store()
        changes =
            checked_files : store.checked_files.union(file_list)
        if store.file_action? and changes.checked_files.size > 1 and not file_actions[store.file_action].allows_multiple_files
            changes.file_action = undefined

        @setState(changes)


    # uncheck all files in the given file_list
    set_file_list_unchecked: (file_list) =>
        return if not store = @get_store()
        changes = {checked_files : store.checked_files.subtract(file_list)}

        if changes.checked_files.size == 0
            changes.file_action = undefined

        @setState(changes)

    # uncheck all files
    set_all_files_unchecked: =>
        return if not store = @get_store()
        @setState
            checked_files : store.checked_files.clear()
            file_action   : undefined

    _suggest_duplicate_filename: (name) =>
        return if not store = @get_store()

        files_in_dir = {}
        # This will set files_in_dir to our current view of the files in the current
        # directory (at least the visible ones) or do nothing in case we don't know
        # anything about files (highly unlikely).  Unfortunately (for this), our
        # directory listings are stored as (immutable) lists, so we have to make
        # a map out of them.
        listing = store.directory_listings?.get(store.current_path)
        if typeof(listing) == 'string'    # must be an error
            return name  # simple fallback
        listing?.map (x) ->
            files_in_dir[x.get('name')] = true
            return
        # This loop will keep trying new names until one isn't in the directory
        while true
            name = misc.suggest_duplicate_filename(name)
            if not files_in_dir[name]
                return name

    set_file_action: (action, get_basename) =>
        return if not store = @get_store()

        switch action
            when 'move'
                checked_files = store.checked_files.toArray()
                @redux.getActions('projects').fetch_directory_tree(@project_id, exclusions:checked_files)
            when 'copy'
                @redux.getActions('projects').fetch_directory_tree(@project_id)
            when 'duplicate'
                @setState(new_name : @_suggest_duplicate_filename(get_basename()))
            when 'rename'
                @setState(new_name : misc.path_split(get_basename()).tail)
        @setState(file_action : action)

    show_file_action_panel: (opts) =>
        opts = defaults opts,
            path   : required
            action : required
        path_splitted = misc.path_split(opts.path)
        @open_directory(path_splitted.head)
        @set_all_files_unchecked()
        @set_file_checked(opts.path, true)
        @set_file_action(opts.action, (-> path_splitted.tail))

    get_from_web: (opts) =>
        opts = defaults opts,
            url     : required
            dest    : undefined
            timeout : 45
            alert   : true
            cb      : undefined     # cb(true or false, depending on error)

        {command, args} = misc.transform_get_url(opts.url)

        require('./webapp_client').webapp_client.exec
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

    # function used internally by things that call webapp_client.exec
    _finish_exec: (id) =>
        # returns a function that takes the err and output and does the right activity logging stuff.
        return (err, output) =>
            @fetch_directory_listing()
            if err
                @set_activity(id:id, error:err)
            else if output?.event == 'error' or output?.error
                @set_activity(id:id, error:output.error)
            @set_activity(id:id, stop:'')

    zip_files: (opts) =>
        opts = defaults opts,
            src      : required
            dest     : required
            zip_args : undefined
            path     : undefined   # default to root of project
            id       : undefined
            cb       : undefined
        args = (opts.zip_args ? []).concat(['-rq'], [opts.dest], opts.src)
        if not opts.cb?
            id = opts.id ? misc.uuid()
            @set_activity(id:id, status:"Creating #{opts.dest} from #{opts.src.length} #{misc.plural(opts.src.length, 'file')}")
        webapp_client.exec
            project_id      : @project_id
            command         : 'zip'
            args            : args
            timeout         : 50
            network_timeout : 60
            err_on_exit     : true    # this should fail if exit_code != 0
            path            : opts.path
            cb              : opts.cb ? @_finish_exec(id)

    # DANGER: ASSUMES PATH IS IN THE DISPLAYED LISTING
    _convert_to_displayed_path: (path) =>
        if path.slice(-1) == '/'
            return path
        else
            if @get_store()?.displayed_listing?.file_map[misc.path_split(path).tail]?.isdir
                return path + '/'
            else
                return path

    # this is called once by the project initialization
    init_library: =>
        #if DEBUG then console.log("init_library")
        # Deprecated: this only tests the existence
        check = (v, k, cb) =>
            #if DEBUG then console.log("init_library.check", v, k)
            if not store = @get_store()
                cb("no store")
                return
            if store.library?.get(k)?
                cb("already done")
                return
            src = v.src
            cmd = "test -e #{src}"
            webapp_client.exec
                project_id      : @project_id
                command         : cmd
                bash            : true
                timeout         : 30
                network_timeout : 120
                err_on_exit     : false
                path            : '.'
                cb              : (err, output) =>
                    if not err
                        if not store = @get_store()
                            cb('no store')
                            return
                        library = store.library
                        library = library.set(k, (output.exit_code == 0))
                        @setState(library: library)
                    cb(err)

        async.series([
            (cb) -> async.eachOfSeries(LIBRARY, check, cb)
        ])

    init_library_index: ->
        if _init_library_index_cache[@project_id]?
            data = _init_library_index_cache[@project_id]
            return if not store = @get_store()
            library = store.library.set('examples', data)
            @setState(library: library)
            return

        return if _init_library_index_ongoing[@project_id]
        _init_library_index_ongoing[@project_id] = true

        {webapp_client} = require('./webapp_client')

        index_json_url = webapp_client.read_file_from_project
            project_id : @project_id
            path       : '/ext/library/cocalc-examples/index.json'

        fetch = (cb) =>
            if not @get_store()
                cb('no store')
                return
            $.ajax(
                url     : index_json_url
                timeout : 5000
                success : (data) =>
                    #if DEBUG then console.log("init_library/datadata
                    data = immutable.fromJS(data)
                    if not store = @get_store()
                        cb('no store')
                        return
                    library = store.library.set('examples', data)
                    @setState(library: library)
                    _init_library_index_cache[@project_id] = data
                    cb()
                ).fail((err) ->
                    ##if DEBUG then console.log("init_library/index: error reading file: #{misc.to_json(err)}")
                    cb(err.statusText ? 'error')
                )

        misc.retry_until_success
            f           : fetch
            start_delay : 1000
            max_delay   : 10000
            max_time    : 1000*60*3  # try for at most 3 minutes
            cb          : => _init_library_index_ongoing[@project_id] = false


    copy_from_library: (opts) =>
        opts = defaults opts,
            entry  : undefined
            src    : undefined
            target : undefined
            start  : undefined
            docid  : undefined   # for the log
            title  : undefined   # for the log
            cb     : undefined

        if opts.entry?
            lib = LIBRARY[opts.entry]
            if not lib?
                @setState(error: "Library entry '#{opts.entry}' unknown")
                return

        id = opts.id ? misc.uuid()
        @set_activity(id:id, status:"Copying files from library ...")

        # the rsync command purposely does not preserve the timestamps,
        # such that they look like "new files" and listed on top under default sorting
        source = os_path.join((opts.src    ? lib.src), '/')
        target = os_path.join((opts.target ? opts.entry), '/')
        start  = opts.start ? lib?.start

        webapp_client.exec
            project_id      : @project_id
            command         : 'rsync'
            args            : ['-rlDx', source, target]
            timeout         : 120   # how long rsync runs on client
            network_timeout : 120   # how long network call has until it must return something or get total error.
            err_on_exit     : true
            path            : '.'
            cb              : (err, output) =>
                (@_finish_exec(id))(err, output)
                if not err and start?
                    open_path = os_path.join(target, start)
                    if open_path[open_path.length - 1] == '/'
                        @open_directory(open_path)
                    else
                        @open_file(path: open_path)
                    @log
                        event  : 'library'
                        action : 'copy'
                        docid  : opts.docid
                        source : opts.src
                        title  : opts.title
                        target : target
                opts.cb?(err)

    set_library_is_copying: (status) =>
        @setState(library_is_copying:status)

    copy_paths: (opts) =>
        opts = defaults opts,
            src           : required     # Should be an array of source paths
            dest          : required
            id            : undefined
            only_contents : false        # true for duplicating files

        with_slashes = opts.src.map(@_convert_to_displayed_path)

        @log
            event  : 'file_action'
            action : 'copied'
            files  : with_slashes[0...3]
            count  : if opts.src.length > 3 then opts.src.length
            dest   : opts.dest + (if opts.only_contents then '' else '/')

        if opts.only_contents
            opts.src = with_slashes

        # If files start with a -, make them interpretable by rsync (see https://github.com/sagemathinc/cocalc/issues/516)
        deal_with_leading_dash = (src_path) ->
            if src_path[0] == '-'
                return "./#{src_path}"
            else
                return src_path

        # Ensure that src files are not interpreted as an option to rsync
        opts.src = opts.src.map(deal_with_leading_dash)

        id = opts.id ? misc.uuid()
        @set_activity(id:id, status:"Copying #{opts.src.length} #{misc.plural(opts.src.length, 'file')} to #{opts.dest}")

        args = ['-rltgoDxH']

        # We ensure the target copy is writable if *any* source path starts with .snapshots.
        # See https://github.com/sagemathinc/cocalc/issues/2497
        # This is a little lazy, but whatever.
        for x in opts.src
            if misc.startswith(x, '.snapshots')
                args = args.concat(['--perms', '--chmod', 'u+w'])
                break

        args = args.concat(opts.src)
        args = args.concat([opts.dest])

        webapp_client.exec
            project_id      : @project_id
            command         : 'rsync'  # don't use "a" option to rsync, since on snapshots results in destroying project access!
            args            : args
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
        with_slashes = src.map(@_convert_to_displayed_path)
        @log
            event   : 'file_action'
            action  : 'copied'
            files   : with_slashes[0...3]
            count   : if src.length > 3 then src.length
            project : opts.target_project_id
        f = (src_path, cb) =>
            opts0 = misc.copy(opts)
            opts0.cb = cb
            opts0.src_path = src_path
            # we do this for consistent semantics with file copy
            opts0.target_path = misc.path_to_file(opts0.target_path, misc.path_split(src_path).tail)
            webapp_client.copy_path_between_projects(opts0)
        async.mapLimit(src, 3, f, @_finish_exec(id))

    _move_files: (opts) =>  #PRIVATE -- used internally to move files
        opts = defaults opts,
            src     : required
            dest    : required
            path    : undefined   # default to root of project
            mv_args : undefined
            cb      : required
        if not opts.dest and not opts.path?
            opts.dest = '.'

        webapp_client.exec
            project_id      : @project_id
            command         : 'mv'
            args            : (opts.mv_args ? []).concat(['--'], opts.src, [opts.dest])
            timeout         : 15      # move should be fast..., unless across file systems.
            network_timeout : 20
            err_on_exit     : true    # this should fail if exit_code != 0
            path            : opts.path
            cb              : opts.cb

    move_files: (opts) =>
        opts = defaults opts,
            src            : required    # Array of src paths to mv
            dest           : required    # Single dest string
            dest_is_folder : required
            path           : undefined   # default to root of project
            mv_args        : undefined
            id             : undefined
            include_chats  : false       # If we want to copy .filename.sage-chat

        get_chat_path = (path) -> misc.meta_file(path, 'chat')

        collect_course_discussions = (array, path) =>
            return if not misc.endswith(path, '.course')
            head_tail = misc.path_split(path)
            return if not store = @get_store()
            listing = store.get('directory_listings').get(head_tail.head ? '')
            discussion_path_prefix = ".#{head_tail.tail}-"
            listing.map (entry) ->
                filename = entry.get('name')
                take     = misc.startswith(filename, discussion_path_prefix)
                take  and= misc.endswith(filename, '.sage-chat')
                if take
                    discussion_path = os_path.join(head_tail.head, filename)
                    array.push(discussion_path) unless opts.src.includes(discussion_path)
            return array

        if opts.include_chats
            if opts.dest_is_folder
                for path in opts.src
                    chat_path = get_chat_path(path)
                    opts.src.push(chat_path) unless opts.src.includes(chat_path)
                    collect_course_discussions(opts.src, path)

            else
                old_chat_path = get_chat_path(opts.src[0])
                new_chat_path = get_chat_path(opts.dest)

                @move_files
                    src            : [old_chat_path]
                    dest           : new_chat_path
                    dest_is_folder : false   # == opts.dest_is_folder

                # also rename associated course discussion files
                orig_src = opts.src[0]
                course_discussions = collect_course_discussions([], orig_src)
                if course_discussions.length > 0
                    src_head_tail = misc.path_split(orig_src)
                    dest_head_tail = misc.path_split(opts.dest)
                    for cd in course_discussions
                        postfix = cd[(1 + src_head_tail.tail.length)..]
                        src       = os_path.join(src_head_tail.head, cd)
                        dest_tail = ".#{dest_head_tail.tail}#{postfix}"
                        dest      = os_path.join(dest_head_tail.head, dest_tail)
                        @move_files
                            src            : [src]
                            dest           : dest
                            dest_is_folder : false   # == opts.dest_is_folder

        delete opts.include_chats
        delete opts.dest_is_folder

        check_existence_of = (path) =>
            path = misc.path_split(path)
            return if not store = @get_store()
            store.get('directory_listings').get(path.head ? "").some((item) => item.get('name') == path.tail)

        opts.src = (path for path in opts.src when check_existence_of path)

        return if opts.src.length == 0

        id = opts.id ? misc.uuid()
        @set_activity(id:id, status: "Moving #{opts.src.length} #{misc.plural(opts.src.length, 'file')} to #{opts.dest}")
        delete opts.id

        opts.cb = (err) =>
            if err
                @set_activity(id:id, error:err)
            else
                @fetch_directory_listing()
            @log
                event  : 'file_action'
                action : 'moved'
                files  : opts.src[0...3]
                count  : if opts.src.length > 3 then opts.src.length
                dest   : opts.dest
            @set_activity(id:id, stop:'')
        @_move_files(opts)

    delete_files: (opts) =>
        opts = defaults opts,
            paths : required
        if opts.paths.length == 0
            return
        for path in opts.paths
            @close_tab(path)
        id = misc.uuid()
        if underscore.isEqual(opts.paths, ['.trash'])
            mesg = "the trash"
        else if opts.paths.length == 1
            mesg = "#{opts.paths[0]}"
        else
            mesg = "#{opts.paths.length} files"
        @set_activity(id:id, status: "Deleting #{mesg}")
        webapp_client.exec
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

    download_file: (opts) =>
        {download_file, open_new_tab} = require('./misc_page')
        opts = defaults opts,
            path    : required
            log     : false
            auto    : true
            print   : false
            timeout : 45

        if opts.log
            @log
                event  : 'file_action'
                action : 'downloaded'
                files  : opts.path

        if opts.auto and not opts.print
            url = project_tasks(@project_id).download_href(opts.path)
            download_file(url)
        else
            url = project_tasks(@project_id).url_href(opts.path)
            tab = open_new_tab(url)
            if tab? and opts.print
                # "?" since there might be no print method -- could depend on browser API
                tab.print?()

    print_file: (opts) =>
        opts.print = true
        @download_file(opts)

    show_upload : (show) =>
        @setState(show_upload : show)

    # Compute the absolute path to the file with given name but with the
    # given extension added to the file (e.g., "md") if the file doesn't have
    # that extension.  Throws an Error if the path name is invalid.
    _absolute_path: (name, current_path, ext) =>
        if name.length == 0
            throw Error("Cannot use empty filename")
        for bad_char in BAD_FILENAME_CHARACTERS
            if name.indexOf(bad_char) != -1
                throw Error("Cannot use '#{bad_char}' in a filename")
        s = misc.path_to_file(current_path, name)
        if ext? and misc.filename_extension(s) != ext
            s = "#{s}.#{ext}"
        return s

    create_folder: (opts) =>
        opts = defaults opts,
            name         : required
            current_path : undefined
            switch_over  : true       # Whether or not to switch to the new folder
        {name, current_path, switch_over} = opts
        @setState(file_creation_error: undefined)
        if name[name.length - 1] == '/'
            name = name.slice(0, -1)
        try
            p = @_absolute_path(name, current_path)
        catch e
            @setState(file_creation_error: e.message)
            return
        project_tasks(@project_id).ensure_directory_exists
            path : p
            cb   : (err) =>
                if err
                    @setState(file_creation_error: "Error creating directory '#{p}' -- #{err}")
                else if switch_over
                    @open_directory(p)

    create_file: (opts) =>
        opts = defaults opts,
            name         : undefined
            ext          : undefined
            current_path : undefined
            switch_over  : true       # Whether or not to switch to the new file
        @setState(file_creation_error:undefined)  # clear any create file display state
        name = opts.name
        if (name == ".." or name == ".") and not opts.ext?
            @setState(file_creation_error: "Cannot create a file named . or ..")
            return
        if misc.is_only_downloadable(name)
            @new_file_from_web(name, opts.current_path)
            return
        if name[name.length - 1] == '/'
            if not opts.ext?
                @create_folder
                    name          : name
                    current_path  : opts.current_path
                return
            else
                name = name.slice(0, name.length - 1)
        try
            p = @_absolute_path(name, opts.current_path, opts.ext)
        catch e
            @setState(file_creation_error: e.message)
            return
        ext = misc.filename_extension(p)
        if ext in BANNED_FILE_TYPES
            @setState(file_creation_error: "Cannot create a file with the #{ext} extension")
            return
        if ext == 'tex'
            filename = misc.path_split(name).tail
            for bad_char in BAD_LATEX_FILENAME_CHARACTERS
                if filename.indexOf(bad_char) != -1
                    @setState(file_creation_error: "Cannot use '#{bad_char}' in a LaTeX filename '#{filename}'")
                    return
        webapp_client.exec
            project_id  : @project_id
            command     : 'smc-new-file'
            timeout     : 10
            args        : [p]
            err_on_exit : true
            cb          : (err, output) =>
                if err
                    @setState(file_creation_error: "#{output?.stdout ? ''} #{output?.stderr ? ''} #{err}")
                else if opts.switch_over
                    @open_file
                        path : p

    new_file_from_web: (url, current_path, cb) =>
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
                @fetch_directory_listing()
                @set_activity(id: id, stop:'')
                cb?(err)

    ###
    # Actions for PUBLIC PATHS
    ###
    set_public_path: (path, opts={}) =>
        obj =
            project_id  : @project_id
            path        : path
            description : opts.description or ""
            disabled    : false
            unlisted    : opts.unlisted or false
        return if not store = @get_store()
        obj.last_edited = obj.created = now = misc.server_time()
        # only set created if this obj is new; have to just linearly search through paths right now...
        store.public_paths?.map (v, k) ->
            if v.get('path') == path
                delete obj.created
                return false
        @redux.getProjectTable(@project_id, 'public_paths').set(obj)

    disable_public_path: (path) =>
        @redux.getProjectTable(@project_id, 'public_paths').set
            project_id  : @project_id
            path        : path
            disabled    : true
            last_edited : misc.server_time()


    ###
    # Actions for Project Search
    ###

    toggle_search_checkbox_subdirectories: =>
        return if not store = @get_store()
        @setState(subdirectories : not store.subdirectories)

    toggle_search_checkbox_case_sensitive: =>
        return if not store = @get_store()
        @setState(case_sensitive : not store.case_sensitive)

    toggle_search_checkbox_hidden_files: =>
        return if not store = @get_store()
        @setState(hidden_files : not store.hidden_files)

    toggle_search_checkbox_git_grep: =>
        return if not store = @get_store()
        @setState(git_grep : not store.git_grep)

    process_results: (err, output, max_results, max_output, cmd) =>
        return if not store = @get_store()
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

        if store.command is cmd # only update the state if the results are from the most recent command
            @setState
                too_many_results : too_many_results
                search_results   : search_results

    search: =>
        return if not store = @get_store()

        query = store.user_input.trim().replace(/"/g, '\\"')
        if query is ''
            return
        search_query = '"' + query + '"'

        # generate the grep command for the given query with the given flags
        if store.case_sensitive
            ins = ''
        else
            ins = ' -i '

        if store.git_grep
            if store.subdirectories
                max_depth = ''
            else
                max_depth = '--max-depth=0'
            cmd = "git rev-parse --is-inside-work-tree && git grep -I -H #{ins} #{max_depth} #{search_query} || "
        else
            cmd = ''
        if store.subdirectories
            if store.hidden_files
                cmd += "rgrep -I -H --exclude-dir=.smc --exclude-dir=.snapshots #{ins} #{search_query} -- *"
            else
                cmd += "rgrep -I -H --exclude-dir='.*' --exclude='.*' #{ins} #{search_query} -- *"
        else
            if store.hidden_files
                cmd += "grep -I -H #{ins} #{search_query} -- .* *"
            else
                cmd += "grep -I -H #{ins} #{search_query} -- *"

        cmd += " | grep -v #{MARKERS.cell}"
        max_results = 1000
        max_output  = 110 * max_results  # just in case

        @setState
            search_results     : undefined
            search_error       : undefined
            command            : cmd
            most_recent_search : query
            most_recent_path   : store.current_path

        webapp_client.exec
            project_id      : @project_id
            command         : cmd + " | cut -c 1-256"  # truncate horizontal line length (imagine a binary file that is one very long line)
            timeout         : 20   # how long grep runs on client
            network_timeout : 25   # how long network call has until it must return something or get total error.
            max_output      : max_output
            bash            : true
            err_on_exit     : true
            path            : store.current_path
            cb              : (err, output) =>
                @process_results(err, output, max_results, max_output, cmd)

    # Loads path in this project from string
    #  files/....
    #  new
    #  log
    #  settings
    #  search
    load_target: (target, foreground=true, ignore_kiosk=false) =>
        segments = target.split('/')
        full_path = segments.slice(1).join('/')
        parent_path = segments.slice(1, segments.length-1).join('/')
        last = segments.slice(-1).join()
        #if DEBUG then console.log("ProjectStore::load_target args:", segments, full_path, parent_path, last, foreground, ignore_kiosk)
        switch segments[0]
            when 'files'
                if target[target.length-1] == '/' or full_path == ''
                    #if DEBUG then console.log("ProjectStore::load_target → open_directory", parent_path)
                    @open_directory(parent_path)
                else
                    # TODOJ: Change when directory listing is synchronized. Just have to query client state then.
                    # Assume that if it's loaded, it's good enough.
                    async.waterfall [
                        (cb) =>
                            if not store = @get_store()
                                cb('no store')
                            else
                                {item, err} = store.get_item_in_path(last, parent_path)
                                #if DEBUG then console.log("ProjectStore::load_target → waterfall1", item, err)
                                cb(err, item)
                        (item, cb) => # Fetch if error or nothing found
                            if not item?
                                #if DEBUG then console.log("ProjectStore::load_target → fetch_directory_listing", parent_path)
                                @fetch_directory_listing
                                    path         : parent_path
                                    finish_cb    : =>
                                        if not store = @get_store()
                                            cb('no store')
                                        else
                                            {item, err} = store.get_item_in_path(last, parent_path)
                                            #if DEBUG then console.log("ProjectStore::load_target → waterfall2/1", item, err)
                                            cb(err, item)
                            else
                                #if DEBUG then console.log("ProjectStore::load_target → waterfall2/2", item)
                                cb(undefined, item)
                    ], (err, item) =>
                        if err?
                            if err == 'timeout'
                                alert_message(type:'error', message:"Timeout opening '#{target}' -- try later")
                            else
                                alert_message(type:'error', message:"Error opening '#{target}': #{err}")
                        if item?.get('isdir')
                            @open_directory(full_path)
                        else
                            #if DEBUG then console.log("ProjectStore::load_target → open_file", full_path, foreground, ignore_kiosk)
                            @open_file
                                path                 : full_path
                                foreground           : foreground
                                foreground_project   : foreground
                                ignore_kiosk         : ignore_kiosk

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

    show_extra_free_warning: =>
        @setState(free_warning_extra_shown : true)

    close_free_warning: =>
        @setState(free_warning_closed : true)


create_project_store_def = (name, project_id) ->
    name: name

    project_id: project_id

    _init: ->
        # If we are explicitly listed as a collaborator on this project,
        # watch for this to change, and if it does, close the project.
        # This avoids leaving it open after we are removed, which is confusing,
        # given that all permissions have vanished.
        projects = @redux.getStore('projects')  # may not be available; for example when testing
        if projects?.getIn(['project_map', @project_id])?  # only do this if we are on project in the first place!
            projects.on('change', @_projects_store_collab_check)

    destroy: ->
        @redux.getStore('projects')?.removeListener('change', @_projects_store_collab_check)

    _projects_store_collab_check: (state) ->
        if not state.getIn(['project_map', @project_id])?
            # User has been removed from the project!
            @redux.getActions('page').close_project_tab(@project_id)

    getInitialState: =>
        current_path           : ''
        history_path           : ''
        show_hidden            : false
        checked_files          : immutable.Set()
        public_paths           : undefined
        directory_listings     : immutable.Map()
        user_input             : ''
        show_upload            : false
        active_project_tab     : 'files'
        open_files_order       : immutable.List([])
        open_files             : immutable.Map({})
        num_ghost_file_tabs    : 0
        library                : immutable.Map({})
        library_selected       : undefined
        library_is_copying     : false
        git_grep               : true

    reduxState:
        account:
            other_settings: rtypes.immutable.Map

    stateTypes:
        # Shared
        current_path       : rtypes.string
        history_path       : rtypes.string
        open_files         : rtypes.immutable.Map
        open_files_order   : rtypes.immutable.List
        public_paths       : rtypes.immutable.List
        directory_listings : rtypes.immutable
        show_upload        : rtypes.bool
        create_file_alert  : rtypes.bool
        displayed_listing  : computed rtypes.object

        # Project Page
        active_project_tab       : rtypes.string
        free_warning_closed      : rtypes.bool     # Makes bottom height update
        free_warning_extra_shown : rtypes.bool
        num_ghost_file_tabs      : rtypes.number

        # Project Files
        activity               : rtypes.immutable
        active_file_sort       : rtypes.object     # {column_name : string, is_descending : bool}
        page_number            : rtypes.number
        file_action            : rtypes.string
        file_search            : rtypes.string
        show_hidden            : rtypes.bool
        error                  : rtypes.string
        checked_files          : rtypes.immutable
        selected_file_index    : rtypes.number     # Index on file listing to highlight starting at 0. undefined means none highlighted
        new_name               : rtypes.string
        most_recent_file_click : rtypes.string

        # Project Log
        project_log : rtypes.immutable
        search      : rtypes.string
        page        : rtypes.number

        # Project New
        default_filename    : rtypes.string
        file_creation_error : rtypes.string
        library             : rtypes.immutable.Map
        library_selected    : rtypes.object
        library_is_copying  : rtypes.bool  # for the copy button, to signal an ongoing copy process
        library_docs_sorted : computed rtypes.immutable.List

        # Project Find
        user_input         : rtypes.string
        search_results     : rtypes.immutable.List
        search_error       : rtypes.string
        too_many_results   : rtypes.bool
        command            : rtypes.string
        most_recent_search : rtypes.string
        most_recent_path   : rtypes.string
        subdirectories     : rtypes.bool
        case_sensitive     : rtypes.bool
        hidden_files       : rtypes.bool
        info_visible       : rtypes.bool
        git_grep           : rtypes.bool

        # Project Settings
        get_public_path_id : rtypes.func
        stripped_public_paths : computed rtypes.immutable.List

    # Non-default input functions
    get_public_path_id: ->
        project_id = @project_id
        (path) ->
            # (this exists because rethinkdb doesn't have compound primary keys)
            {SCHEMA, client_db} = require('smc-util/schema')
            return SCHEMA.public_paths.user_query.set.fields.id({project_id:project_id, path:path}, client_db)

    active_file_sort: ->
        if @get('active_file_sort')?
            return @get('active_file_sort').toJS()
        else
            is_descending = false
            column_name = @redux.getStore('account').getIn(['other_settings', 'default_file_sort'])
            return {is_descending, column_name}

    # Computed values

    # cached pre-processed file listing, which should always be up to date when
    # called, and properly depends on dependencies.
    displayed_listing: depends('active_file_sort', 'current_path', 'history_path', 'directory_listings', 'stripped_public_paths', 'file_search', 'other_settings', 'show_hidden') ->
        search_escape_char = '/'
        listing = @directory_listings.get(@current_path)
        if typeof(listing) == 'string'
            if listing.indexOf('ECONNREFUSED') != -1 or listing.indexOf('ENOTFOUND') != -1
                return {error:'no_instance'}  # the host VM is down
            else if listing.indexOf('o such path') != -1
                return {error:NO_DIR}
            else if listing.indexOf('ot a directory') != -1
                return {error:NOT_A_DIR}
            else if listing.indexOf('not running') != -1  # yes, no underscore.
                return {error:'not_running'}
            else
                return {error:listing}
        if not listing?
            return {}
        if listing?.errno?
            return {error:misc.to_json(listing)}
        listing = listing.toJS()

        if @other_settings.get('mask_files')
            COMPUTE_FILE_MASKS(listing)

        if @current_path == '.snapshots'
            @_compute_snapshot_display_names(listing)

        search = @file_search?.toLowerCase()
        if search and search[0] isnt search_escape_char
            listing = @_matched_files(search, listing)

        sorter = switch @active_file_sort.column_name
            when "name" then @_sort_on_string_field("name")
            when "time" then @_sort_on_numerical_field("mtime", -1)
            when "size" then @_sort_on_numerical_field("size")
            when "type"
                (a, b) =>
                    if a.isdir and not b.isdir
                        return -1
                    else if b.isdir and not a.isdir
                        return 1
                    else
                        return misc.cmp_array(a.name.split('.').reverse(), b.name.split('.').reverse())

        listing.sort(sorter)

        if @active_file_sort.is_descending
            listing.reverse()

        listing = (l for l in listing when not l.name.startsWith('.')) unless @show_hidden

        map = {}
        for x in listing
            map[x.name] = x

        x = {listing: listing, public:{}, path:@current_path, file_map:map}

        @_compute_public_files(x, @stripped_public_paths, @current_path)

        return x

    stripped_public_paths: depends('public_paths') ->
        if @public_paths?
            return immutable.fromJS(misc.copy_without(x,['id','project_id']) for _,x of @public_paths.toJS())


    library_docs_sorted: depends('library') ->
        docs     = @library.getIn(['examples', 'documents'])
        metadata = @library.getIn(['examples', 'metadata'])

        if docs?
            # sort by a triplet: idea is to have the docs sorted by their category,
            # where some categories have weights (e.g. "introduction" comes first, no matter what)
            sortfn = (doc) -> [
                metadata.getIn(['categories', doc.get('category'), 'weight']) ? 0
                metadata.getIn(['categories', doc.get('category'), 'name']).toLowerCase()
                doc.get('title')?.toLowerCase() ? doc.get('id')
            ]
            return docs.sortBy(sortfn)


    # Returns the cursor positions for the given project_id/path, if that
    # file is opened, and supports cursors and is either old (and ...) or
    # is in react and has store with a cursors key.
    get_users_cursors: (path, account_id) ->
        store = redux.getEditorStore(@project_id, path)
        if not store?
            # try non-react editor
            return wrapped_editors.get_editor(@project_id, path)?.get_users_cursors?(account_id)
        else
            return store.get('cursors')?.get(account_id)

    # Not a property
    is_file_open: (path) ->
        return @getIn(['open_files', path])?

    # Returns
    # Not a property
    get_item_in_path: (name, path) ->
        listing = @directory_listings.get(path)
        if typeof listing == 'string'   # must be an error
            return {err : listing}
        return {item : listing?.find (val) => val.get('name') == name}

    get_raw_link: (path) ->
        url = document.URL
        url = url[0...url.indexOf('/projects/')]
        return "#{url}/#{@project_id}/raw/#{misc.encode_path(path)}"

    _match: (words, s, is_dir) ->
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

    _matched_files: (search, listing) ->
        if not listing?
            return []
        words = search.split(" ")
        return (x for x in listing when @_match(words, x.display_name ? x.name, x.isdir))

    _compute_snapshot_display_names: (listing) ->
        for item in listing
            tm = misc.parse_bup_timestamp(item.name)
            item.display_name = "#{tm}"
            item.mtime = (tm - 0)/1000

    # Mutates data to include info on public paths.
    _compute_public_files: (data, public_paths, current_path) =>
        listing = data.listing
        pub = data.public
        if public_paths? and public_paths.size > 0
            head = if current_path then current_path + '/' else ''
            paths = []
            public_path_data = {}
            for x in public_paths.toJS()
                public_path_data[x.path] = x
                paths.push(x.path)
            for x in listing
                full = head + x.name
                p = misc.containing_public_path(full, paths)
                if p?
                    x.public = public_path_data[p]
                    x.is_public = not x.public.disabled
                    pub[x.name] = public_path_data[p]


    _sort_on_string_field: (field) =>
        (a,b) -> misc.cmp(a[field]?.toLowerCase() ? "", b[field]?.toLowerCase() ? "")

    _sort_on_numerical_field: (field, factor=1) =>
        (a,b) -> misc.cmp((a[field] ? -1) * factor, (b[field] ? -1) * factor)

exports.init = (project_id) ->
    must_define(redux)
    name  = project_redux_name(project_id)
    store = redux.getStore(name)
    if store?
        return

    # Initialize everything
    actions = redux.createActions(name, ProjectActions)
    actions.project_id = project_id  # so actions can assume this is available on the object
    store = redux.createStore(create_project_store_def(name, project_id))

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
        T = redux.createTable(project_redux_name(project_id, table_name), create_table(table_name, q))

    return

prom_client = require('./prom-client')
if prom_client.enabled
    prom_get_dir_listing_h = prom_client.new_histogram(
        'get_dir_listing_seconds', 'get_directory_listing time',
         {buckets : [1, 2, 5, 7, 10, 15, 20, 30, 50], labels: ['public', 'state', 'err']})

exports.get_directory_listing = get_directory_listing = (opts) ->
    opts = defaults opts,
        project_id : required
        path       : required
        hidden     : required
        max_time_s : required
        group      : required
        cb         : required

    {webapp_client} = require('./webapp_client')

    if prom_client.enabled
        prom_dir_listing_start = misc.server_time()
        prom_labels = {public: false}

    if opts.group in ['owner', 'collaborator', 'admin']
        method = webapp_client.project_directory_listing
        # Also, make sure project starts running, in case it isn't.
        state = redux.getStore('projects').getIn(['project_map', opts.project_id, 'state', 'state'])
        if prom_client.enabled
            prom_labels.state = state
        if state != 'running'
            timeout = .5
            time0 = misc.server_time()
            redux.getActions('projects').start_project(opts.project_id)
        else
            timeout = 1
    else
        state = time0 = undefined
        method  = webapp_client.public_project_directory_listing
        timeout = 15
        if prom_client.enabled
            prom_labels.public = true

    listing     = undefined
    listing_err = undefined
    f = (cb) ->
        #console.log 'get_directory_listing.f ', opts.path
        method
            project_id : opts.project_id
            path       : opts.path
            hidden     : opts.hidden
            timeout    : timeout
            cb         : (err, x) ->
                #console.log("f ", err, x)
                if err
                    if timeout < 5
                        timeout *= 1.3
                    cb(err)
                else
                    if x?.error
                        if x.error.code == 'ENOENT'
                            listing_err = NO_DIR
                        else if x.error.code == 'ENOTDIR'
                            listing_err = NOT_A_DIR
                        else
                            listing_err = x.error
                        cb()
                    else
                        listing = x
                        cb()

    misc.retry_until_success
        f           : f
        max_time    : opts.max_time_s * 1000
        start_delay : 100
        max_delay   : 1000
        #log         : console.log
        cb          : (err) ->
            #console.log opts.path, 'get_directory_listing.success or timeout', err
            if prom_client.enabled and prom_dir_listing_start?
                prom_labels.err = !!err
                tm = (misc.server_time() - prom_dir_listing_start) / 1000
                if not isNaN(tm)
                    prom_get_dir_listing_h?.observe(prom_labels, tm)

            opts.cb(err ? listing_err, listing)
            if time0 and state != 'running' and not err
                # successfully opened, started, and got directory listing
                redux.getProjectActions(opts.project_id).log
                    event : 'start_project'
                    time  : misc.server_time() - time0
