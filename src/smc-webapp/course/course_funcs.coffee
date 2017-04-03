##############################################################################
#
#    CoCalc: Collaborative Calculations in the Cloud
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
        include_deleted  : false
    {list, compare_function, include_deleted} = opts

    x = list.filter (x) => x.deleted
    sorted_deleted = x.sort compare_function

    y = list.filter (x) => not x.deleted
    list = y.sort compare_function

    if include_deleted
        list = list.concat(sorted_deleted)

    return {list:list, deleted:x, num_deleted:sorted_deleted.length}
