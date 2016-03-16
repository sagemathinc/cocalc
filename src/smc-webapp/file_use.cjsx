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

###

File Usage Notifications

AUTHORS:
   - first version written by William Stein, July 25-?, 2015, while unemployed.

TODO:

- [x] (0:30)  basic structure and plan
- [x] (0:15?) (0:22) sorted file use by last_edited timestamp
- [x] (0:30?) (0:24) display items a little more readably
- [x] (0:30?) (0:55) search
- [x] (0:30?) (0:27) click to open file
- [x] (0:45?) (0:25) -- proper handling of .sage-chat, ipython, etc. extensions -- seems not working right -- see hub.
- [x] (0:45?) (1:22) notification number
- [x] (0:30?) deal with this in misc_page.coffee: `#u = require('activity').important_count()`
- [x] (1:45) fix subtle backend database issues needed for marking read/seen
- [x] (0:45?) (2:06) mark read
    - [x] (0:42) make an action that takes a single id or array of them as input and marks them all read/seen/etc.
    - [x] (0:24) make clicking mark that one as read
    - [x] (1:00) mark all as read button
- [x] (0:45?) (0:03) mark all seen
- [x] (0:30?) (0:12) click to open file needs to open the chat if there are unseen chats
- [x] (1:00?) (1:02) if list of projects you collaborate on changes, must reset the file_use table, since the files you watched change as a result; client or server side?
- [x] (0:45?) (0:18) delete old polling based activity notification code from hub; delete old activity notification code from page
- [x] (1:00?) (0:30) cursor and enter to open first thing in notification search -- like in log
- [x] (2:00?) (2:15) make pretty:
   - [x] make wider
   - [x] move mark_all_read button to upper right
   - [x] spacing around file_use item
   - [x] color to indicate read
   - [x] color to indicate unseen
   - [x] comment indication
   - [x] truncate long project name
   - [x] truncate long user name
   - [x] truncate long filename
   - [x] nicer layout
   - [x] file type icons
   - [x] special highlight first entry so user knows can open on enter
   - [x] use timeago for when
   - [x] truncate too many names
- [x] (2:00?) optimize
   - [x] (0:30?) (0:30) only show first few notifications and have a button to show more
   - [x] (1:30?) (0:29) switch to immutable.js info and shouldComponentUpdate and optimize when do search


LATER/UNRELATED:

- [ ] (1:00?) address this comment in client.coffee "TODO: must group all queries in one call."
- [ ] (1:00?) in general, open_file needs some sort of visual feedback while it is happening (in any situation)

###


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

editor = require('./editor')

# react in smc-specific modules
{React, ReactDOM, Actions, Store, Table, rtypes, rclass, Redux, redux}  = require('./smc-react')
{r_join, Icon, Loading, LoginLink, SearchInput, TimeAgo} = require('./r_misc')
{Button, Col, Row} = require('react-bootstrap')
{User} = require('./users')


_global_notify_count = 0  # TODO: will be eliminated in rewrite and moved to a store...

