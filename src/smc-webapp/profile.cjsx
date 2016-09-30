###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, SageMath, Inc.
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
# AUTHORS:
#    - Travis Scholl
#    - Vivek Venkatachalam
###

misc = require('smc-util/misc')
{rclass, React, ReactDOM, redux, Redux, rtypes} = require('./smc-react')
{Loading, SetIntervalMixin} = require('./r_misc')
{Grid, Row, Col, OverlayTrigger, Tooltip, Popover} = require('react-bootstrap')
{salvus_client} = require('./salvus_client')

Avatar = rclass
    displayName: "Avatar"

    propTypes:
        viewing_what : React.PropTypes.string
        size         : React.PropTypes.number
        account      : React.PropTypes.object
        style        : React.PropTypes.object
        square       : React.PropTypes.bool
        line         : React.PropTypes.number
        goto_line    : React.PropTypes.func
        path         : React.PropTypes.string
        project_id   : React.PropTypes.string
        redux        : React.PropTypes.object

    getDefaultProps: ->
        style   : {}
        account : {first_name:"A",profile:{color:"#aaaaaa",image:""}}
        size    : 30
        square  : false

    has_image: ->
        @_src() isnt ""

    _src: ->
        @props.account.profile?.image or ""

    _alt: ->
        @props.account.first_name?[0]?.toUpperCase?() or "a"

    _innerStyle_no_image: ->
        display      : 'block'
        width        : '100%'
        height       : '100%'
        color        : '#fff'
        borderRadius : if not @props.square then '50%' else 'none'
        fontSize     : @props.size / 2 + 4
        fontFamily   : 'sans-serif'

    _innerStyle_image: ->
        position     : 'relative'
        width        : '100%'
        height       : '100%'
        borderRadius : if not @props.square then "50%" else "none"

    _outerStyle: ->
        style =
            display         : "inline-block"
            height          : "#{@props.size}px"
            width           : "#{@props.size}px"
            borderRadius    : if @props.square then "none" else "50%"
            border          : if @props.square then "1px solid black" else "0"
            cursor          : "default"
            backgroundColor : if @has_image() then "" else (@props.account.profile?.color ? "#aaa")
            textAlign       : "center"
            lineHeight      : "30px"
            verticalAlign   : "middle"
            marginLeft      : "2px"
            marginRight     : "2px"
            marginBottom    : "4px"
        return misc.merge(style, @props.style)

    render_line: ->
        <span> (Line {@props.line})</span>

    render_name: ->
        name = @props.account.first_name + ' ' + @props.account.last_name
        return misc.trunc_middle(name,15).trim()

    tooltip: ->
        {ProjectTitle} = require('./projects')
        if @props.viewing_what == 'projects'
            <Tooltip id="#{@props.account?.first_name or 'anonymous'}">{@render_name()} last seen at <ProjectTitle project_id={@props.project_id} /></Tooltip>
        else if @props.viewing_what == 'project'
            <Tooltip id="#{@props.account?.first_name or 'anonymous'}">{@render_name()} last seen at {@props.path}</Tooltip>
        else
            <Tooltip id="#{@props.account?.first_name or 'anonymous'}">{@render_name()}{@render_line() if @props.line}</Tooltip>

    render_image: ->
        if @has_image()
            <img style={@_innerStyle_image()} src={@_src()} alt={@_alt()} />
        else
            <span style={@_innerStyle_no_image()}>
                {@_alt()}
            </span>

    open_path: (path) ->
        redux.getProjectActions(@props.project_id).open_file
            path : path

    render: ->
        #extra div for necessary for overlay not to destroy background color
        open_project = @actions('projects').open_project

        if @props.viewing_what == 'projects'
            <OverlayTrigger placement='top' overlay={@tooltip()} onClick={=>open_project(project_id:@props.project_id, target:"files", switch_to:true)}>
                <div style={display:'inline-block'}>
                    <div style={@_outerStyle()}>
                        {@render_image()}
                    </div>
                </div>
            </OverlayTrigger>
        else if @props.viewing_what == 'project'
            <OverlayTrigger placement='top' overlay={@tooltip()}>
                <div style={display:'inline-block'}>
                    <div style={@_outerStyle()} onClick={=>@open_path(@props.path)}>
                        {@render_image()}
                    </div>
                </div>
            </OverlayTrigger>
        else
            <OverlayTrigger placement='top' overlay={@tooltip()}>
                <div style={display:'inline-block'}>
                    <div style={@_outerStyle()} onClick={=>@props.goto_line(@props.line)}>
                        {@render_image()}
                    </div>
                </div>
            </OverlayTrigger>

