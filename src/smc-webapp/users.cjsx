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

misc = require('smc-util/misc')

{React, Actions, Store, Table, redux, rtypes, rclass}  = require('./smc-react')

{TimeAgo} = require('./r_misc')

# Register the actions
redux.createActions('users')

# Define user store: all the users you collaborate with
class UsersStore extends Store
    get_first_name: (account_id) =>
        return @getIn(['user_map', account_id, 'first_name'])

    get_last_name: (account_id) =>
        return @getIn(['user_map', account_id, 'last_name'])

    get_name: (account_id) =>
        m = @getIn(['user_map', account_id])
        if m?
            return "#{m.get('first_name')} #{m.get('last_name')}"

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
redux.createStore('users', UsersStore)

# Create and register projects table, which gets automatically
# synchronized with the server.
class UsersTable extends Table
    query: ->
        return 'collaborators'

    _change: (table, keys) =>
        @redux.getActions('users').setState(user_map: table.get())

redux.createTable('users', UsersTable)

exports.User = User = rclass
    displayName : 'User'

    propTypes :
        account_id  : rtypes.string.isRequired
        user_map    : rtypes.object # immutable map if known
        last_active : rtypes.oneOfType([rtypes.object, rtypes.number])
        name        : rtypes.string  # if not given, is got from store -- will be truncated to 50 characters in all cases.

    shouldComponentUpdate : (nextProps) ->
        if @props.account_id != nextProps.account_id
            return true
        n = nextProps.user_map?.get(@props.account_id)
        if not n?
            return true   # don't know anything about user yet, so just update.
        if not n.equals(@props.user_map?.get(@props.account_id))
            return true   # something about the user changed in the user_map, so updated.
        if @props.last_active != nextProps.last_active
            return true   # last active time changed, so update
        return false  # same so don't update

    render_last_active : ->
        if @props.last_active
            <span> (<TimeAgo date={@props.last_active} />)</span>

    name : (info) ->
        return misc.trunc_middle((@props.name ? "#{info.first_name} #{info.last_name}"), 50)

    render : ->
        info = @props.user_map?.get(@props.account_id)
        if not info?
            return <span>Loading...</span>
        else
            info = info.toJS()
            <span>{@name(info)}{@render_last_active()}</span>

