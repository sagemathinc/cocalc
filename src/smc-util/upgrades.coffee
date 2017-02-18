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

{PROJECT_UPGRADES} = require('./schema')

misc = require('./misc')

# This is used by the frontend in r_account.  It's also used by the backend
# to double check the claims of the frontend.
# stripe_subscriptions_data = stripe_customer?.subscriptions?.data
exports.get_total_upgrades = get_total_upgrades = (stripe_subscriptions_data) ->
    subs = stripe_subscriptions_data
    if not subs?
        return {}
    total = {}
    for sub in subs
        for q in [0...sub.quantity]
            total = misc.map_sum(total, PROJECT_UPGRADES.membership[sub.plan.id.split('-')[0]].benefits)
    return total

#
# INPUT:
#    memberships = {standard:2, premium:1, course:2, ...}
#    projects = {project_id:{cores:1, network:1, ...}, ...}
#
# OUTPUT:
#     {available:{cores:10, network:3, ...},   excess:{project_id:{cores:2, ...}}  }
#
exports.available_upgrades = (stripe_subscriptions_data, projects) ->
    available = get_total_upgrades(stripe_subscriptions_data)   # start with amount available being your quota
    excess    = {}                           # nothing exceeds quota
    # sort projects by project_id so that excess will be well defined
    v = ({project_id: project_id, upgrades: upgrades} for project_id, upgrades of projects)
    v.sort (a,b) -> misc.cmp(a.project_id, b.project_id)
    for {project_id, upgrades} in v
        for prop, curval of upgrades
            available[prop] ?= 0   # ensure that available is defined for this prop
            if curval <= available[prop]   # if the current value for this project is within what is left, just subtract it off
                available[prop] -= curval
            else                           # otherwise, it goes over, so record by how much in excess, then set available to 0.
                excess[project_id] ?= {}
                excess[project_id][prop] = curval - available[prop]
                available[prop] = 0
    return available:available, excess:excess

# INPUT: same as above, but also a single project_id
#
# OUTPUT:  Returns the maximum amount for each upgrade setting that a control
# (which starts at 0) for configuring that setting for the project should go up to.
#
#      {cores:2, network:1, disk_quota:2000, memory:1000}
#
#
exports.upgrade_maxes = (stripe_subscriptions_data, projects, project_id) ->
    {available, excess} = available_upgrades(stripe_subscriptions_data, projects)
    allocated = projects[project_id]
    maxes = {}
    for param, avail of available
        max = PROJECT_UPGRADES.max_per_project[param]  # the maximum allowed for this param for any project
        alloc = allocated[param] ? 0                   # how much has already been allocated to this project
        maxes[param] = Math.min(alloc + avail, max)
    return maxes
