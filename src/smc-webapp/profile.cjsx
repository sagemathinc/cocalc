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

{rclass, React, ReactDOM, Redux, rtypes} = require('./smc-react')
{merge} = require('smc-util/misc')
{Loading, SetIntervalMixin} = require('./r_misc')
{Grid, Row, Col, OverlayTrigger, Tooltip, Popover} = require('react-bootstrap')

Avatar = rclass
    displayName: "Avatar"

    propTypes:
        size    : React.PropTypes.number
        account : React.PropTypes.object
        style   : React.PropTypes.object
        square  : React.PropTypes.bool

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

    _innerStyle: ->
        display      : 'block'
        width        : '100%'
        height       : '100%'
        color        : '#fff'
        borderRadius : if not @props.square then '50%' else 'none'
        fontSize     : "#{@props.size / 2 + 4}"
        fontFamily   : 'sans-serif'

    # This was formerly the styling used for icons with Avatars, but it
    # created some alignment problems.
    # _innerStyle_image: ->
    #     position     : 'relative'
    #     width        : '100%'
    #     height       : '100%'
    #     borderRadius : if not @props.square then "50%" else "none"

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
        return merge(style, @props.style)

    tooltip: ->
        <Tooltip id="#{@props.account?.first_name or 'anonymous'}">{@props.account.first_name} {@props.account.last_name}</Tooltip>

    render_image: ->
        if @has_image()
            <img style={@_innerStyle()} src={@_src()} alt={@_alt()} />
        else
            <span style={@_innerStyle()}>
                {@_alt()}
            </span>

    render: ->
        #extra div for necessary for overlay not to destroy background color
        <OverlayTrigger placement='top' overlay={@tooltip()}>
            <div style={display:'inline-block'}>
                <div style={@_outerStyle()}>
                    {@render_image()}
                </div>
            </div>
        </OverlayTrigger>

UsersViewingDocument = rclass
    displayName: "smc-users-viewing-document"

    reduxProps:
        file_use :
            file_use : rtypes.immutable
        account :
            account_id : rtypes.string
        users :
            user_map : rtypes.immutable   # we use to display the username and letter

    propTypes:
        file_use_id : rtypes.string

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

        for user_id, events of log

            if @props.account_id is user_id
                continue

            account = @props.user_map.get(user_id)?.toJS() ? {}
            [event, seconds] = @_find_most_recent(events)
            time_since = Date.now()/1000 - seconds
            # TODO do something with the type like show a small typing picture
            # or whatever corresponds to the action like "open" or "edit"
            style = {opacity:Math.max(1 - time_since/seconds_for_user_to_disappear, 0)}
            # style = {opacity:1}  # used for debugging only -- makes them not fade after a few minutes...
            if time_since < seconds_for_user_to_disappear # or true  # debugging -- to make everybody appear
                all_users.push <Avatar key={user_id} account={account} style={style} __time_since={time_since} />

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
exports.UsersViewingDocument = UsersViewingDocument

exports.render_new = render = (project_id, filename, dom_node, redux) ->
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, filename)
    ReactDOM.render (
        <Redux redux={redux}>
            <UsersViewingDocument file_use_id={file_use_id} />
        </Redux>
    ), dom_node

exports.mount = (project_id, dom_node, redux) ->
    ReactDOM.render(render(project_id, redux), dom_node)

exports.unmount = (dom_node) ->
    ReactDOM.unmountComponentAtNode(dom_node)
