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

# React libraries
{Actions, Store}  = require('../smc-react')

# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc

# Course Library
{STEPS, previous_step, step_direction, step_verb, step_ready} = require('./util')

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

    get_sorted_students: =>
        v = []
        @get('students').map (student, id) =>
            if not student.get('deleted')
                v.push(student)
        v.sort (a,b) => misc.cmp(@get_student_name(a), @get_student_name(b))
        return v

    get_grade: (assignment, student) =>
        return @get_assignment(assignment)?.get('grades')?.get(@get_student(student)?.get('student_id'))

    get_comments: (assignment, student) =>
        return @get_assignment(assignment)?.get('comments')?.get(@get_student(student)?.get('student_id'))

    get_due_date: (assignment) =>
        due_date = @get_assignment(assignment)?.get('due_date')
        if due_date?
            return new Date(due_date)

    get_assignment_note: (assignment) =>
        return @get_assignment(assignment)?.get('note')

    get_assignments: =>
        return @get('assignments')

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
        assignment = @get_assignment(assignment)
        student = @get_student(student)
        student_id = student.get('student_id')
        status = @get_assignment_status(assignment)
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
