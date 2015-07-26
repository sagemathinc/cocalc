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
- [ ] (0:30?) deal with this in misc_page.coffee: `#u = require('activity').important_count()`
- [ ] (0:45?) mark seen
- [ ] (0:45?) mark read
- [ ] (1:00?) make even more readable, e.g., file type icons, layout
- [ ] (0:30?) truncate: polish for when names, etc are long
- [ ] (0:30?) delete old polling based activity notification code from hub
- [ ] (0:30?) delete old activity notification code from page
- [ ] (1:00?) if list of projects you collaborate on changes, must reset the file_use table,
since the files you watched change as a result; client or server side?
- [ ] (1:00?) in general, open_file needs some sort of visual feedback while it is happening (in any situation)
- [ ] (0:30?) open_file project_store action on .sage-chat file (or also .ipython-sync) should open corresponding file
- [ ] (2:00?) good mature optimization

###


misc = require('misc')
{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Loading, SearchInput, TimeAgo} = require('r_misc')
{User} = require('users')

_global_notify_count = 0  # TODO: will be eliminated in rewrite and moved to a store...


class FileUseActions extends Actions
    setTo: (settings) ->
        return settings

class FileUseStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('file_use')
        @register(ActionIds.setTo, @setTo)
        @state = {}
        @flux = flux

    setTo: (message) =>
        @_clear_cache()
        @setState(message)

    _initialize_cache: =>
        @_users = @flux.getStore('users')
        if not @_users
            return
        @_projects = @flux.getStore('projects')
        if not @_projects
            return
        @_account = @flux.getStore('account')
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
        @emit('change')

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
        newest_comment = 0
        you_last = 0
        for account_id, user of users
            user.account_id = account_id
            user.last_edited = Math.max(user.edit ? 0, user.comment ? 0)
            if user.comment?
                newest_comment = Math.max(newest_comment, user.comment)
            user.last = Math.max(user.last_edited, user.seen ? 0, user.read ? 0)
            if @_account_id == account_id
                you_last = user.last
            v.push(user)
        # sort users by their edit/comment time
        v.sort (a,b) -> misc.cmp(b.last_edited, a.last_edited)
        y.users = v
        y.newest_comment = newest_comment
        if not y.last_edited?
            for user in y.users
                y.last_edited = Math.max(y.last_edited ? 0, user.last_edited)
        y.notify = you_last < newest_comment

    get_notify_count: =>
        if not @_cache?
            @_update_cache()
        return @_cache?.notify_count

    get_sorted_file_use_list: =>
        if not @_cache?
            @_update_cache()
        return @_cache?.sorted_file_use_list

    _update_cache: =>
        if not @state.file_use?
            return
        if not @_cache_init
            @_initialize_cache()
            if not @_cache_init
                return

        if @_cache?
            return @_cache.sorted_file_use_list

        @_account_id ?= @_account.get_account_id()
        v = []
        @state.file_use.map (x,_) =>
            y = x.toJS()
            y.search = @_search(y)
            @_process_users(y)
            v.push(y)
        v.sort (a,b)->misc.cmp(b.last_edited, a.last_edited)
        @_cache =
            sorted_file_use_list : v
            notify_count         : (x for x in v when x.notify).length
        return v

class FileUseTable extends Table
    query: ->
        return 'file_use'

    _change: (table, keys) =>
        @flux.getActions('file_use').setTo(file_use: table.get())

FileUse = rclass
    displayName: 'FileUse'

    propTypes: ->
        info        : rtypes.object.isRequired
        account_id  : rtypes.string.isRequired
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired
        flux        : rtypes.object

    render_users: ->
        if @props.info.users?
            n = misc.len(@props.info.users)
            i = 0
            v = []
            for user in @props.info.users
                v.push <User key={user.account_id} account_id={user.account_id}
                        name={"You" if user.account_id==@props.account_id}
                        user_map={@props.user_map} last_active={user.last_edited} />
                if i < n-1
                    v.push <span key={i}>, </span>
                i += 1
            return v

    render_last_edited: ->
        if @props.info.last_edited?
            <TimeAgo key='last_edited' date={@props.info.last_edited} />

    open: ->
        if @props.flux? and @props.info.project_id? and @props.info.path?
            @props.flux.getProjectActions(@props.info.project_id).open_file(path:@props.info.path, foreground:true)

    render_notify: ->
        if @props.info.notify
            <span>IMPORTANT! </span>

    render: ->
        <div style={border:"1px solid #aaa", cursor:'pointer'} onClick={@open}>
            {@render_notify()}
            <div key='path'>{@props.info.path}</div>
            <div key='project'>{@props.project_map.get(@props.info.project_id)?.get('title')}</div>
            {@render_last_edited() if not @props.info.users?}
            {@render_users()}
        </div>

