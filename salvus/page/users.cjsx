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

misc = require('misc')

{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent}  = require('flux')

{TimeAgo} = require('r_misc')

# Define user actions
class UsersActions extends Actions
    setTo: (payload) -> payload

    include_user: (account_id) ->
        if not flux.getStore('users').user_map?.get(account_id)
            console.log('TODO: not implemented -- would include ', account_id)

# Register the actions
flux.createActions('users', UsersActions)

# Define user store: all the users you collaborate with
class UsersStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('users')
        @register(ActionIds.setTo, @setTo)
        @state = {}

    setTo: (payload) ->
        @setState(payload)

    get_first_name: (account_id) =>
        @state.user_map?.get(account_id)?.get('first_name')

    get_last_name: (account_id) =>
        @state.user_map?.get(account_id)?.get('last_name')

    get_name: (account_id) =>
        m = @state.user_map?.get(account_id)
        if m?
            return "#{m.get('first_name')} #{m.get('last_name')}"

    get_last_active: (account_id) =>
        @state.user_map?.get(account_id)?.get('last_active')

    # Given an array of objects with an account_id field, sort it by the
    # corresponding last_active timestamp, starting with most recently active.
    # Also, adds the last_active field to each element of users, if it isn't
    # already there.
    sort_by_activity: (users) =>
        for user in users
            # If last_active isn't set, set it to what's in the store... unless
            # the store doesn't know, in which case set to 0 (infinitely old):
            user.last_active ?= @state.user_map?.get(user.account_id)?.get('last_active') ? 0
        return users.sort (a,b) ->
            c = misc.cmp(b.last_active, a.last_active)
            if c then c else misc.cmp(@get_last_name(a.account_id), @get_last_name(b.account_id))

# Register user store
flux.createStore('users', UsersStore)

# Create and register projects table, which gets automatically
# synchronized with the server.
class UsersTable extends Table
    query: ->
        return 'collaborators'

    _change: (table, keys) =>
        @flux.getActions('users').setTo(user_map: table.get())

flux.createTable('users', UsersTable)


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

# NOTE: Only use the component below if no containing component does *NOT* itself also
# connect to the users store.  If any containing component connects to the user store,
# you *must* use the Users component above directly.   See, e.g., ProjectSelector.
exports.UserAuto = rclass
    displayName : 'UserAuto'

    propTypes :
        account_id  : rtypes.string.isRequired
        user_map    : rtypes.object
        last_active : rtypes.oneOfType([rtypes.object, rtypes.number])

    render : ->
        <FluxComponent connectToStores={'users'}>
            <User account_id={@props.account_id} last_active={@props.last_active} />
        </FluxComponent>


