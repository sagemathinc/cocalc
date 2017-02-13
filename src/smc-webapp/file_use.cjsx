###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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

###

File Usage Notifications

DOC:

To mark a file as read:

    redux.getActions('file_use').mark_file(project_id, path, 'chat')

###

$ = window.$

# Magic constants:

# Maximum number of distinct user names to show in a notification
MAX_USERS = 5
# How long after opening log to mark all seen
MARK_SEEN_TIME_S = 3
# Length to truncate project title and filename to.
TRUNCATE_LENGTH = 50
# Number of notifications to show if "Show All" isn't clicked
SHORTLIST_LENGTH = 40


# standard modules
async     = require('async')
immutable = require('immutable')

# smc-specific modules
misc = require('smc-util/misc')
{required, defaults} = misc
{salvus_client} = require('./salvus_client')
editor = require('./editor')

sha1 = require('smc-util/schema').client_db.sha1

# react in smc-specific modules
{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux, redux}  = require('./smc-react')
{r_join, Icon, Loading, LoginLink, SearchInput, TimeAgo} = require('./r_misc')
{Button, Col, Row} = require('react-bootstrap')
{User} = require('./users')

class FileUseActions extends Actions
    record_error: (err) =>
        # Record in the store that an error occured as a result of some action
        # This should get displayed to the user...
        if not typeof(err) == 'string'
            err = misc.to_json(err)
        @setState(errors: @redux.getStore('file_use').get_errors().push(immutable.Map({time:salvus_client.server_time(), err:err})))

    # OPTIMIZATION: This updates and rerenders for each item. Change to doing it in a batch.
    mark_all: (action) =>
        if action == 'read'
            v = @redux.getStore('file_use').get_all_unread()
        else if action == 'seen'
            v = @redux.getStore('file_use').get_all_unseen()
        else
            @record_error("mark_all: unknown action '#{action}'")
            return
        for x in v
            @mark_file(x.project_id, x.path, action, 0, false)

    # Mark the action for the given file with the current timestamp (right now).
    # If zero is true, instead mark the timestamp as 0, basically indicating removal
    # of that marking for that user.
    mark_file: (project_id, path, action, ttl='default', fix_path=true, timestamp=undefined) =>  # ttl in units of ms
        if fix_path
            # This changes .foo.txt.sage-chat to foo.txt.
            path = misc.original_path(path)
        #console.log('mark_file', project_id, path, action)
        account_id = @redux.getStore('account').get_account_id()
        if not account_id?
            # nothing to do -- non-logged in users shouldn't be marking files
            return
        if ttl
            if ttl == 'default'
                if action.slice(0,4) == 'chat'
                    ttl = 5*1000
                else
                    ttl = 90*1000
            #console.log('ttl', ttl)
            key = "#{project_id}-#{path}-#{action}"
            @_mark_file_lock ?= {}
            if @_mark_file_lock[key]
                return
            @_mark_file_lock[key] = true
            setTimeout((()=>delete @_mark_file_lock[key]), ttl)

        table = @redux.getTable('file_use')
        timestamp ?= salvus_client.server_time()
        timestamp = new Date(timestamp)
        obj   =
            project_id : project_id
            path       : path
            users      : {"#{account_id}":{"#{action}":timestamp}}
        if action == 'edit' or action == 'chat' or action == 'chatseen'
            # Update the overall "last_edited" field for the file; this is used for sorting,
            # and grabbing only recent files from database for file use notifications.
            obj.last_edited = timestamp
        table.set obj, (err)=>
            if err
                if err != "not connected" # ignore "not connected", since save will happen once connection goes through.
                    err += " (project_id=#{project_id}, path=#{path})"
                    console.warn("FileUseActions.mark_file error: ", err)

