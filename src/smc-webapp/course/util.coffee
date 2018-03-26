##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
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

# Pure functions used in the course manager

# CoCalc libraries
misc = require('smc-util/misc')
{defaults, required} = misc

immutable = require('immutable')

exports.STEPS = (peer) ->
    if peer
        return ['assignment', 'collect', 'peer_assignment', 'peer_collect', 'return_graded']
    else
        return ['assignment', 'collect', 'return_graded']

exports.previous_step = (step, peer) ->
    prev = undefined
    for s in exports.STEPS(peer)
        if step == s
            return prev
        prev = s
    console.warn("BUG! previous_step('#{step}, #{peer}')")

exports.step_direction = (step) ->
    switch step
        when 'assignment'
            return 'to'
        when 'collect'
            return 'from'
        when 'return_graded'
            return 'to'
        when 'peer_assignment'
            return 'to'
        when 'peer_collect'
            return 'from'
        else
            console.warn("BUG! step_direction('#{step}')")

exports.step_verb = (step) ->
    switch step
        when 'assignment'
            return 'assign'
        when 'collect'
            return 'collect'
        when 'return_graded'
            return 'return'
        when 'peer_assignment'
            return 'assign'
        when 'peer_collect'
            return 'collect'
        else
            console.warn("BUG! step_verb('#{step}')")

exports.step_ready = (step, n) ->
    switch step
        when 'assignment'
            return ''
        when 'collect'
            return if n >1 then ' who have already received it' else ' who has already received it'
        when 'return_graded'
            return ' whose work you have graded'
        when 'peer_assignment'
            return ' for peer grading'
        when 'peer_collect'
            return ' who should have peer graded it'

# Takes a student immutable.Map with key 'student_id'
# Returns a list of students `x` shaped like:
# {
#    first_name    : string
#    last_name     : string
#    last_active   : integer
#    hosting       : bool
#    email_address : string
# }
exports.parse_students = (student_map, user_map, redux) ->
    v = exports.immutable_to_list(student_map, 'student_id')
    for x in v
        if x.account_id?
            user = user_map.get(x.account_id)
            x.first_name ?= user?.get('first_name') ? ''
            x.last_name  ?= user?.get('last_name') ? ''
            if x.project_id?
                x.last_active = redux.getStore('projects').get_last_active(x.project_id)?.get(x.account_id)?.getTime?()
                upgrades = redux.getStore('projects').get_total_project_quotas(x.project_id)
                if upgrades?
                    x.hosting = upgrades.member_host

        x.first_name  ?= ""
        x.last_name   ?= ""
        x.last_active ?= 0
        x.hosting ?= false
        x.email_address ?= ""
    return v

# Transforms Iterable<K, M<i, m>> to [M<i + primary_key, m + K>] where primary_key maps to K
# Dunno if either of these is readable...
# Turns Map(Keys -> Objects{...}) into [Objects{primary_key : Key, ...}]
exports.immutable_to_list = (x, primary_key) ->
    if not x?
        return
    v = []
    x.map (val, key) ->
        v.push(misc.merge(val.toJS(), {"#{primary_key}":key}))
    return v

# Returns a list of matched objects and the number of objects
# which were in the original list but omitted in the returned list
exports.compute_match_list = (opts) ->
    opts = defaults opts,
        list        : required  # list of objects<M>
        search_key  : required  # M.search_key property to match over
        search      : required  # matches to M.search_key
        ignore_case : true
    {list, search, search_key, ignore_case} = opts
    if not search # why are you even calling this..
        return {list:list, num_omitted:0}

    num_omitted = 0
    words = misc.split(search)
    matches = (x) =>
        if ignore_case
            k = x[search_key].toLowerCase?()
        else
            k = x[search_key]
        for w in words
            if k.indexOf(w) == -1 # no match
                num_omitted += 1
                return false
        return true
    list = list.filter matches
    return {list:list, num_omitted:num_omitted}

# Returns
# `list` partitioned into [not deleted, deleted]
# where each partition is sorted based on the given `compare_function`
# deleted is not included by default
exports.order_list = (opts) ->
    opts = defaults opts,
        list             : required
        compare_function : required
        reverse          : false
        include_deleted  : false
    {list, compare_function, include_deleted} = opts

    x = list.filter (x) => x.deleted
    sorted_deleted = x.sort compare_function

    y = list.filter (x) => not x.deleted
    list = y.sort compare_function

    if opts.reverse
        list.reverse()

    if include_deleted
        list = list.concat(sorted_deleted)

    return {list:list, deleted:x, num_deleted:sorted_deleted.length}

sort_on_string_field = (field) ->
    (a,b) -> misc.cmp(a[field].toLowerCase(), b[field].toLowerCase())

sort_on_numerical_field = (field) ->
    (a,b) -> misc.cmp(a[field] * -1, b[field] * -1)

exports.pick_student_sorter = (sort) ->
    switch sort.column_name
        when "email" then sort_on_string_field("email_address")
        when "first_name" then sort_on_string_field("first_name")
        when "last_name" then sort_on_string_field("last_name")
        when "last_active" then sort_on_numerical_field("last_active")
        when "hosting" then sort_on_numerical_field("hosting")

# string indicating that there is no account
exports.NO_ACCOUNT = '<NO_ACCOUNT>'