FileUseViewer = rclass
    displayName: 'FileUseViewer'

    propTypes: ->
        file_use_list : rtypes.array.isRequired
        user_map      : rtypes.object.isRequired
        project_map   : rtypes.object.isRequired
        account_id    : rtypes.string.isRequired

    getInitialState: ->
        search : ''

    render_search_box: ->
        <span className='smc-file-use-notifications-search' key='search_box'>
            <SearchInput
                placeholder   = "Search..."
                default_value = {@state.search}
                on_change     = {(value)=>@setState(search:value); setTimeout(resize_notification_list, 0)}
            />
        </span>

    render_list: ->
        v = @props.file_use_list
        if @state.search
            s = misc.search_split(@state.search.toLowerCase())
            v = (x for x in v when misc.search_match(x.search, s))
        for info in v
            <FluxComponent key={info.id}>
                <FileUse info={info} account_id={@props.account_id}
                         user_map={@props.user_map} project_map={@props.project_map} />
            </FluxComponent>

    render_number: ->
        n = (info for info in @props.file_use_list when info.notify).length
        update_global_notify_count(n)
        if n > 0
            <div>
                {n} important notifications
            </div>

    render: ->
        <div>
            {@render_number()}
            {@render_search_box()}
            {@render_list()}
        </div>

FileUseController = rclass
    displayName: 'FileUseController'
    propTypes: ->
        flux        : rtypes.object
        file_use    : rtypes.object
        user_map    : rtypes.object
        project_map : rtypes.object

    render: ->
        account_id = @props.flux?.getStore('account')?.get_account_id()
        if not @props.file_use? or not @props.flux? or not @props.user_map? or not @props.project_map? or not account_id?
            return <Loading/>
        file_use_list = @props.flux.getStore('file_use').get_sorted_file_use_list()
        <FileUseViewer file_use_list={file_use_list} user_map={@props.user_map} project_map={@props.project_map} account_id={account_id} />

render = (flux) ->
    <FluxComponent flux={flux} connectToStores={['file_use', 'users', 'projects']} >
        <FileUseController />
    </FluxComponent>

init_flux = (flux) ->
    if not flux.getActions('file_use')?
        flux.createActions('file_use', FileUseActions)
        flux.createStore(  'file_use', FileUseStore, flux)
        flux.createTable(  'file_use', FileUseTable)

exports.render_file_use = (flux, dom_node) ->
    init_flux(flux)
    React.render(render(flux), dom_node)

# WARNING: temporary jquery spaghetti below
# For now hook in this way -- obviously this breaks isomorphic encapsulation, etc...
$(".salvus-notification-indicator").show()
notification_list = $(".salvus-notification-list")
notification_list_is_hidden = true
notification_count = $(".salvus-notification-unseen-count")

resize_notification_list = () ->
    if not notification_list.is(":visible")
        return
    notification_list.removeAttr('style')  # gets rid of the custom height from before
    max_height = $(window).height() - notification_list.offset().top - 50
    if notification_list.height() > max_height
        notification_list.height(max_height)
    # hack since on some browser scrollbar looks wrong otherwise.
    notification_list.hide()
    notification_list.show()

notification_list_click = (e) ->
    target = $(e.target)
    if target.parents('.smc-file-use-notifications-search').length
        return
    unbind_handlers()
    notification_list.hide()
    notification_list_is_hidden = true
    return false

unbind_handlers = () ->
    $(document).unbind('click', notification_list_click)
    $(window).unbind('resize', resize_notification_list)

$(".salvus-notification-indicator").click () ->
    if notification_list_is_hidden
        notification_list.show()
        $(document).click(notification_list_click)
        $(window).resize(resize_notification_list)
        resize_notification_list()
        require('tasks').unset_key_handler()
        notification_list.find("input").focus()
    else
        notification_list.hide()
        unbind_handlers()
    notification_list_is_hidden = not notification_list_is_hidden
    return false

exports.notify_count = -> _global_notify_count

# update old jquery stuff (TODO: eliminate when finishing rewrite one level up)
update_global_notify_count = (n) ->
    _global_notify_count = n
    if n == 0
        notification_count.text('')
    else
        notification_count.text(n)
    require('misc_page').set_window_title()

exports.render_file_use(require('flux').flux, notification_list[0])
