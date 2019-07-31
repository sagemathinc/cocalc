##############################################################################
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

# standard non-CoCalc libraries
immutable = require('immutable')
{IS_MOBILE, IS_TOUCH} = require('./feature')
underscore = require('underscore')

# CoCalc libraries
misc = require('smc-util/misc')
misc_page = require('./misc_page')
{defaults, required} = misc
{webapp_client} = require('./webapp_client')

{alert_message} = require('./alerts')
{analytics_event} = require('./tracker')

# React libraries
{React, ReactDOM, rclass, rtypes, Actions, Store, Redux}  = require('./app-framework')
{Icon, Loading, Markdown, Space, TimeAgo, Tip} = require('./r_misc')
{Button, Col, Grid, FormGroup, FormControl, ListGroup, ListGroupItem, Panel, Row, ButtonGroup, Well} = require('react-bootstrap')

{User} = require('./users')

editor_chat = require('./editor_chat')

{redux_name, init_redux, newest_content, sender_is_viewer, show_user_name, is_editing, blank_column, render_markdown, render_history_title, render_history_footer, render_history, get_user_name, is_at_bottom, scroll_to_bottom, scroll_to_position} = require('./editor_chat')

{ProjectUsers} = require('./projects/project-users')
{AddCollaborators} = require('./collaborators/add-to-project')

{ ChatInput } = require('./chat/input')
{ Avatar } = require("./other-users");

{ChatLog} = require('./chat/chat-log')