UsersViewing = rclass
    displayName: "smc-users-viewing-document"

    reduxProps:
        file_use :
            file_use : rtypes.immutable
        account :
            account_id : rtypes.string
        users :
            user_map : rtypes.immutable   # we use to display the username and letter

    propTypes:
        redux         : rtypes.object
        viewing_what : rtypes.string
        project_id : rtypes.string
        file_use_id : rtypes.string
        editor_instance : rtypes.object
        get_users_cursors : rtypes.func
        goto_line : rtypes.func

    mixins: [SetIntervalMixin]

    componentDidMount: ->
        @setInterval (=> @forceUpdate()), 5000

    _find_most_recent: (log) ->
        latest_key = undefined
        newest     = 0
        for k in ['open', 'edit', 'chat']
            tm = (log[k] ? 0) - 0
            if tm > newest
                latest_key = k
                newest     = tm
        return [latest_key, newest/1000]

    render_avatars: ->
        if not (@props.file_use? and @props.user_map?)
            return

        seconds_for_user_to_disappear = 600
        num_users_to_display = 5 # The full set will show up in an overflow popover

        log = @props.file_use.getIn([@props.file_use_id, 'users'])?.toJS() ? {}

        output = []
        all_users = []
        if @props.viewing_what == 'projects'
            users = {}
            debug_list = []
            sortByKey = (array, key) ->
                array.sort (a,b) ->
                    if a[key] < b[key]
                        -1
                    else if a[key] > b[key]
                        1
                    else
                        0
            for p in redux.getStore('file_use').get_sorted_file_use_list2().toJS()
                for user in p.users
                    [event, most_recent] = @_find_most_recent(user)
                    if users[user.account_id]
                        users[user.account_id].push({"project_id": p.project_id, "path": p.path, "most_recent": most_recent})
                    else
                        users[user.account_id] = [{"project_id": p.project_id, "path": p.path, "most_recent": most_recent}]
            for user_id, paths_edited of users
                if user_id == @props.account_id
                    continue
                account = @props.user_map.get(user_id)?.toJS() ? {}
                most_recent_path = paths_edited
                sortByKey(most_recent_path, 'most_recent')
                most_recent_path = paths_edited.reverse()[0]
                seconds = most_recent_path['most_recent']
                time_since =  salvus_client.server_time()/1000 - seconds


                # FUTURE: do something with the type like show a small typing picture
                # or whatever corresponds to the action like "open" or "edit"
                style = {opacity:Math.max(1 - time_since/seconds_for_user_to_disappear, 0)}

                # style = {opacity:1}  # used for debugging only -- makes them not fade after a few minutes...
                if time_since < seconds_for_user_to_disappear # or true  # debugging -- to make everybody appear
                    all_users.push <Avatar viewing_what='projects' key={user_id} account={account} style={style} project_id={most_recent_path['project_id']} redux={redux} />

        else if @props.viewing_what == 'project'
            users = {}
            debug_list = []
            sortByKey = (array, key) ->
                array.sort (a,b) ->
                    if a[key] < b[key]
                        -1
                    else if a[key] > b[key]
                        1
                    else
                        0
            for p in redux.getStore('file_use').get_sorted_file_use_list2().toJS()
                if p.project_id == @props.project_id
                    for user in p.users
                        [event, most_recent] = @_find_most_recent(user)
                        if users[user.account_id]
                            users[user.account_id].push({"path": p.path, "most_recent": most_recent})
                        else
                            users[user.account_id] = [{"path": p.path, "most_recent": most_recent}]

            for user_id, paths_edited of users
                if user_id == @props.account_id
                    continue
                account = @props.user_map.get(user_id)?.toJS() ? {}
                most_recent_path = paths_edited
                sortByKey(most_recent_path, 'most_recent')
                most_recent_path = paths_edited.reverse()[0]
                seconds = most_recent_path['most_recent']
                time_since =  salvus_client.server_time()/1000 - seconds

                # FUTURE: do something with the type like show a small typing picture
                # or whatever corresponds to the action like "open" or "edit"
                style = {opacity:Math.max(1 - time_since/seconds_for_user_to_disappear, 0)}

                # style = {opacity:1}  # used for debugging only -- makes them not fade after a few minutes...
                if time_since < seconds_for_user_to_disappear # or true  # debugging -- to make everybody appear
                    all_users.push <Avatar viewing_what='project' key={user_id} account={account} style={style} path={most_recent_path['path']} project_id={@props.project_id} redux={redux} />

        else
            for user_id, events of log
                if @props.account_id is user_id
                    continue
                z = @props.get_users_cursors?(user_id)?[0]?['y']
                if z is undefined
                    line = undefined
                else
                    line = z  + 1
                account = @props.user_map.get(user_id)?.toJS() ? {}
                [event, seconds] = @_find_most_recent(events)
                time_since =  salvus_client.server_time()/1000 - seconds
                # FUTURE: do something with the type like show a small typing picture
                # or whatever corresponds to the action like "open" or "edit"
                style = {opacity:Math.max(1 - time_since/seconds_for_user_to_disappear, 0)}
                # style = {opacity:1}  # used for debugging only -- makes them not fade after a few minutes...
                if time_since < seconds_for_user_to_disappear # or true  # debugging -- to make everybody appear
                    all_users.push <Avatar key={user_id} account={account} line={line} style={style} __time_since={time_since} goto_line={@props.goto_line} />

        if all_users.length <= num_users_to_display
            num_users_to_display = all_users.length

        time_sorter = (a,b) -> b.props.__time_since < a.props.__time_since
        key_sorter = (a,b) -> b.props.key < a.props.key

        all_users_time_sorted = all_users.sort(time_sorter)
        users_to_display = all_users_time_sorted.slice(0, num_users_to_display)

        users_to_display.sort(key_sorter)
        all_users.sort(key_sorter)

        if all_users.length > num_users_to_display
            rest =
                <span style={fontSize:"small", cursor:"pointer", marginBottom:"4px", marginRight:"10px"}>
                    {"+ #{all_users.length-4}"}
                </span>
            users_to_display.push <OverlayTrigger
                    rootClose = true
                    trigger   = 'click'
                    placement = 'bottom'
                    overlay   = {<Popover title='All viewers'>{all_users}</Popover>}>
                        {rest}
                </OverlayTrigger>
        else
            rest =
                <span style={fontSize:"small", cursor:"pointer", marginBottom:"4px"}>
                </span>
            users_to_display.push(rest)

        output.push(users_to_display)
        return output

    render: ->
        <div>
            {@render_avatars()}
        </div>

exports.Avatar = Avatar
exports.UsersViewing = UsersViewing

exports.render_new_viewing_doc = render = (project_id, filename, dom_node, redux, get_users_cursors, goto_line) ->
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, filename)
    ReactDOM.render (
        <Redux redux={redux}>
            <UsersViewing viewing_what='doc' file_use_id={file_use_id} get_users_cursors={get_users_cursors} goto_line={goto_line} />
        </Redux>
    ), dom_node

exports.mount = (project_id, dom_node, redux) ->
    ReactDOM.render(render(project_id, redux), dom_node)

exports.unmount = (dom_node) ->
    ReactDOM.unmountComponentAtNode(dom_node)