class FileUseStore extends Store
    get_errors: =>
        return @get('errors') ? immutable.List()

    _initialize_cache: =>
        @_users = @redux.getStore('users')
        if not @_users
            return
        @_projects = @redux.getStore('projects')
        if not @_projects
            return
        @_account = @redux.getStore('account')
        if not @_account
            return
        @_users.on 'change', @_clear_cache
        @_projects.on 'change', @_clear_cache
        @_account.on 'change', =>
            if @_account.get_account_id() != @_account_id
                @_clear_cache()
        @_cache_init = true
        return true

    _clear_cache: =>
        delete @_cache

    _search: (x) =>
        s = [x.path]
        s.push(@_projects.get_title(x.project_id))
        if x.users?
            for account_id,_ of x.users
                s.push(@_users.get_name(account_id))
                if account_id == @_account_id
                    s.push('you')
        return s.join(' ').toLowerCase()

    _process_users: (y) =>
        users = y.users
        if not users?
            return
        # make into list of objects
        v = []
        newest_chat = 0
        you_last_seen = you_last_read = you_last_chatseen = 0
        other_newest_edit_or_chat = 0
        for account_id, user of users
            user.account_id = account_id
            user.last_edited = Math.max(user.edit ? 0, user.chat ? 0)
            if user.chat?
                newest_chat = Math.max(newest_chat, user.chat ? 0)
            user.last_read = Math.max(user.last_edited, user.read ? 0)
            user.last_seen = Math.max(Math.max(user.last_read, user.seen ? 0), user.chatseen ? 0)
            user.last_used = Math.max(user.last_edited, user.open ? 0)
            if @_account_id == account_id
                you_last_seen = user.last_seen
                you_last_read = user.last_read
                you_last_chatseen = user.chatseen ? 0
            else
                other_newest_edit_or_chat = misc.max([other_newest_edit_or_chat, user.last_edited, user.chat ? 0])
            v.push(user)
        # sort users by their edit/chat time
        v.sort (a,b) -> misc.cmp(b.last_edited, a.last_edited)
        y.users = v
        y.newest_chat = newest_chat
        if not y.last_edited?
            for user in y.users
                y.last_edited = Math.max(y.last_edited ? 0, user.last_edited)
        # Notify you that there is a chat you don't know about at all (so you need to open notification list).
        y.notify = you_last_seen < newest_chat
        # Show in the notification list that there is a chat you haven't read
        y.show_chat = you_last_read < newest_chat
        # For our user, we define unread and unseen as follows:
        # - unread: means that the max timestamp for our edit and
        #   read fields is older than another user's edit or chat field
        y.is_unread = you_last_read < other_newest_edit_or_chat
        # - unseen: means that the max timestamp for our edit, read and seen
        #   fields is older than another edit or chat field
        y.is_unseen = you_last_seen < other_newest_edit_or_chat
        # - unseen chat: means that you haven't seen the newest chat for this document.
        y.is_unseenchat = you_last_chatseen < newest_chat

    get_notify_count: =>
        if not @_cache?
            @_update_cache()
        return @_cache?.notify_count ? 0

    get_sorted_file_use_list: =>
        if not @_cache?
            @_update_cache()
        return @_cache?.sorted_file_use_list ? []

    get_sorted_file_use_list2: =>
        if not @_cache?
            @_update_cache()
        return @_cache?.sorted_file_use_immutable_list ? immutable.List()

    # Get latest processed info about a specific file as an object.
    get_file_info: (project_id, path) =>
        if not @_cache?
            @_update_cache()
        return @_cache?.file_use_map[sha1(project_id, path)]

    # Get latest processed info about all use in a particular project.
    get_project_info: (project_id) =>
        if not @_cache?
            @_update_cache()
        v = {}
        for id, x of @_cache?.file_use_map
            if x.project_id == project_id
                v[id] = x
        return v

    get_file_use_map: =>
        if not @_cache?
            @_update_cache()
        return @_cache?.file_use_map

    _update_cache: =>
        if not @get('file_use')?
            return
        if not @_cache_init
            @_initialize_cache()
            if not @_cache_init
                return

        if @_cache?
            return

        @_account_id ?= @_account.get_account_id()
        v = []
        file_use_map = {}
        @get('file_use').map (x,id) =>
            y = x.toJS()
            y.search = @_search(y)
            @_process_users(y)
            v.push(y)
            file_use_map[id] = y
        w0 = []
        w1 = []
        w2 = []
        for a in v
            if a.notify and a.is_unread
                w0.push(a)
            else if a.show_chat and a.is_unread
                w1.push(a)
            else
                w2.push(a)
        c = (a,b) -> misc.cmp(b.last_edited, a.last_edited)
        w0.sort(c)
        w1.sort(c)
        w2.sort(c)
        v = w0.concat(w1.concat(w2))
        @_cache =
            sorted_file_use_list           : v
            sorted_file_use_immutable_list : immutable.fromJS(v)
            file_use_map                   : file_use_map
            notify_count                   : (x for x in v when x.notify).length
        require('browser').set_window_title()
        return v

    # See above for the definition of unread and unseen.
    get_all_unread: =>
        return (x for x in @get_sorted_file_use_list() when x.is_unread)

    get_all_unseen: =>
        return (x for x in @get_sorted_file_use_list() when x.is_unseen)

    # Return active users... across all projects, a given project, or a given path in a project,
    # depending on whether project_id or path is specified.  Returns info as a map
    #    {account_id:[{project_id:?, path:?, last_used:?}, {project_id:?, path:?, last_used:?}, ...}]}
    # Here last_used is the server timestamp (in milliseconds) of when they were last active there, and
    # project_id, path are what they were using.
    # Will return undefined in no data available yet.
    get_active_users: (opts) =>
        opts = defaults opts,
            project_id : undefined   # optional; if not given provide info about all projects
            path       : undefined   # if given, provide info about specific path in specific project only.
            max_age_s  : 600         # user is active if they were active within this amount of time
        files = undefined
        if opts.project_id? and opts.path?   # users for a particular file
            t = @get_file_info(opts.project_id, opts.path)
            if t? then files = {_:t}
        else if opts.project_id?             # a particular project
            files = @get_project_info(opts.project_id)
        else                                 # across all projects
            files = @get_file_use_map()
        if not files?                 # no data yet -- undefined signifies this.
            return
        users  = {}
        now    = salvus_client.server_time() - 0
        cutoff = now - opts.max_age_s*1000
        for _, info of files
            for user in info.users
                time = user.last_used ? 0
                # Note: we filter in future, since would be bad/buggy data.  (database could disallow...?)
                if time >= cutoff and time <= (now + 60000)   # new enough?
                    (users[user.account_id] ?= []).push  # create array if necessary, then push data about it
                        last_used  : user.last_used ? 0
                        project_id : info.project_id
                        path       : info.path
        return users

    get_video_chat_users: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            ttl        : 120000    # time in ms; if timestamp of video chat is older than this, ignore
        users = {}
        cutoff = salvus_client.server_time() - opts.ttl
        @getIn(['file_use', sha1(opts.project_id, opts.path), 'users'])?.map (info, account_id) ->
            timestamp = info.get('video')
            if timestamp? and timestamp - 0 >= cutoff
                users[account_id] = timestamp
        return users

