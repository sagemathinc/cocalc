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

# Global libraries
async       = require('async')
immutable   = require('immutable')

# React libraries
{Actions, Store}  = require('../app-framework')

# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc

# Course Library
{NO_ACCOUNT, STEPS, previous_step, step_direction, step_verb, step_ready} = require('./util')

# Upgrades
project_upgrades = require('./project-upgrades')

exports.CourseStore = class CourseStore extends Store
    any_assignment_uses_peer_grading: =>
        # Return true if there are any non-deleted assignments that use peer grading
        has_peer = false
        @get_assignments().forEach (assignment, _) =>
            if assignment.getIn(['peer_grade', 'enabled']) and not assignment.get('deleted')
                has_peer = true
                return false  # stop looping
        return has_peer

    get_peers_that_student_will_grade: (assignment, student) =>
        # Return the peer assignment for grading of the given assignment for the given student,
        # if such an assignment has been made.  If not, returns undefined.
        # In particular, this returns a Javascript array of student_id's.
        assignment = @get_assignment(assignment)
        student    = @get_student(student)
        return assignment.getIn(['peer_grade', 'map'])?.get(student.get('student_id'))?.toJS()

    get_peers_that_graded_student: (assignment, student) =>
        # Return Javascript array of the student_id's of the students
        # that graded the given student, or undefined if no relevant assignment.
        assignment = @get_assignment(assignment)
        map = assignment.getIn(['peer_grade', 'map'])
        if not map?
            return
        student = @get_student(student)
        id      = student.get('student_id')
        return (student_id for student_id, who_grading of map.toJS() when id in who_grading)

    get_shared_project_id: =>
        # return project_id (a string) if shared project has been created, or undefined or empty string otherwise.
        return @getIn(['settings', 'shared_project_id'])

    get_pay: =>
        return @getIn(['settings', 'pay']) ? ''

    get_allow_collabs: =>
        return @getIn(['settings', 'allow_collabs']) ? true

    get_email_invite: =>
        {SITE_NAME, DOMAIN_NAME} = require('smc-util/theme')
        @getIn(['settings', 'email_invite']) ? "We will use [#{SITE_NAME}](#{DOMAIN_NAME}) for the course *{title}*.  \n\nPlease sign up!\n\n--\n\n{name}"

    get_activity: =>
        @get('activity')

    get_students: =>
        @get('students')

    # Get the student's name.
    # Uses an instructor-given name if it exists.
    get_student_name: (student, include_email=false) =>
        student = @get_student(student)
        if not student?
            return 'student'
        email = student.get('email_address')
        account_id = student.get('account_id')
        first_name = student.get('first_name') ? @redux.getStore('users').get_first_name(account_id)
        last_name = student.get('last_name') ? @redux.getStore('users').get_last_name(account_id)
        if first_name? and last_name?
            full_name = first_name + ' ' + last_name
        else if first_name?
            full_name = first_name
        else if last_name?
            full_name = last_name
        else
            full_name = email ? 'student'
        if include_email and full_name? and email?
            full = full_name + " <#{email}>"
        else
            full = full_name
        if full_name == 'Unknown User' and email?
            full_name = email
        if not include_email
            return full_name
        try
            JSON.stringify(full_name)
            simple = full_name
        catch
            simple = full_name.replace(/\W/g, ' ')
        return {simple:simple, full:full}

    get_student_email: (student) =>
        student = @get_student(student)
        if not student?
            return 'student'
        return student.get('email_address')

    get_student_account_id: (student) =>
        student = @get_student(student)
        return if not student?
        return student.get('account_id')

    get_student_ids: (opts) =>
        opts = defaults opts,
            deleted : false
        if not @get('students')?
            return
        v = []
        @get('students').map (val, student_id) =>
            if !!val.get('deleted') == opts.deleted
                v.push(student_id)
        return v

    get_student_id: (student_or_id) =>
        return @get_student(student_or_id)?.get('student_id')

    # return list of all student projects (or undefined if not loaded)
    get_student_project_ids: (opts) =>
        {include_deleted, deleted_only, map} = defaults opts,
            include_deleted : false
            deleted_only    : false
            map             : false   # return as map to true/false instead of array
        # include_deleted = if true, also include deleted projects
        # deleted_only = if true, only include deleted projects
        if not @get('students')?
            return
        if map
            v = {}
            include = (x) -> v[x] = true
        else
            v = []
            include = (x) -> v.push(x)
        @get('students').map (val, student_id) =>
            id = val.get('project_id')
            if deleted_only
                if include_deleted and val.get('deleted')
                    include(id)
            else if include_deleted
                include(id)
            else if not val.get('deleted')
                include(id)
        return v

    get_student: (student) =>
        # return student with given id if a string; otherwise, just return student (the input)
        if typeof(student) != 'string'
            student = student?.get('student_id')
        return @getIn(['students', student])

    get_student_note: (student) =>
        return @get_student(student)?.get('note')

    get_student_project_id: (student) =>
        return @get_student(student)?.get('project_id')

    get_student_by_account_id: (account_id) =>
        ret = null
        @get_students().forEach (student) ->
            if student.get('account_id') == account_id
                ret = student.get('student_id')
                return false
        return ret

    get_sorted_students: =>
        v = []
        @get('students').map (student, id) =>
            if not student.get('deleted')
                v.push(student)
        v.sort (a,b) => misc.cmp(@get_student_name(a), @get_student_name(b))
        return v

    # always return the "manual" text grade (backwards compatible)
    get_grade: (assignment, student) =>
        return @get_assignment(assignment)?.get('grades')?.get(@get_student_id(student))

    ## this returns the grade with respect to the current grading mode
    #get_grade_wrt_mode: (assignment, student) =>
    #    grading_mode = @get_grading_mode(assignment)
    #    switch grading_mode
    #        when 'manual'
    #            grade        = @get_grade(assignment, student)
    #        when 'points'
    #            total_points = @get_points_total(assignment, student)
    #            max_points   = @get_grading_maxpoints(assignment)
    #            {grade2str}  = require('./grading/grade')
    #            grade        = grade2str(total_points, max_points)
    #    return grade

    get_comments: (assignment, student) =>
        return @get_assignment(assignment)?.get('comments')?.get(@get_student_id(student))

    get_points: (assignment, student) =>
        student_id = @get_student_id(student)
        points     = @get_assignment(assignment)?.getIn(['points', student_id])
        return points

    # could return undefined, intentionally, to signal there are no points
    get_points_filepath: (assignment, student, filepath) =>
        points = @get_points(assignment, student)
        return points?.get(filepath)

    get_points_total: (assignment, student) =>
        points = @get_points(assignment, student)
        return points?.reduce(((a, b) -> a + b), 0) ? 0

    get_points_subdir: (assignment, student, subdir) =>
        reducer = (cur, val, path) ->
            if path.indexOf(subdir + '/') == 0
                return cur + val
            else
                return cur

        student_id = @get_student(student)?.get('student_id')
        points     = @get_assignment(assignment)?.getIn(['points', student_id])
        return points?.reduce(reducer, 0) ? 0

    get_due_date: (assignment) =>
        due_date = @get_assignment(assignment)?.get('due_date')
        if due_date?
            return new Date(due_date)

    get_assignment_note: (assignment) =>
        return @get_assignment(assignment)?.get('note')

    get_assignments: =>
        return @get('assignments')

    get_assignment_by_path: (path) =>
        ret = null
        @get_assignments().forEach (assignment) ->
            if assignment.get('path') == path
                ret = assignment
                return false
        return ret

    get_sorted_assignments: =>
        v = []
        @get_assignments().map (assignment, id) =>
            if not assignment.get('deleted')
                v.push(assignment)
        f = (a) -> [a.get('due_date') ? 0, a.get('path')?.toLowerCase()]   # note: also used in compute_assignment_list
        v.sort (a,b) -> misc.cmp_array(f(a), f(b))
        return v

    get_assignment: (assignment) =>
        # return assignment with given id if a string; otherwise, just return assignment (the input)
        if typeof(assignment) != 'string'
            assignment = assignment?.get('assignment_id')
        return @getIn(['assignments', assignment])

    get_assignment_ids: (opts) =>
        opts = defaults opts,
            deleted : false   # if true return only deleted assignments
        if not @get_assignments()
            return
        v = []
        @get_assignments().map (val, assignment_id) =>
            if !!val.get('deleted') == opts.deleted
                v.push(assignment_id)
        return v

    _num_nondeleted: (a) =>
        if not a?
            return
        n = 0
        a.map (val, key) =>
            if not val.get('deleted')
                n += 1
        return n

    # number of non-deleted students
    num_students: => @_num_nondeleted(@get_students())

    # number of student projects that are currently running
    num_running_projects: (project_map) =>
        n = 0
        @get_students()?.map (student, student_id) =>
            if not student.get('deleted')
                if project_map.getIn([student.get('project_id'), 'state', 'state']) == 'running'
                    n += 1
        return n

    # number of non-deleted assignments
    num_assignments: => @_num_nondeleted(@get_assignments())

    # number of non-deleted handouts
    num_handouts: => @_num_nondeleted(@get_handouts())

    # get info about relation between a student and a given assignment
    student_assignment_info: (student, assignment) =>
        assignment  = @get_assignment(assignment)
        student     = @get_student(student)
        student_id  = student.get('student_id')
        status      = @get_assignment_status(assignment)
        info =                         # RHS -- important to be undefined if no info -- assumed in code
            last_assignment      : assignment.get('last_assignment')?.get(student_id)?.toJS()
            last_collect         : assignment.get('last_collect')?.get(student_id)?.toJS()
            last_peer_assignment : assignment.get('last_peer_assignment')?.get(student_id)?.toJS()
            last_peer_collect    : assignment.get('last_peer_collect')?.get(student_id)?.toJS()
            last_return_graded   : assignment.get('last_return_graded')?.get(student_id)?.toJS()
            student_id           : student_id
            assignment_id        : assignment.get('assignment_id')
            peer_assignment      : (status.not_collect + status.not_assignment == 0) and status.collect != 0
            peer_collect         : status.not_peer_assignment? and status.not_peer_assignment == 0
        return info


    # Return the last time the assignment was copied to/from the
    # student (in the given step of the workflow), or undefined.
    # Even an attempt to copy with an error counts.
    last_copied: (step, assignment, student_id, no_error) =>
        x = @get_assignment(assignment)?.get("last_#{step}")?.get(student_id)
        if not x?
            return
        if no_error and x.get('error')
            return
        return x.get('time')

    has_grade: (assignment, student_id) =>
        return !!@get_assignment(assignment)?.get("grades")?.get(student_id)

    get_grading_mode: (assignment) =>
        a = @get_assignment(assignment)
        return a?.getIn(['config', 'mode']) ? 'manual'

    get_grading_maxpoints: (assignment) =>
        a = @get_assignment(assignment)
        return a?.getIn(['config', 'maxpoints']) ? 100

    get_assignment_status: (assignment) =>
        #
        # Compute and return an object that has fields (deleted students are ignored)
        #
        #  assignment          - number of students who have received assignment includes
        #                        all students if skip_assignment is true
        #  not_assignment      - number of students who have NOT received assignment
        #                        always 0 if skip_assignment is true
        #  collect             - number of students from whom we have collected assignment includes
        #                        all students if skip_collect is true
        #  not_collect         - number of students from whom we have NOT collected assignment but we sent it to them
        #                        always 0 if skip_assignment is true
        #  peer_assignment     - number of students who have received peer assignment
        #                        (only present if peer grading enabled; similar for peer below)
        #  not_peer_assignment - number of students who have NOT received peer assignment
        #  peer_collect        - number of students from whom we have collected peer grading
        #  not_peer_collect    - number of students from whome we have NOT collected peer grading
        #  graded              - have a grade entered
        #  not_graded          - no grade entered
        #  return_graded       - number of students to whom we've returned assignment
        #  not_return_graded   - number of students to whom we've NOT returned assignment
        #                        but we collected it from them *and* either assigned a grade or skip grading
        #
        # This function caches its result and only recomputes values when the store changes,
        # so it should be safe to call in render.
        #
        if not @_assignment_status?
            @_assignment_status = {}
            @on 'change', =>   # clear cache on any change to the store
                @_assignment_status = {}
        assignment = @get_assignment(assignment)
        if not assignment?
            return undefined

        assignment_id = assignment.get('assignment_id')
        if @_assignment_status[assignment_id]?
            return @_assignment_status[assignment_id]

        students = @get_student_ids(deleted:false)
        if not students?
            return undefined

        # Is peer grading enabled?
        peer = assignment.get('peer_grade')?.get('enabled')
        skip_grading = assignment.get('skip_grading') ? false

        # if DEBUG then console.log('get_assignment_status/assignment', assignment)

        info = {}
        for t in STEPS(peer)
            info[t] = 0
            info["not_#{t}"] = 0
        info['graded'] = info['not_graded'] = 0
        for student_id in students
            previous = true
            for t in STEPS(peer)
                x = assignment.get("last_#{t}")?.get(student_id)
                if x? and not x.get('error') or assignment.get("skip_#{t}")
                    previous = true
                    info[t] += 1
                else
                    # add one only if the previous step *was* done (and in
                    # the case of returning, they have a grade)
                    graded = @has_grade(assignment, student_id) or skip_grading
                    if (previous and t != 'return_graded') or graded
                        info["not_#{t}"] += 1
                    previous = false

            if @has_grade(assignment, student_id)
                info['graded'] += 1
            else
                info['not_graded'] += 1

        @_assignment_status[assignment_id] = info
        return info

    get_handout_note: (handout) =>
        return @get_handout(handout)?.get('note')

    get_handouts: =>
        return @get('handouts')

    get_handout: (handout) =>
        # return handout with given id if a string; otherwise, just return handout (the input)
        if typeof(handout) != 'string'
            handout = handout?.get('handout_id')
        return @getIn(['handouts', handout])

    get_handout_ids: (opts) =>
        opts = defaults opts,
            deleted : false   # if true return only deleted handouts
        if not @get_handouts()
            return undefined
        v = []
        @get_handouts().map (val, handout_id) =>
            if !!val.get('deleted') == opts.deleted
                v.push(handout_id)
        return v

    student_handout_info: (student, handout) =>
        handout = @get_handout(handout)
        student = @get_student(student)
        student_id = student.get('student_id')
        status = @get_handout_status(handout)
        info =                         # RHS -- important to be undefined if no info -- assumed in code
            status     : handout.get('status')?.get(student_id)?.toJS()
            student_id : student_id
            handout_id : handout.get('handout_id')
        return info

    # Return the last time the handout was copied to/from the
    # student (in the given step of the workflow), or undefined.
    # Even an attempt to copy with an error counts.
    # ???
    handout_last_copied: (handout, student_id) =>
        x = @get_handout(handout)?.get("status")?.get(student_id)
        if not x?
            return undefined
        if x.get('error')
            return undefined
        return x.get('time')

    get_handout_status: (handout) =>
        #
        # Compute and return an object that has fields (deleted students are ignored)
        #
        #  handout     - number of students who have received handout
        #  not_handout - number of students who have NOT received handout
        # This function caches its result and only recomputes values when the store changes,
        # so it should be safe to call in render.
        #
        if not @_handout_status?
            @_handout_status = {}
            @on 'change', =>   # clear cache on any change to the store
                @_handout_status = {}
        handout = @get_handout(handout)
        if not handout?
            return undefined

        handout_id = handout.get('handout_id')
        if @_handout_status[handout_id]?
            return @_handout_status[handout_id]

        students = @get_student_ids(deleted:false)
        if not students?
            return undefined

        info =
            handout : 0
            not_handout : 0

        for student_id in students
            x = handout.get("status")?.get(student_id)
            if x? and not x.get('error')
                info.handout += 1
            else
                info.not_handout += 1

        @_handout_status[handout_id] = info
        return info

    get_upgrade_plan: (upgrade_goal) =>
        account_store = @redux.getStore('account')
        plan = project_upgrades.upgrade_plan
            account_id          : account_store.get_account_id()
            purchased_upgrades  : account_store.get_total_upgrades()
            project_map         : @redux.getStore('projects').get('project_map')
            student_project_ids : @get_student_project_ids(include_deleted:true, map:true)
            deleted_project_ids : @get_student_project_ids(include_deleted:true, deleted_only:true, map:true)
            upgrade_goal        : upgrade_goal
        return plan

    # return true, if student has collected files without an error (and hence ready to be graded)
    has_last_collected: (assignment, student_id) ->
        last_collect = @get_assignment(assignment).get('last_collect')?.get(student_id)
        if (not last_collect?) or last_collect.get('error')
            return false
        else
            return true

    # this builds a "data" object containing information about all students and
    # graded assignments. it's used in particular for the json export in the course settings
    get_export_course_data: ->
        assignments = @get_sorted_assignments()
        students    = @get_sorted_students()
        data        = {students : {}, assignments : {}}

        for student in students
            id = student.get('student_id')
            student_info = data.students[id] = {}
            student_info.name    = @get_student_name(student)
            student_info.email   = @get_student_email(student) ? ''

        for assignment in assignments
            apth   = assignment.get('path')
            a_data = data.assignments[apth] = []
            for student in students
                id     = student.get('student_id')
                grade  = @get_grade(assignment, student) ? ''
                student_data =
                    student : id
                    grade   : grade
                    comment : @get_comments(assignment, student) ? ''
                points_data = assignment.getIn(['points', id])
                points_data?.forEach (points, filepath) ->
                    student_data.points ?= {}
                    student_data.points[filepath] = points
                a_data.push(student_data)
        return data

    # select the first/next student among all collected assignments
    # first: current_student_id is undefined and it should return the first one
    # next: current_student_id is a student_id and it returns the next or previous student
    grading_next_student: (opts) =>
        opts = defaults opts,
            assignment            : required
            current_student_id    : undefined
            direction             : 1
            without_grade         : true   # not yet graded?
            collected_files       : true   # has collected files?
            cursors               : null   # for skipping students others are currently grading
        # direction: 1 or -1
        # student_to_grade: if true, only return a student who does not have a grade yet
        assignment         = @get_assignment(opts.assignment)
        students           = @get_sorted_students()
        assignment_cursors = opts.cursors?.get(assignment.get('assignment_id'))
        minutes_10_ago     = misc.server_minutes_ago(10)

        if opts.direction == -1
            students = students.reverse()
        skip = opts.current_student_id?
        #cnt  = if opts.direction == -1 then students.length + 1 else 0
        for student, idx in students
            student_id = student.get('student_id')
            #cnt += opts.direction
            if skip and student_id != opts.current_student_id
                continue
            else
                if skip
                    skip = false
                    continue

            # collected_files and without_grade is true by default
            # in that case, only return a student without a grade but with collected files
            x = @has_last_collected(assignment, student_id)
            is_collected = (not opts.collected_files) or (x)
            has_no_grade = (not opts.without_grade) or (not @has_grade(assignment, student_id))
            cursor_time  = assignment_cursors?.get(student_id)
            concurrent_grading = cursor_time?.some((time) -> time > minutes_10_ago)
            if has_no_grade and is_collected and (not concurrent_grading)
                return student_id

            # when stepping backwards, it's more natural to always end up at the start
            if (idx == students.length - 1) and (opts.direction < 0)
                return @grading_next_student(
                    assignment          : opts.assignment
                    current_student_id  : student_id
                    direction           : 1
                    without_grade       : opts.without_grade
                    collected_files     : opts.collected_files
                )
        return null

    # this retrieves the listing information for a specific collected assignment
    grading_get_listing: (assignment, student_id, subdir, cb) =>
        project_id   = @get('course_project_id')
        collect_path = "#{assignment.get('collect_path')}/#{student_id}"

        locals =
            listing : null
            group   : null

        async.series([
            (cb) =>
                # make sure that our relationship to this project is known.
                @redux.getStore('projects').wait
                    until   : (s) => s.get_my_group(project_id)
                    timeout : 30
                    cb      : (err, group) =>
                        locals.group = group
                        cb(err)
            (cb) =>
                {get_directory_listing} = require('../project_actions')
                {join} = require('path')
                get_directory_listing
                    project_id : project_id
                    path       : join(collect_path, subdir ? '')
                    hidden     : false
                    max_time_s : 30  # keep trying for up to 30 secs
                    group      : locals.group
                    cb         : (err, listing) =>
                        locals.listing = listing
                        cb(err)
        ], (err) =>
            cb(err, locals.listing)
        )

    # returns a list of all students according to the configuration of the grading object
    # "all_points" is intentionally for all students, regardless of filtering
    grading_get_student_list: (grading) =>
        return if not grading?
        assignment      = @get_assignment(grading.assignment_id)
        return if not assignment?
        student_filter  = grading.student_filter
        search_string   = student_filter.toLowerCase()
        only_not_graded = grading.only_not_graded
        only_collected  = grading.only_collected

        matching = (id, name) =>
            pick_student = true
            if student_filter?.length > 0
                pick_student and= name.toLowerCase().indexOf(search_string) >= 0
            if only_not_graded
                pick_student and= not @has_grade(assignment, id)
            if only_collected
                pick_student and= @has_last_collected(assignment, id)
            return pick_student

        all_points  = []
        list = @get_sorted_students().map (student) =>
            id           = student.get('student_id')
            name         = @get_student_name(student)
            points       = @get_points_total(assignment, id)
            is_collected = @student_assignment_info(id, assignment)?.last_collect?.time?
            # all_points is used to compute quantile distributions
            # collected but no points means zero points...
            all_points.push(points ? 0) if (points? or is_collected)
            # filter by name or button states
            return null if not matching(id, name)
            return student

        list = (entry for entry in list when entry?)

        # we assume throughout the code that all_points is sorted!
        all_points.sort((a, b) -> a - b)
        return {student_list:list, all_points:all_points}

    # derive the path to the discussion chat file from the assignment and student's account_id
    grading_get_discussion_path: (assignment_path, account_id) ->
        return if (not assignment_path?)
        return NO_ACCOUNT if (not account_id?)
        course_filename = @get('course_filename')
        path  = "#{course_filename}-#{assignment_path}-#{account_id}"
        return misc.meta_file(path, 'chat')

    # this is used to keep track of openen discussions, used for cleaning up later
    grading_register_discussion: (chat_path) ->
        @_open_discussions ?= immutable.Set()
        @_open_discussions = @_open_discussions.add(chat_path)

    grading_remove_discussion: (chat_path) ->
        return if not @_open_discussions?
        @_open_discussions = @_open_discussions.remove(chat_path)

    # builds the set of all distinct grades entered for manual grading.
    # used for populating the drop-down menu
    get_list_of_grades: (assignment_id) ->
        assignment = @get_assignment(assignment_id)
        return if not assignment?
        grades     = assignment.get('grades')
        # initially, there are no grades
        values     = immutable.Set(grades?.values() ? [])
        return values.sortBy((a) -> a.toLowerCase())
