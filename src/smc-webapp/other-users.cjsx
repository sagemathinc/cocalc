#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

onecolor = require('onecolor')

misc = require('smc-util/misc')

{server_time} = require('./webapp_client').webapp_client

{rclass, React, ReactDOM, redux, Redux, rtypes} = require('./app-framework')
{Loading, SetIntervalMixin, Space} = require('./r_misc')
{OverlayTrigger, Tooltip} = require('react-bootstrap')
{Avatar} = require('./account/avatar/avatar')

# How frequently all UsersViewing componenents are completely updated.
# This is only needed to ensure that faces fade out; any newly added faces
# will still be displayed instantly.  Also, updating more frequently updates
# the line positions in the tooltip.
UPDATE_INTERVAL_S = 15

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

    reduxProps:
        file_use :
            file_use : rtypes.immutable   # only so component is updated immediately whenever file use changes
        account :
            account_id : rtypes.string    # so we can exclude ourselves from list of faces

    getDefaultProps: ->
        max_age_s : MAX_AGE_S
        size      : 24
        style     : {maxWidth:"120px"}

    mixins: [SetIntervalMixin]

    componentDidMount: ->
        @setInterval((=> @forceUpdate()), UPDATE_INTERVAL_S*1000)

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
            if @props.no_loading
                return <span></span>
            else
                return <Loading/>
        users = redux.getStore('file_use').get_active_users
            project_id : @props.project_id
            path       : @props.path
            max_age_s  : @props.max_age_s
        <div style={misc.merge(misc.copy(@props.style), USERS_VIEWING_STYLE)}>
            {@render_active_users(users)}
        </div>
