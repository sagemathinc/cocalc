{PROJECT_UPGRADES} = require('schema')

misc = require('misc')

#
# INPUT:
#    memberships = {standard:2, premium:1, course:2, ...}
# OUTPUT:
#    {cores:10, network:3, ...}
upgrade_quota = exports.upgrade_quota = (memberships) ->
    quota = {}
    for name, quantity of memberships
        for prop, val of PROJECT_UPGRADES.membership[name].benefits
            quota[prop] ?= 0
            quota[prop] += quantity * val
    return quota

#
# INPUT:
#    memberships = {standard:2, premium:1, course:2, ...}
#    projects = {project_id:{cores:1, network:1, ...}, ...}
#
# OUTPUT:
#     {available:{cores:10, network:3, ...},   excess:{project_id:{cores:2, ...}}  }
#
exports.available_upgrades = (memberships, projects) ->
    available = upgrade_quota(memberships)   # start with amount available being your quota
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
exports.upgrade_maxes = (memberships, projects, project_id) ->
    {available, excess} = available_upgrades(memberships, projects)
    allocated = projects[project_id]
    maxes = {}
    for param, avail of available
        max = PROJECT_UPGRADES.max_per_project[param]  # the maximum allowed for this param for any project
        alloc = allocated[param] ? 0                   # how much has already been allocated to this project
        maxes[param] = Math.min(alloc + avail, max)
    return maxes