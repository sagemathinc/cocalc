###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2016, Sagemath Inc.
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

misc = require('smc-util/misc')

{React, Actions, Store, Table, redux, rtypes, rclass}  = require('./smc-react')

{TimeAgo, Tip} = require('./r_misc')

{salvus_client} = require('./salvus_client')   # needed for getting non-collaborator user names

immutable = require('immutable')

# Register the actions
class UsersActions extends Actions
    fetch_non_collaborator: (account_id) =>
        if not account_id
            return
        salvus_client.get_usernames
            account_ids : [account_id]
            use_cache   : false
            cb          : (err, x) =>
                if err
                    console.warn("WARNING: unable to get username for account with id '#{account_id}'")
                else
                    obj = x[account_id]
                    if obj?
                        obj.account_id = account_id
                        user_map = store.get('user_map')
                        if user_map? and not user_map.get(account_id)?
                            user_map = user_map.set(account_id, immutable.fromJS(obj))
                            @setState(user_map : user_map)

actions = redux.createActions('users', UsersActions)

# Define user store: all the users you collaborate with
class UsersStore extends Store
    get_first_name: (account_id) =>
        return @getIn(['user_map', account_id, 'first_name']) ? 'Unknown'

    get_last_name: (account_id) =>
        return @getIn(['user_map', account_id, 'last_name']) ? 'User'

    # URL of color (defaults to rgb(170,170,170))
    get_color: (account_id) =>
        return @getIn(['user_map', account_id, 'profile', 'color']) ? 'rgb(170,170,170)'

    # URL of image or undefined if none
    get_image: (account_id) =>
        return @getIn(['user_map', account_id, 'profile', 'image'])

    get_name: (account_id) =>
        user_map = @get('user_map')
        if not user_map?
            return
        m = user_map.get(account_id)
        if m?
            return "#{m.get('first_name')} #{m.get('last_name')}"
        else
            # look it up, which causes it to get saved in the store, which causes a new render later.
            actions.fetch_non_collaborator(account_id)
            # for now will just return undefined; when store gets updated with other_names
            # knowing the account_id, then component will re-reender.
            return

    get_last_active: (account_id) =>
        return @getIn(['user_map', account_id, 'last_active'])

    # Given an array of objects with an account_id field, sort it by the
    # corresponding last_active timestamp, starting with most recently active.
    # Also, adds the last_active field to each element of users, if it isn't
    # already there.
    sort_by_activity: (users) =>
        for user in users
            # If last_active isn't set, set it to what's in the store... unless
            # the store doesn't know, in which case set to 0 (infinitely old):
            user.last_active ?= @get_last_active(user.account_id) ? 0
        return users.sort (a,b) ->
            c = misc.cmp(b.last_active, a.last_active)
            if c then c else misc.cmp(@get_last_name(a.account_id), @get_last_name(b.account_id))

# Register user store
store = redux.createStore('users', UsersStore)

# Create and register projects table, which gets automatically
# synchronized with the server.
class UsersTable extends Table
    query: ->
        return 'collaborators'

    _change: (table, keys) =>
        # Merge the new table in with what we already have.  If users disappear during the session
        # *or* if user info is added by fetch_non_collaborator, it is important not to just
        # forget about their names.
        upstream_user_map = table.get()
        user_map = store.get('user_map')
        if not user_map?
            @redux.getActions('users').setState(user_map: upstream_user_map)
            return
        # merge in upstream changes:
        table.get().map (data, account_id) =>
            if data != user_map.get(account_id)
                user_map = user_map.set(account_id, data)
            return false
        @redux.getActions('users').setState(user_map: user_map)

redux.createTable('users', UsersTable)

exports.User = User = rclass
    displayName : 'User'

    propTypes :
        account_id  : rtypes.string.isRequired
        user_map    : rtypes.object # immutable map if known
        last_active : rtypes.oneOfType([rtypes.object, rtypes.number])
        name        : rtypes.string  # if not given, is got from store -- will be truncated to 50 characters in all cases.

    shouldComponentUpdate: (nextProps) ->
        if @props.account_id != nextProps.account_id
            return true
        n = nextProps.user_map?.get(@props.account_id)
        if not n?
            return true   # don't know anything about user yet, so just update.
        if not n.equals(@props.user_map?.get(@props.account_id))
            return true   # something about the user changed in the user_map, so updated.
        if @props.last_active != nextProps.last_active
            return true   # last active time changed, so update
        if @props.show_original != nextProps.show_original
            return true
        if @props.name != nextProps.name
            return true
        return false  # same so don't update

    render_last_active: ->
        if @props.last_active
            <span> (<TimeAgo date={@props.last_active} />)</span>

    render_original: (info) ->
        if info.first_name and info.last_name
            full_name = info.first_name + ' ' + info.last_name
        else if info.first_name
            full_name = info.first_name
        else if info.last_name
            full_name = info.last_name
        else
            full_name = ''

        if @props.show_original and full_name != @props.name
            <Tip placement='top'
                 title='User Name'
                 tip='The name this user has given their account.'
            >
                <span style={color:"#666"}> ({full_name})</span>
            </Tip>

    name: (info) ->
        return misc.trunc_middle((@props.name ? "#{info.first_name} #{info.last_name}"), 50)

    render: ->
        if not @props.user_map? or @props.user_map.size == 0
            return <span>Loading...</span>
        info = @props.user_map?.get(@props.account_id)
        if not info?
            if not misc.is_valid_uuid_string(@props.account_id)
                return <span>{@props.account_id} unsucessfully</span>
            actions.fetch_non_collaborator(@props.account_id)
            return <span>Loading...</span>
        else
            info = info.toJS()
            return <span>{@name(info)}{@render_original(info)}{@render_last_active()}</span>