class FileUseTable extends Table
    query: ->
        return 'file_use'

    _change: (table, keys) =>
        @redux.getStore('file_use')._clear_cache()
        @redux.getActions('file_use').setState(file_use: table.get())

open_file_use_entry = (info, redux) ->
    if not redux? or not info?.project_id? or not info?.path?
        return
    # mark this file_use entry read
    redux.getActions('file_use').mark_file(info.project_id, info.path, 'read')
    redux.getActions('page').toggle_show_file_use()
    # open the file
    require.ensure [], =>
        # ensure that we can get the actions for a specific project.
        require('./project_store')
        redux.getProjectActions(info.project_id).open_file
            path               : info.path
            foreground         : true
            foreground_project : true
            chat               : info.show_chat

file_use_style =
    border  : '1px solid #aaa'
    cursor  : 'pointer'
    padding : '8px'

FileUse = rclass
    displayName : 'FileUse'

    propTypes :
        info        : rtypes.object.isRequired
        account_id  : rtypes.string.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired
        redux       : rtypes.object
        cursor      : rtypes.bool

    shouldComponentUpdate: (nextProps) ->
        a = @props.info != nextProps.info or @props.cursor != nextProps.cursor or \
            @props.user_map != nextProps.user_map or @props.project_map != nextProps.project_map
        return a

    render_users: ->
        if @info.users?
            v = []
            # only list users who have actually done something aside from mark read/seen this file
            users = (user for user in @info.users when user.last_edited)
            for user in users.slice(0,MAX_USERS)
                v.push <User key={user.account_id} account_id={user.account_id}
                        name={"You" if user.account_id==@props.account_id}
                        user_map={@props.user_map} last_active={user.last_edited} />
            return r_join(v)

    render_last_edited: ->
        if @info.last_edited
            <span key='last_edited' >
                was edited <TimeAgo date={@info.last_edited} />
            </span>

    open: (e) ->
        e?.preventDefault()
        open_file_use_entry(@info, @props.redux)

    render_path: ->
        {name, ext} = misc.separate_file_extension(@info.path)
        name = misc.trunc_middle(name, TRUNCATE_LENGTH)
        ext  = misc.trunc_middle(ext, TRUNCATE_LENGTH)
        #  style={if @info.is_unread then {fontWeight:'bold'}}
        <span>
            <span style={fontWeight: if @info.is_unread then 'bold' else 'normal'}>{name}</span>
            <span style={color: if not @props.mask then '#999'}>{if ext is '' then '' else ".#{ext}"}</span>
        </span>

    render_project: ->
        <em key='project'>
            {misc.trunc(@props.project_map.get(@info.project_id)?.get('title'), TRUNCATE_LENGTH)}
        </em>

    render_what_is_happening: ->
        if not @info.users?
            return @render_last_edited()
        if @info.show_chat
            return <span>discussed by </span>
        return <span>edited by </span>

    render_action_icon: ->
        if @info.show_chat
            return <Icon name='comment' />
        else
            return <Icon name='edit' />

    render_type_icon: ->
        <FileIcon filename={@info.path} />

    render: ->
        @info = @props.info.toJS()
        style = misc.copy(file_use_style)
        if @info.notify
            style.background = '#ffffea'  # very light yellow
        else
            style.background = if @info.is_unread then '#f4f4f4' else '#fefefe'
        if @props.cursor
            misc.merge(style, {background: "#08c", color : 'white'})
        <div style={style} onClick={@open}>
            <Row>
                <Col key='action' sm=1 style={fontSize:'14pt'}>
                    {@render_action_icon()}
                </Col>
                <Col key='desc' sm=10>
                    {@render_path()} in {@render_project()} {@render_what_is_happening()} {@render_users()}
                </Col>
                <Col key='type' sm=1 style={fontSize:'14pt'}>
                    {@render_type_icon()}
                </Col>
            </Row>
        </div>

