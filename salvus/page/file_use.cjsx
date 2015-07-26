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
- [ ] (0:15?) (0:22) sorted file use by last_edited timestamp
- [ ] (0:30?) display items a little more readably
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
{Loading} = require('r_misc')
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
        @state.file_use.map (val,_) =>
            v.push(val.toJS())
        v.sort (a,b)->misc.cmp(b.last_edited, a.last_edited)
        @_sorted_file_use_list = v
        return v

class FileUseTable extends Table
    query: ->
        return 'file_use'

    _change: (table, keys) =>
        @flux.getActions('file_use').setTo(file_use: table.get())

FileUseViewer = rclass
    propTypes: ->
        file_use_list : rtypes.array.isRequired

    render_list: ->
        for x in @props.file_use_list
            <div style={border:"1px solid #aaa"} key={x.id}>
                {misc.to_json(x)}
            </div>

    render: ->
        <div>
            {@render_list()}
        </div>

FileUseController = rclass
    propTypes: ->
        flux     : rtypes.object
        file_use : rtypes.object

    render: ->
        if not @props.file_use? or not @props.flux?
            return <Loading/>
        file_use_list = @props.flux.getStore('file_use').get_sorted_file_use_list()
        <FileUseViewer file_use_list={file_use_list}/>

render = (flux) ->
    <FluxComponent flux={flux} connectToStores={['file_use', 'users']} >
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

