###
Functions for determining various things about applying upgrades to a project.

WARNING: Pure Javascript with no crazy dependencies for easy unit testing.
###

misc = require('smc-util/misc')
{defaults, required, types} = misc

exports.available_upgrades = (opts) ->
    types opts,
        account_id          : types.string.isRequired         # id of a user
        purchased_upgrades  : types.object.isRequired         # map of the total upgrades purchased by account_id
        project_map         : types.immutable.Map.isRequired  # immutable.js map of data about projects
        student_project_ids : types.object.isRequired         # map project_id:true with keys *all* student
                                                              # projects in course, including deleted
    ###
    Return the total upgrades that the user with given account_id has to apply
    toward this course.   This is all upgrades they have purchased minus
    upgrades they have applied to projects that aren't student projects in
    this course.  Thus this is what they have available to distribute to
    their students in this course.

    This is a map {quota0:x, quota1:y, ...}
    ###
    available = misc.copy(opts.purchased_upgrades)
    opts.project_map.forEach (project, project_id) ->
        if opts.student_project_ids[project_id] # do not count projects in course
            return
        upgrades = project.getIn(['users', opts.account_id, 'upgrades'])?.toJS()
        if upgrades?
            available = misc.map_diff(available, upgrades)
        return
    return available


exports.current_student_project_upgrades = (opts) ->
    types opts,
        account_id          : types.string.isRequired         # id of a user
        project_map         : types.immutable.Map.isRequired  # immutable.js map of data about projects
        student_project_ids : types.object.isRequired         # map project_id:true with keys *all* student
    ###
    Return the total upgrades currently applied to each student project from
    everybody else except the user with given account_id.

    This output is a map {project_id:{quota0:x, quota1:y, ...}, ...}; only projects with
    actual upgrades are included.
    ###
    other = {}
    for project_id of opts.student_project_ids
        users = opts.project_map.getIn([project_id, 'users'])
        if not users?
            continue
        x = undefined
        users.forEach (info, user_id) ->
            if user_id == opts.account_id
                return
            upgrades = info.get('upgrades')?.toJS()
            if not upgrades?
                return
            x = misc.map_sum(upgrades, x ? {})
            return
        if x?
            other[project_id] = x
    return other