FileUseViewer = rclass
    displayName : 'FileUseViewer'

    propTypes :
        redux         : rtypes.object
        file_use_list : rtypes.object.isRequired
        user_map      : rtypes.object.isRequired
        project_map   : rtypes.object.isRequired
        account_id    : rtypes.string.isRequired

    getInitialState: ->
        search   : ''
        cursor   : 0
        show_all : false

    render_search_box: ->
        <span key='search_box' className='smc-file-use-notifications-search' >
            <SearchInput
                autoFocus     = {true}
                placeholder   = "Search..."
                default_value = {@state.search}
                on_change     = {(value)=>@setState(search:value, cursor:0, show_all:false)}
                on_submit     = {@open_selected}
                on_escape     = {(before)=>if not before then @actions('page').toggle_show_file_use();@setState(cursor:0, show_all:false)}
                on_up         = {=>@setState(cursor: Math.max(0, @state.cursor-1))}
                on_down       = {=>@setState(cursor: Math.max(0, Math.min((@_visible_list?.length ? 0)-1, @state.cursor+1)))}
            />
        </span>

    click_mark_all_read: ->
        @actions('file_use').mark_all('read')
        @actions('page').toggle_show_file_use()

    render_mark_all_read_button: ->
        <Button key='mark_all_read_button' bsStyle='warning'
            onClick={@click_mark_all_read}>
            <Icon name='check-square'/> Mark all Read
        </Button>

    open_selected: ->
        open_file_use_entry(@_visible_list?[@state.cursor]?.toJS(), @props.redux)

    render_list: ->
        v = @props.file_use_list.toArray()
        if @state.search
            s = misc.search_split(@state.search.toLowerCase())
            v = (x for x in v when misc.search_match(x.get('search'), s))
        if not @state.show_all
            @_num_missing = Math.max(0, v.length - SHORTLIST_LENGTH)
            v = v.slice(0, SHORTLIST_LENGTH)
        @_visible_list = v
        r = []
        for info,i in v
            r.push <FileUse key={"file-use-#{i}"}  cursor={i==@state.cursor}
                    redux={@props.redux} info={info} account_id={@props.account_id}
                     user_map={@props.user_map} project_map={@props.project_map} />
        return r

    render_show_all: ->
        if @_num_missing
            <Button key="show_all" onClick={(e)=>e.preventDefault(); @setState(show_all:true); setTimeout(resize_notification_list, 1)}>
                Show {@_num_missing} more
            </Button>

    render_show_less: ->
        n = @_visible_list.length - SHORTLIST_LENGTH
        if n > 0
            <Button key="show_less" onClick={(e)=>e.preventDefault(); @setState(show_all:false); setTimeout(resize_notification_list, 1)}>
                Show {n} less
            </Button>

    render_toggle_all: ->
        <div key='toggle_all' style={textAlign:'center', marginTop:'2px'}>
            {if @state.show_all then @render_show_less() else @render_show_all()}
        </div>

    render: ->
        <div className={"smc-file-use-viewer"}>
            <Row key='top'>
                <Col sm=8>
                    {@render_search_box()}
                </Col>
                <Col sm=4>
                    <div style={float:'right'}>
                        {@render_mark_all_read_button()}
                    </div>
                </Col>
            </Row>
            {@render_list()}
            {@render_toggle_all()}
        </div>