class FileUseActions extends Actions
    record_error: (err) =>
        # Record in the store that an error occured as a result of some action
        # This should get displayed to the user...
        if not typeof(err) == 'string'
            err = misc.to_json(err)
        @setState(errors: @redux.getStore('file_use').get_errors().push(immutable.Map({time:new Date(), err:err})))

    # Mark a record (or array of them) x with the given action happening now for this user.
    # INPUT:
    #    - x: uuid or array of uuid's of file_use records
    #    - action: 'read', 'seen', 'edit', 'chat'
    mark: (x, action) =>
        if not misc.is_array(x)
            x = [x]
        table = @redux.getTable('file_use')
        account_id = @redux.getStore('account').get_account_id()
        u = {"#{account_id}":{"#{action}":new Date()}}
        f = (id, cb) =>
            table.set {id:id, users:u}, (err)=>
                if err then err += "(id=#{id}) #{err}"
                cb(err)
        async.map x, f, (err) =>
            if err
                @record_error("error marking record #{action} -- #{err}")

    mark_all: (action) =>
        if action == 'read'
            v = @redux.getStore('file_use').get_all_unread()
        else if action == 'seen'
            v = @redux.getStore('file_use').get_all_unseen()
        else
            @record_error("mark_all: unknown action '#{action}'")
        @mark((x.id for x in v), action)

    mark_file: (project_id, path, action) =>
        #console.log("mark_file: '#{project_id}'   '#{path}'   '#{action}'")
        account_id = @redux.getStore('account').get_account_id()
        if not account_id?
            # nothing to do -- non-logged in users shouldn't be marking files
            return
        table = @redux.getTable('file_use')
        now   = new Date()
        obj   =
            project_id : project_id
            path       : path
            users      : {"#{account_id}":{"#{action}":now}}
        if action == 'edit' or action == 'chat'
            # Update the overall "last_edited" field for the file; this is used for sorting,
            # and grabbing only recent files from database for file use notifications.
            obj.last_edited = now
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
        you_last_seen = you_last_read = 0
        other_newest_edit_or_chat = 0
        for account_id, user of users
            user.account_id = account_id
            user.last_edited = Math.max(user.edit ? 0, user.chat ? 0)
            if user.chat?
                newest_chat = Math.max(newest_chat, user.chat ? 0)
            user.last_read = Math.max(user.last_edited, user.read ? 0)
            user.last_seen = Math.max(user.last_read, user.seen ? 0)
            if @_account_id == account_id
                you_last_seen = user.last_seen
                you_last_read = user.last_read
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
        @get('file_use').map (x,_) =>
            y = x.toJS()
            y.search = @_search(y)
            @_process_users(y)
            v.push(y)
        v.sort (a,b)->misc.cmp(b.last_edited, a.last_edited)
        @_cache =
            sorted_file_use_list : v
            sorted_file_use_immutable_list : immutable.fromJS(v)
            notify_count         : (x for x in v when x.notify).length
        return v

    # See above for the definition of unread and unseen.
    get_all_unread: =>
        return (x for x in @get_sorted_file_use_list() when x.is_unread)

    get_all_unseen: =>
        return (x for x in @get_sorted_file_use_list() when x.is_unseen)

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
    redux.getActions('file_use').mark(info.id, 'read')
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

    shouldComponentUpdate : (nextProps) ->
        a = @props.info != nextProps.info or @props.cursor != nextProps.cursor or \
            @props.user_map != nextProps.user_map or @props.project_map != nextProps.project_map
        return a

    render_users : ->
        if @info.users?
            v = []
            # only list users who have actually done something aside from mark read/seen this file
            users = (user for user in @info.users when user.last_edited)
            for user in users.slice(0,MAX_USERS)
                v.push <User key={user.account_id} account_id={user.account_id}
                        name={"You" if user.account_id==@props.account_id}
                        user_map={@props.user_map} last_active={user.last_edited} />
            return r_join(v)

    render_last_edited : ->
        if @info.last_edited?
            <span key='last_edited' >
                was edited <TimeAgo date={@info.last_edited} />
            </span>

    open : (e) ->
        e?.preventDefault()
        open_file_use_entry(@info, @props.redux)

    render_path : ->
        #  style={if @info.is_unread then {fontWeight:'bold'}}
        <span key='path' style={fontWeight:'bold'}>
            {misc.trunc_middle(@info.path, TRUNCATE_LENGTH)}
        </span>

    render_project : ->
        <em key='project'>
            {misc.trunc(@props.project_map.get(@info.project_id)?.get('title'), TRUNCATE_LENGTH)}
        </em>

    render_what_is_happening : ->
        if not @info.users?
            return @render_last_edited()
        if @info.show_chat
            return <span>discussed by </span>
        return <span>edited by </span>

    render_action_icon : ->
        if @info.show_chat
            return <Icon name='comment' />
        else
            return <Icon name='edit' />

    render_type_icon : ->
        <FileIcon filename={@info.path} />

    render : ->
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

    getInitialState : ->
        search   : ''
        cursor   : 0
        show_all : false

    render_search_box : ->
        <span key='search_box' className='smc-file-use-notifications-search' >
            <SearchInput
                placeholder   = "Search..."
                default_value = {@state.search}
                on_change     = {(value)=>@setState(search:value, cursor:0, show_all:false)}
                on_submit     = {@open_selected}
                on_escape     = {(before)=>if not before then hide_notification_list();@setState(cursor:0, show_all:false)}
                on_up         = {=>@setState(cursor: Math.max(0, @state.cursor-1))}
                on_down       = {=>@setState(cursor: Math.max(0, Math.min((@_visible_list?.length ? 0)-1, @state.cursor+1)))}
            />
        </span>

    render_mark_all_read_button : ->
        <Button key='mark_all_read_button' bsStyle='warning'
            onClick={=>@props.redux.getActions('file_use').mark_all('read')}>
            <Icon name='check-square'/> Mark all Read
        </Button>

    open_selected: ->
        open_file_use_entry(@_visible_list?[@state.cursor].toJS(), @props.redux)
        hide_notification_list()

    render_list : ->
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

    render_show_all : ->
        if @_num_missing
            <Button key="show_all" onClick={(e)=>e.preventDefault(); @setState(show_all:true); setTimeout(resize_notification_list, 1)}>
                Show {@_num_missing} more
            </Button>

    render_show_less : ->
        n = @_visible_list.length - SHORTLIST_LENGTH
        if n > 0
            <Button key="show_less" onClick={(e)=>e.preventDefault(); @setState(show_all:false); setTimeout(resize_notification_list, 1)}>
                Show {n} less
            </Button>

    render_toggle_all : ->
        <div key='toggle_all' style={textAlign:'center', marginTop:'2px'}>
            {if @state.show_all then @render_show_less() else @render_show_all()}
        </div>

    render : ->
        <div>
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

    render : ->
        ext = misc.filename_extension_notilde(@props.filename)
        <Icon name={editor.file_icon_class(ext).slice(3)} />


