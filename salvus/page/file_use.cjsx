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
- [ ] (0:45?) proper handling of .sage-chat, ipython, etc. extensions -- seems not working right -- see hub.
- [ ] (0:45?) notification number
- [ ] (0:30?) deal with this in misc_page.coffee: `#u = require('activity').important_count()`
- [ ] (0:45?) mark seen
- [ ] (0:45?) mark read
- [ ] (1:00?) make even more readable, e.g., file type icons, layout
- [ ] (0:30?) truncate: polish for when names, etc are long
- [ ] (1:00?) if list of projects you collaborate on changes, must reset the file_use table,
since the files you watched change as a result; client or server side?
- [ ] (1:00?) in general, open_file needs some sort of visual feedback while it is happening (in any situation)
- [ ] (2:00?) good mature optimization

###


misc = require('misc')
{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Loading, SearchInput, TimeAgo} = require('r_misc')
{User} = require('users')

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
        if message.file_use?
            delete @_sorted_file_use_list
        @setState(message)

    _initialize_cache: =>
        @_users = @flux.getStore('users')
        if not @_users
            return
        @_projects = @flux.getStore('projects')
        if not @_projects
            return
        @_users.on 'change', @_update_cache
        @_projects.on 'change', @_update_cache
        @_cache_init = true
        return true

    _update_cache: =>
        delete @_sorted_file_use_list

    _search: (x) =>
        s = [x.path]
        s.push(@_projects.get_title(x.project_id))
        if x.users?
            for account_id,_ of x.users
                s.push(@_users.get_name(account_id))
        return s.join(' ').toLowerCase()

    _process_users: (users) =>
        if not users?
            return
        # make into list of objects
        v = []
        for account_id, user of users
            user.account_id = account_id
            v.push(user)
        # sort by last edit time
        v.sort (a,b) -> misc.cmp(b.edit, a.edit)
        return v

    get_sorted_file_use_list: =>
        if not @state.file_use?
            return
        if not @_cache_init
            @_initialize_cache()
            if not @_cache_init
                return

        if @_sorted_file_use_list?
            return @_sorted_file_use_list

        v = []
        @state.file_use.map (x,_) =>
            y = x.toJS()
            y.search = @_search(y)
            y.users = @_process_users(y.users)
            v.push(y)
        v.sort (a,b)->misc.cmp(b.last_edited, a.last_edited)
        @_sorted_file_use_list = v
        return v

class FileUseTable extends Table
    query: ->
        return 'file_use'

    _change: (table, keys) =>
        @flux.getActions('file_use').setTo(file_use: table.get())

FileUse = rclass
    displayName: 'FileUse'

    propTypes: ->
        id          : rtypes.string.isRequired
        project_id  : rtypes.string
        path        : rtypes.string
        last_edited : rtypes.object
        users       : rtypes.array   # might not be given
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired
        flux        : rtypes.object

    render_users: ->
        if @props.users?
            n = misc.len(@props.users)
            i = 0
            v = []
            for user in @props.users
                v.push <User key={user.account_id} account_id={user.account_id}
                        user_map={@props.user_map} last_active={user.edit} />
                if i < n-1
                    v.push <span key={i}>, </span>
                i += 1
            return v

    render_last_edited: ->
        if @props.last_edited?
            <TimeAgo key='last_edited' date={@props.last_edited} />

    open: ->
        if @props.flux? and @props.project_id? and @props.path?
            @props.flux.getProjectActions(@props.project_id).open_file(path:@props.path, foreground:true)

    render: ->
        <div style={border:"1px solid #aaa"} onClick={@open}>
            <div key='path'>{@props.path}</div>
            <div key='project'>{@props.project_map.get(@props.project_id)?.get('title')}</div>
            {@render_last_edited() if not @props.users?}
            {@render_users()}
        </div>

FileUseViewer = rclass
    displayName: 'FileUseViewer'

    propTypes: ->
        file_use_list : rtypes.array.isRequired
        user_map      : rtypes.object.isRequired
        project_map   : rtypes.object.isRequired

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
        for x in v
            <FluxComponent key={x.id}>
                <FileUse
                    id={x.id} project_id={x.project_id} path={x.path}
                    last_edited={x.last_edited} users={x.users}
                    user_map={@props.user_map} project_map={@props.project_map}/>
            </FluxComponent>

    render: ->
        <div>
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
        if not @props.file_use? or not @props.flux? or not @props.user_map? or not @props.project_map?
            return <Loading/>
        file_use_list = @props.flux.getStore('file_use').get_sorted_file_use_list()
        <FileUseViewer file_use_list={file_use_list} user_map={@props.user_map} project_map={@props.project_map} />

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
    else
        notification_list.hide()
        unbind_handlers()
    notification_list_is_hidden = not notification_list_is_hidden
    return false

exports.render_file_use(require('flux').flux, notification_list[0])