FileIcon = rclass
    displayName : 'FileUse-FileIcon'

    propTypes :
        filename : rtypes.string.isRequired

    render: ->
        ext = misc.filename_extension_notilde(@props.filename)
        <Icon name={editor.file_icon_class(ext).slice(3)} />


exports.FileUsePage = FileUseController = rclass
    displayName : 'FileUseController'

    reduxProps :
        file_use :
            file_use    : rtypes.immutable
            get_sorted_file_use_list2 : rtypes.func
        users :
            user_map    : rtypes.immutable
        projects :
            project_map : rtypes.immutable

    propTypes :
        redux : rtypes.object

    componentDidMount: () ->
        setTimeout((()=>@actions('file_use').mark_all('seen')), MARK_SEEN_TIME_S*1000)
        $(document).on("click", notification_list_click_handler)

    componentWillUnmount: () ->
        $(document).off("click", notification_list_click_handler)

    render: ->
        account_id = @props.redux?.getStore('account')?.get_account_id()
        if not @props.file_use? or not @props.redux? or not @props.user_map? or not @props.project_map? or not account_id?
            if @props.redux.getStore('account')?.get_user_type() == 'public'
                return <LoginLink />
            else
                return <Loading/>
        file_use_list = @props.get_sorted_file_use_list2()
        <FileUseViewer redux={@props.redux} file_use_list={file_use_list} user_map={@props.user_map} project_map={@props.project_map} account_id={account_id} />

notification_list_click_handler = (e) ->
    e.preventDefault()
    target = $(e.target)
    if target.parents('.smc-file-use-viewer').length or target.hasClass('btn') or target.parents('button').length or target.parents('a').attr('role') == 'button' or target.attr('role') == 'button'
        return
    # timeout is to give plenty of time for the click to register with react's event handler, so fiee opens
    setTimeout(redux.getActions('page').toggle_show_file_use, 100)

init_redux = (redux) ->
    if not redux.getActions('file_use')?
        redux.createActions('file_use', FileUseActions)
        store = redux.createStore('file_use', FileUseStore, {})
        redux.createTable('file_use', FileUseTable)

init_redux(redux)

# Updates the browser's awareness of a notifcation
require('./browser').set_notify_count_function(-> redux.getStore('file_use').get_notify_count())