FileUseController = rclass
    displayName : 'FileUseController'

    reduxProps :
        file_use :
            file_use    : rtypes.immutable
        users :
            user_map    : rtypes.immutable
        projects :
            project_map : rtypes.immutable

    propTypes :
        redux : rtypes.object

    render : ->
        account_id = @props.redux?.getStore('account')?.get_account_id()
        if not @props.file_use? or not @props.redux? or not @props.user_map? or not @props.project_map? or not account_id?
            if @props.redux.getStore('account')?.get_user_type() == 'public'
                return <LoginLink />
            else
                return <Loading/>
        file_use_list = @props.redux.getStore('file_use').get_sorted_file_use_list2()
        <FileUseViewer redux={@props.redux} file_use_list={file_use_list} user_map={@props.user_map} project_map={@props.project_map} account_id={account_id} />

render = (redux) ->
    <Redux redux={redux}>
        <FileUseController redux={redux} />
    </Redux>

init_redux = (redux) ->
    if not redux.getActions('file_use')?
        redux.createActions('file_use', FileUseActions)
        store = redux.createStore('file_use', FileUseStore, {})
        redux.createTable('file_use', FileUseTable)
        store.on 'change', ->
            update_global_notify_count(store.get_notify_count())

render_file_use = (redux, dom_node) ->
    ReactDOM.render(render(redux), dom_node)

unmount = (dom_node) ->
    #console.log("unmount file_use")
    ReactDOM.unmountComponentAtNode(notification_list[0])

# WARNING: temporary jquery spaghetti below
# For now hook in this way -- obviously this breaks isomorphic encapsulation, etc...
$('body').append($('<div class="salvus-notification-list hide"></div>'))
notification_indicator = $(".salvus-notification-indicator")
notification_indicator.show()
notification_list = $(".salvus-notification-list")
notification_list_is_hidden = true
notification_count = $(".salvus-notification-unseen-count")

resize_notification_list = () ->
    if not notification_list.is(":visible")
        return
    notification_list.removeAttr('style')  # gets rid of the custom height from before
    max_height = $(window).height() - 50
    if notification_list.height() > max_height
        notification_list.height(max_height)
    # hack since on some browser scrollbar looks wrong otherwise.
    notification_list.hide()
    notification_list.show()

notification_list_click = (e) ->
    e.preventDefault()
    target = $(e.target)
    if target.parents('.smc-file-use-notifications-search').length or target.hasClass('btn') or target.parents('button').length
        return
    # timeout is to give plenty of time for the click to register with react's event handler, so fiee opens
    setTimeout(hide_notification_list, 100)
    notification_list_is_hidden = true

unbind_handlers = () ->
    $(document).unbind('click', notification_list_click)
    $(window).unbind('resize', resize_notification_list)

hide_notification_list = ->
    notification_indicator.parent().removeClass('active')
    notification_list.hide()
    unbind_handlers()
    unmount(notification_list[0])

key_handlers = []
unset_key_handlers = ->  # horrible temporary hack used by tasks list for now -- again React/Stores should fix this.
    for f in key_handlers
        f()

exports.add_unset_key_handler = (f) -> key_handlers.push(f)

show_notification_list = ->
    notification_indicator.parent().addClass('active')
    render_file_use(redux, notification_list[0])
    setTimeout((()=>redux.getActions('file_use').mark_all('seen')), MARK_SEEN_TIME_S*1000)
    notification_list.show()
    $(document).click(notification_list_click)
    $(window).resize(resize_notification_list)
    unset_key_handlers()
    notification_list.find("input").focus()
    setTimeout(resize_notification_list, 1)

notification_indicator.click () ->
    if notification_list_is_hidden
        show_notification_list()
    else
        hide_notification_list()
    notification_list_is_hidden = not notification_list_is_hidden
    return false

require('./browser').set_notify_count_function(-> _global_notify_count)

# update old jquery stuff (TODO: eliminate when finishing rewrite one level up)
update_global_notify_count = (n) ->
    _global_notify_count = n
    if n == 0
        notification_count.text('')
    else
        notification_count.text(n)
    require('./browser').set_window_title()

init_redux(redux)

