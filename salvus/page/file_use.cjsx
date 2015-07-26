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
- [ ] (1:00?) get use of file by person to actually cause update of use
- [ ] (1:00?) make even more readable, e.g., file type icons, layout
- [ ] (0:30?) search
- [ ] (0:30?) click to open
- [ ] (0:45?) notification number
- [ ] (0:45?) mark seen
- [ ] (0:45?) mark read
- [ ] (1:00?) if list of projects you collaborate on changes, must reset the file_use table,
since the files you watched change as a result; client or server side?
- [ ] (2:00?) good mature optimization

###


misc = require('misc')
{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Loading, TimeAgo} = require('r_misc')
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

    get_sorted_file_use_list: =>
        if not @state.file_use?
            return
        if @_sorted_file_use_list?
            return @_sorted_file_use_list
        v = []
        @state.file_use.map (x,_) =>
            v.push(x.toJS())
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
        users       : rtypes.object   # might not be given
        user_map    : rtypes.object.isRequired
        project_map : rtypes.object.isRequired

    render_users: ->
        if @props.users?
            n = misc.len(@props.users)
            i = 0
            v = []
            for account_id, user of @props.users
                v.push <User key={account_id} account_id={account_id} user_map={@props.user_map} last_active={user.edit} />
                if i < n-1
                    v.push <span key={account_id+','}>, </span>
                i += 1
            return v

    render_last_edited: ->
        if @props.last_edited?
            <TimeAgo key='last_edited' date={@props.last_edited} />

    render: ->
        <div style={border:"1px solid #aaa"}>
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

    render_list: ->
        for x in @props.file_use_list
            <FileUse key={x.id}
                id={x.id} project_id={x.project_id} path={x.path}
                last_edited={x.last_edited} users={x.users}
                user_map={@props.user_map} project_map={@props.project_map}/>

    render: ->
        <div>
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

# For now hook in this way -- obviously this breaks isomorphic encapsulation, etc...
$(".salvus-notification-indicator").show()
exports.render_file_use(require('flux').flux, $(".salvus-notification-list")[0])

