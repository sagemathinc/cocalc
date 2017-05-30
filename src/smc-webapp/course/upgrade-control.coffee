###
Functions for determining various things about applying upgrades to a project.

WARNING: Pure Javascript with no crazy dependencies for easy unit testing.
###

misc = require('smc-util/misc')
{defaults, required} = misc

exports.current_student_project_upgrades = (opts) ->
    opts = defaults opts,
        account_id : required
    ###
    Return the total upgrades currently applied to each student project from
    everybody except the user with given account_id.

    This is a map {project_id:{quota0:x, quota1:y, ...}, ...}
    ###


exports.available_upgrades = (opts) ->
    opts = defaults opts,
        account_id          : required   # id of a user
        purchased_upgrades  : required   # map of the total upgrades purchased by account_id
        project_map         : required   # immutable.js map of data about projects (typically from projects store)
        student_project_ids : required   # map project_id:true with keys *all* student projects in
                                         # this course (including deleted)
    ###
    Return the total upgrades that the user with given account_id has to apply
    toward this course.   This is all upgrades they have purchased minus
    upgrades they have applied to projects that aren't student projects in
    this course.  Thus this is what they have available to distribute to
    their students in this course.

    This is a map {quota0:x, quota1:y, ...}
    ###
    available = misc.copy(opts.purchased_upgrades)
    opts.project_map.map (project) ->
        if opts.student_project_ids[project.get('project_id')] # do not count projects in course
            return
        upgrades = project.getIn(['users', opts.account_id, 'upgrades'])?.toJS()
        if upgrades?
            available = misc.map_diff(available, upgrades)
        return
    return available