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

exports.upgrade_plan = (opts) ->
    types opts,
        account_id          : types.string.isRequired         # id of a user
        purchased_upgrades  : types.object.isRequired         # map of the total upgrades purchased by account_id
        project_map         : types.immutable.Map.isRequired  # immutable.js map of data about projects
        student_project_ids : types.object.isRequired         # map project_id:true with keys *all* student
                                                              # projects in course, including deleted
        deleted_project_ids : types.object.isRequired         # map project_id:true just for projects where
                                                              # student is considered deleted from class
        upgrade_goal        : types.object.isRequired         # [quota0:x, quota1:y]
    ###
    Determine what upgrades should be applied by this user to get
    the student projects to the given upgrade goal.  Preference
    is by project_id in order (arbitrary, but stable).

    The output is a map {student_project_id:{quota0:x, quota1:y, ...}, ...}, where the quota0:x means
    that account_id will apply x amount of quota0 total.  Thus to actually *do* the upgrading,
    this user (account_id) would go through the project map and set their upgrade contribution
    for the student projects in this course to exactly what is specified by this function.
    Note that no upgrade quota will be deducted from projects outside this course to satisfy
    the upgrade_goal.

    If a student_project_id is missing from the output the contribution is 0; if a quota is
    missing, the contribution is 0.

    The keys of the output map are **exactly** the ids of the projects where the current
    allocation should be *changed*.   That said, we only consider quotas explicitly given
    in the upgrade_goal map.
    ###
    # upgrades, etc., that student projects already have (which account_id did not provide)
    cur = exports.current_student_project_upgrades
        account_id          : opts.account_id
        project_map         : opts.project_map
        student_project_ids : opts.student_project_ids

    # upgrades we have that have not been allocated to our course
    available = exports.available_upgrades
        account_id          : opts.account_id
        purchased_upgrades  : opts.purchased_upgrades
        project_map         : opts.project_map
        student_project_ids : opts.student_project_ids

    ids = misc.keys(opts.student_project_ids); ids.sort()
    plan = {}
    for project_id in ids
        if opts.deleted_project_ids[project_id]
            # give this project NOTHING
            continue
        plan[project_id] = {}
        # we only care about quotas in the upgrade_goal
        for quota, val of opts.upgrade_goal
            need = val - (cur[project_id]?[quota] ? 0)
            if need > 0
                have = Math.min(need, available[quota])
                plan[project_id][quota] = have
                available[quota] -= have
        # is there an actual allocation change?  if not, we do not include this key.
        alloc = opts.project_map.getIn([project_id, 'users', opts.account_id, 'upgrades'])?.toJS() ? {}
        change = false
        for quota, _ of opts.upgrade_goal
            if (alloc[quota] ? 0) != (plan[project_id][quota] ? 0)
                change = true
                break
        if not change
            delete plan[project_id]
    return plan





