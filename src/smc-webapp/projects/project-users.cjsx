###
Showing list of users of a project
###

{React, redux, rtypes, rclass}  = require('../app-framework')

{User} = require('../users')

{Loading, r_join} = require('../r_misc')


exports.ProjectUsers = rclass
    displayName : 'ProjectUsers'

    reduxProps:
        users :
            user_map : rtypes.immutable
        account :
            account_id : rtypes.string

    propTypes: ->
        project : rtypes.immutable.Map.isRequired
        none    : rtypes.object   # optional component to display if there are no other users

    render :->
        if not @props.user_map?
            return <Loading />
        users = @props.project.get('users')?.keySeq().toArray() ? []
        other = ({account_id:account_id} for account_id in users when account_id != @props.account_id)
        redux.getStore('projects').sort_by_activity(other, @props.project.get('project_id'))
        v = []
        for i in [0...other.length]
            v.push <User
                           key         = {other[i].account_id}
                           last_active = {other[i].last_active}
                           account_id  = {other[i].account_id}
                           user_map    = {@props.user_map} />
        if v.length > 0
            return r_join(v)
        else if @props.none
            return @props.none
        else
            return <span></span>