ChatRoom = rclass ({name}) ->
    displayName: "ChatRoom"

    reduxProps :
        "#{name}" :
            messages           : rtypes.immutable
            input              : rtypes.string
            saved_position     : rtypes.number
            height             : rtypes.number
            offset             : rtypes.number
            saved_mesg         : rtypes.string
            use_saved_position : rtypes.bool
            add_collab         : rtypes.bool
        users :
            user_map : rtypes.immutable
        account :
            account_id : rtypes.string
            font_size  : rtypes.number
            other_settings : rtypes.immutable.Map
        file_use :
            file_use : rtypes.immutable
        projects :
            project_map : rtypes.immutable.Map

    propTypes:
        redux       : rtypes.object.isRequired
        actions     : rtypes.object.isRequired
        name        : rtypes.string.isRequired
        project_id  : rtypes.string.isRequired
        file_use_id : rtypes.string.isRequired
        path        : rtypes.string

    getInitialState: ->
        @input_ref = React.createRef();
        return {}

    mark_as_read: ->
        info = @props.redux.getStore('file_use').get_file_info(@props.project_id, misc.original_path(@props.path))
        if not info? or info.is_unseenchat  # only mark chat as read if it is unseen
            f = @props.redux.getActions('file_use').mark_file
            f(@props.project_id, @props.path, 'read')
            f(@props.project_id, @props.path, 'chatseen')

    on_input_send: (value) ->
        @send_chat(value)
        analytics_event('side_chat', 'send_chat', 'keyboard')

    on_send_click: (e) ->
        e.preventDefault();
        @send_chat(@props.input)
        analytics_event('side_chat', 'send_chat', 'click')

    send_chat: (value) ->
        scroll_to_bottom(@refs.log_container, @props.actions)
        @props.actions.submit_user_mentions(
            @props.project_id,
            misc.original_path(@props.path)
        )
        @props.actions.send_chat(value)
        @input_ref.current.focus();

    on_input_change: (value, mentions, plain_text) ->
        @props.actions.set_unsent_user_mentions(mentions, plain_text)
        @props.actions.set_input(value)

    on_clear: () ->
        @props.actions.set_input('')

    on_scroll: (e) ->
        @props.actions.set_use_saved_position(true)
        node = ReactDOM.findDOMNode(@refs.log_container)
        @props.actions.save_scroll_state(node.scrollTop, node.scrollHeight, node.offsetHeight)
        e.preventDefault()

    componentDidMount: ->
        scroll_to_position(@refs.log_container, @props.saved_position,
                           @props.offset, @props.height, @props.use_saved_position, @props.actions)
        @mark_as_read() # The act of opening/displaying the chat marks it as seen...
                        # since this happens when the user shows it.

    componentWillReceiveProps: (next) ->
        if (@props.messages != next.messages or @props.input != next.input) and is_at_bottom(@props.saved_position, @props.offset, @props.height)
            @props.actions.set_use_saved_position(false)

    componentDidUpdate: ->
        if not @props.use_saved_position
            scroll_to_bottom(@refs.log_container, @props.actions)

    render_collab_caret: ->
        if @props.add_collab
            icon = <Icon name='caret-down'/>
        else
            icon = <Icon name='caret-right'/>
        <div
            style   = {width:'16px', display:'inline-block', cursor:'pointer'}
        >
            {icon}
        </div>

    render_add_collab: ->
        if not @props.add_collab
            return
        project = @props.project_map?.get(@props.project_id)
        if not project?
            return
        <div>
            <div style={margin:'10px 0px'}>
                Who else would you like to work with?
            </div>
            <AddCollaborators
                project = {project}
                inline  = {true}
            />
            <span style={color:'#666'}>
                NOTE: Anybody you add can work with you on any file in this project. Remove people in settings.
            </span>
        </div>

    render_collab_list: ->
        project = @props.project_map?.get(@props.project_id)
        if not project?
            return
        style = undefined
        if not @props.add_collab
            style =
                maxHeight    : '1.7em'
                whiteSpace   : 'nowrap'
                overflow     : 'hidden'
                textOverflow : 'ellipsis'
        <div style   = {style}
             onClick = {=>@props.actions.setState(add_collab:not @props.add_collab)}>
            {@render_collab_caret()}
            <span style={color:'#777', fontSize:'10pt'}>
                <ProjectUsers project={project} none={<span>Add people to work with...</span>}/>
            </span>
        </div>

    render_project_users: ->
        <div style={margin:'5px 15px', maxHeight: '20%', overflow: 'auto', borderBottom: '1px solid lightgrey'}>
            {@render_collab_list()}
            {@render_add_collab()}
        </div>

    render_user_suggestion: (entry) ->
        <span>
            <Avatar size={this.props.font_size + 12} account_id={entry.id} />
            <Space />
            <Space />
            {entry.display}
        </span>

    on_focus: ->
        # Remove any active key handler that is next to this side chat.
        # E.g, this is critical for taks lists...
        @props.redux.getActions('page').erase_active_key_handler()

    render: ->
        if not @props.messages? or not @props.redux?
            return <Loading/>

        # the immutable.Map() default is because of admins:
        # https://github.com/sagemathinc/cocalc/issues/3669
        project_users = @props.project_map
            .getIn([@props.project_id, "users"], immutable.Map())
        has_collaborators = project_users.size > 1

        mark_as_read = underscore.throttle(@mark_as_read, 3000)

        # WARNING: making autofocus true would interfere with chat and terminals -- where chat and terminal are both focused at same time sometimes (esp on firefox).

        <div style       = {height:'100%', width:'100%', position:'absolute', display:'flex', flexDirection:'column', backgroundColor:'#efefef'}
             onMouseMove = {mark_as_read}
             onFocus     = {@on_focus}
             >
            {@render_project_users()}
            <div className="smc-vfill"
                 ref     = 'log_container'
                 onScroll= {@on_scroll}
                 style={backgroundColor : '#fff', paddingLeft:'15px'}
                 >
                <ChatLog
                    messages     = {@props.messages}
                    account_id   = {@props.account_id}
                    user_map     = {@props.user_map}
                    project_id   = {@props.project_id}
                    font_size    = {@props.font_size}
                    file_path    = {if @props.path? then misc.path_split(@props.path).head}
                    actions      = {@props.actions}
                    show_heads   = {false} />
            </div>
            <div style={marginTop:'auto', padding:'5px', paddingLeft:'15px', paddingRight:'15px'}>
                <div style={display:'flex', height:'6em'}>
                    <div style={width:'85%', height:'100%'}>
                        <ChatInput
                            input                = {@props.input}
                            input_ref            = {@input_ref}
                            enable_mentions      = {has_collaborators && @props.other_settings.get('allow_mentions')}
                            project_users        = {project_users}
                            user_store           = {@props.redux.getStore("users")}
                            font_size            = {@props.font_size}
                            on_change            = {@on_input_change}
                            on_clear             = {@on_clear}
                            on_send              = {@on_input_send}
                            on_set_to_last_input = {@props.actions.set_to_last_input}
                            account_id           = {@props.account_id}
                        />
                    </div>
                    <Button
                        style    = {width:'15%', height:'100%'}
                        onClick  = {@on_send_click}
                        disabled = {@props.input==''}
                        bsStyle  = 'success' >
                        <Icon name='chevron-circle-right'/>
                    </Button>
                </div>
                <div style={color:"#888", padding:'5px'}>
                    Shift+enter to send. Double click to edit. Use <a href='https://help.github.com/articles/getting-started-with-writing-and-formatting-on-github/' target='_blank' rel='noopener'>Markdown</a> and <a href="https://en.wikibooks.org/wiki/LaTeX/Mathematics" target='_blank' rel='noopener'>LaTeX</a>.
                </div>
            </div>
        </div>


# Component for use via React
exports.SideChat = ({path, redux, project_id}) ->
    name        = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    actions     = redux.getActions(name)
    <ChatRoom
        redux       = {redux}
        actions     = {redux.getActions(name)}
        name        = {name}
        project_id  = {project_id}
        path        = {path}
        file_use_id = {file_use_id}
        />

# Fitting the side chat into non-react parts of SMC:

render = (redux, project_id, path) ->
    name = redux_name(project_id, path)
    file_use_id = require('smc-util/schema').client_db.sha1(project_id, path)
    actions = redux.getActions(name)
    <ChatRoom redux={redux} actions={actions} name={name} project_id={project_id} path={path} file_use_id={file_use_id} />

# Render the given chatroom, and return the name of the redux actions/store
exports.render = (project_id, path, dom_node, redux) ->
    name = init_redux(path, redux, project_id)
    ReactDOM.render(render(redux, project_id, path), dom_node)
    return name

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.free = (project_id, path, dom_node, redux) ->
    fname = redux_name(project_id, path)
    store = redux.getStore(fname)
    if not store?
        return
    ReactDOM.unmountComponentAtNode(dom_node)
    store.syncdb?.destroy()
    delete store.state
    # It is *critical* to first unmount the store, then the actions,
    # or there will be a huge memory leak.
    redux.removeStore(fname)
    redux.removeActions(fname)


