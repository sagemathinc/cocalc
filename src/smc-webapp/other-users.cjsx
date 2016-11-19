###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX
# and the Terminal.
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

onecolor = require('onecolor')

misc = require('smc-util/misc')

{server_time} = require('./salvus_client').salvus_client

{rclass, React, ReactDOM, redux, Redux, rtypes} = require('./smc-react')
{Loading, SetIntervalMixin, Space} = require('./r_misc')
{OverlayTrigger, Tooltip} = require('react-bootstrap')

# How frequently all UsersViewing componenents are completely updated.
# This is only needed to ensure that faces fade out; any newly added faces
# will still be displayed instantly.  Also, updating more frequently updates
# the line positions in the tooltip.
UPDATE_INTERVAL_S = 5

# Cutoff for how recent activity must be to show users.  Should be significantly
# longer than default for the mark_file function in the file_use actions.
MAX_AGE_S         = 600

CIRCLE_OUTER_STYLE =
    textAlign : "center"
    cursor    : 'pointer'

CIRCLE_INNER_STYLE =
    display      : 'block'
    borderRadius : '50%'
    fontFamily   : 'sans-serif'

exports.Avatar = Avatar = rclass
    displayName: "Avatar"

    reduxProps:
        users :
            user_map : rtypes.immutable   # we use to display the username and face

    propTypes:
        account_id : rtypes.string.isRequired
        size       : rtypes.number.isRequired
        max_age_s  : rtypes.number.isRequired
        project_id : rtypes.string   # if given, showing avatar info for a project (or specific file)
        path       : rtypes.string   # if given, showing avatar for a specific file
        activity   : rtypes.object   # if given; is most recent activity -- {project_id:?, path:?, last_used:?} object;
                                     # When defined, fade out over time; click goes to that file.

    getDefaultProps: ->
        size      : 30
        max_age_s : 600

    click_avatar: ->
        return if not @props.activity?
        {project_id, path} = @props.activity
        switch @viewing_what()
            when 'projects'
                @actions('projects').open_project
                    project_id : project_id
                    target     : "files"
                    switch_to  : true
            when 'project'
                redux.getProjectActions(project_id).open_file(path: path)
            when 'file'
                line = @get_cursor_line()
                if line?
                    redux.getProjectActions(project_id).goto_line(path, line)

    letter: ->
        if first_name = @props.user_map.getIn([@props.account_id, 'first_name'])
            return first_name.toUpperCase()[0]
        else
            return '?'

    get_name: ->
        return misc.trunc_middle(redux.getStore('users').get_name(@props.account_id)?.trim(), 20)

    get_background_color: ->
        return redux.getStore('users').get_color(@props.account_id)

    get_image: ->
        return redux.getStore('users').get_image(@props.account_id)

    viewing_what: ->
        if @props.path? and @props.project_id?
            return 'file'
        else if @props.project_id?
            return 'project'
        else
            return 'projects'

    render_line: ->
        return if not @props.activity?
        {project_id, path} = @props.activity
        line = @get_cursor_line(project_id, path)
        if line?
            <span><Space/> (Line {line})</span>

    get_cursor_line: ->
        return if not @props.activity?
        {project_id, path} = @props.activity
        line = redux.getProjectStore(project_id).get_users_cursors(path, @props.account_id)?[0]?['y']
        if line?
            return line + 1
        else
            return undefined

    render_tooltip_content: ->
        name = @get_name()
        if not @props.activity?
            return <span>{name}</span>
        switch @viewing_what()
            when 'projects'
                {ProjectTitle} = require('./projects')  # MUST be imported here.
                <span>{name} last seen at <ProjectTitle project_id={@props.activity.project_id} /></span>
            when 'project'
                <span>{name} last seen at {@props.activity.path}</span>
            when 'file'
                <span>{name} {@render_line()}</span>

    render_tooltip: ->
        <Tooltip id={@props.account_id}>
            {@render_tooltip_content()}
        </Tooltip>

    render_inside: ->
        url = @get_image()
        if url
            @render_image(url)
        else
            @render_letter()

    render_image: (url) ->
        <img
            style = {borderRadius:'50%', width:'100%', verticalAlign:'top'}
            src   = {url}
        />

    render_letter: ->
        bg = @get_background_color()
        style =
            backgroundColor : bg
            color           : if onecolor(bg).magenta() >= 0.4 then 'white' else 'black'
        <span style={misc.merge style, CIRCLE_INNER_STYLE}>
            {@letter()}
        </span>

    fade: ->
        return 1 if not @props.activity?
        {last_used} = @props.activity
        # don't fade out completely as then just see an empty face, which looks broken...
        return misc.ensure_bound(1 - ((server_time() - last_used) / (@props.max_age_s*1000)), 0, .85)


    render : ->
        if not @props.user_map?
            return <Loading />

        size = @props.size
        outer_style =
            height     : "#{size}px"
            width      : "#{size}px"
            lineHeight : "#{size}px"
            fontSize   : "#{.7*size}px"
            opacity    : @fade()

        <OverlayTrigger placement='top' overlay={@render_tooltip()}>
            <div style = {display:'inline-block', pointer:'cursor'}>
                <div
                    style   = {misc.merge outer_style, CIRCLE_OUTER_STYLE}
                    onClick = {@click_avatar}
                    >
                    {@render_inside()}
                </div>
            </div>
        </OverlayTrigger>

most_recent = (activity) ->
    last_used = activity[0].last_used
    y = activity[0]
    for x in activity.slice(1)
        if x.last_used <= last_used
            y = x
            last_used = x.last_used
    return y

USERS_VIEWING_STYLE =
    overflowX : 'auto'
    display   : 'flex'
    zIndex    : 1

exports.UsersViewing = rclass
    displayName: "UsersViewing"

    # If neither project_id nor path given, then viewing projects; if project_id
    # given, then viewing that project; if both given, then viewing a particular file.
    propTypes:
        project_id : rtypes.string  # optional -- must be given if path is specified
        path       : rtypes.string  # optional -- if given, viewing a file.
        max_age_s  : rtypes.number.isRequired
        size       : rtypes.number
        style      : rtypes.object

    getDefaultProps: ->
        max_age_s : MAX_AGE_S
        size      : 24
        style     : {maxWidth:"120px"}

    mixins: [SetIntervalMixin]

    componentDidMount: ->
        @setInterval((=> @forceUpdate()), UPDATE_INTERVAL_S*1000)

    reduxProps:
        file_use :
            file_use : rtypes.immutable   # only so component is updated immediately whenever file use changes
        account :
            account_id : rtypes.string    # so we can exclude ourselves from list of faces

    render_active_users: (users) ->
        v = ({account_id:account_id, activity:most_recent(activity)} for account_id, activity of (users ? {}))
        v.sort((a,b) -> misc.cmp(b.last_used, a.last_used))
        i = 0
        for {account_id, activity} in v
            if @props.account_id != account_id   # only show other users
                i += 1
                <Avatar
                    key        = {account_id+i}
                    account_id = {account_id}
                    max_age_s  = {@props.max_age_s}
                    project_id = {@props.project_id}
                    path       = {@props.path}
                    size       = {@props.size}
                    activity   = {activity} />

    render: ->
        if not @props.file_use? or not @props.account_id?
            return <Loading/>
        users = redux.getStore('file_use').get_active_users
            project_id : @props.project_id
            path       : @props.path
            max_age_s  : @props.max_age_s
        <div style={misc.merge(misc.copy(@props.style), USERS_VIEWING_STYLE)}>
            {@render_active_users(users)}
        </div>


