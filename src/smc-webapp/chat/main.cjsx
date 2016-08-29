###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, SageMath, Inc.
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
#    - Simon Luu
#    - Vivek Venkatachalam
###

# --SD81 VIDEO CHAT--
# This file was created to combine the video chat and editor chat together

# standard non-SMC libraries
immutable = require('immutable')
{IS_MOBILE} = require('../feature')
underscore = require('underscore')

# SMC libraries
{Avatar, UsersViewingDocument} = require('../profile')
misc = require('smc-util/misc')
misc_page = require('../misc_page')
{defaults, required} = misc
{Markdown, TimeAgo, Tip} = require('../r_misc')
{salvus_client} = require('../salvus_client')
{synchronized_db} = require('../syncdb')
{VideoChatRoom} = require('./video_chat')
{ChatRoom, init_redux, redux_name} = require('./editor_chat')

{alert_message} = require('../alerts')

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, Redux}  = require('../smc-react')
{Icon, Loading, TimeAgo} = require('../r_misc')
{Button, Col, Grid, Input, ListGroup, ListGroupItem, Panel, Row, ButtonGroup} = require('react-bootstrap')

{User} = require('../users')

ChatRoomContainer = rclass
    displayName: "ChatRoomContainer"

    propTypes:
        redux       : rtypes.object
        actions     : rtypes.object
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        path        : rtypes.string
        is_side_chat: rtypes.bool

    render: ->
        C = ChatRoom(@props.name)
        <div>
            <VideoChatRoom redux={@props.redux} actions={@props.actions} project_id={@props.project_id} file_use_id={@props.file_use_id} path={@props.path} />
            <Redux redux={@props.redux}>
                <C redux={@props.redux} actions={@props.actions} name={@props.name} project_id={@props.project_id} file_use_id={@props.file_use_id} path={@props.path} is_side_chat={@props.is_side_chat} />
            </Redux>
        </div>

render = (redux, project_id, path, is_side_chat) ->
    name = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    <ChatRoomContainer redux={redux} actions={redux.getActions(name)} name={name} project_id={project_id} file_use_id={file_use_id} path={path} is_side_chat={is_side_chat} />

exports.render = (project_id, path, dom_node, redux, is_side_chat) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path, is_side_chat), dom_node)