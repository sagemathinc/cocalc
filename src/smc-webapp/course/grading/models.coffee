##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, Sagemath Inc.
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

# global libs
immutable = require('immutable')

# cocalc libs
{COMPUTE_FILE_MASKS} = require('../../project_store')

# grading specific
{PAGE_SIZE} = require('./common')

# utils

# filter predicate for file listing, return true for less important files
# also match name.ext~ variants in case of multiple rsyncs ...
is_course_specific_file = (filename) ->
    for fn in ['DUE_DATE.txt', 'GRADE.txt', 'STUDENT - ']
        return true if filename.indexOf(fn) == 0
    if filename.length >= 1 and filename[-1..] == '~'
        return true
    return false

course_specific_files = (entry) ->
    return true if entry.get('mask')
    filename = entry.get('name')
    return is_course_specific_file(filename)

# Models

GradingRecord = immutable.Record
    student_id      : null      # the current student
    student_info    : null      # additional information about the given student
    total_points    : 0         # number of total points for this student
    assignment_id   : null      # the UUID string
    student_list    : []        # the list of students
    current_idx     : null      # a number, the index where the @student_id is positioned in the @student_list
    all_points      : []        # list of numbers, which are the sum of points for each student
    end_of_list     : false     # true, if at the end of student list
    subdir          : ''        # for a collected directory of files, in which (relative) subdirectory are we?
    student_filter  : ''        # string, if set the student are filtered by their name
    only_not_graded : true      # by default, we want to only see student who did not recieve a grade yet
    only_collected  : true      # by default, we only want to see students where the assignments are collected
    page_number     : 0         # if there are more files in the listing than "PAGE_SIZE", this tells us the page at which we are
    num_pages       : 1         # total number of pages
    listing         : null      # an immutable.js map, "files": a sorted and processed list, like they are in project_store (entries have a "mask" field); and "error": e.g. "no_dir"
    listing_files   : null      # an immutable.js list, derived from listing.get('files') in get_listing_files
    show_all_files  : false     # if true, we want to see all files including those which are masked
    list_of_grades  : null      # distinctly known grades (must be a SortedSet)
    cursors         : null      # information about other collaborators also grading an assignment (i.e. realtime presence information)
    anonymous       : false     # if true, student names are hidden in the UI (simply to avoid bias a little bit)
    mode            : 'manual'  # manual or points, derived from store.get_grading_mode(assignment_id)
    discussion_path : null      # this is either a string to the "path" (indicating to show the chat) or null (no chat)
    discussion_show : false,    # if true, the UI shows the discussion
    'Grading'

exports.Grading = class Grading extends GradingRecord

    toggle_show_all_files: ->
        visible = @show_all_files
        return @merge(show_all_files: !visible, page_number: 0)

    toggle_anonymous: ->
        return @merge(anonymous: !@anonymous)

    set_discussion: (path) ->
        return @merge(discussion_path: path)

    toggle_show_discussion: (show) ->
        show ?= !@discussion_show
        return @merge(discussion_show: show)

    get_current_idx : ->
        current_idx = null
        @student_list?.forEach (student, idx) =>
            id = student.get('student_id')
            if @student_id == id
                current_idx = idx
                return false
        return current_idx

    get_listing_files: ->
        if not @listing?
            return {listing:undefined}

        # TODO this is stupid, file listings should be immutable.js
        listing_js = @listing.get('files')?.toJS() ? []
        COMPUTE_FILE_MASKS(listing_js)
        files      = immutable.fromJS(listing_js)
        if not @show_all_files
            files  = files.filterNot(course_specific_files)
        else
            files = files.withMutations (files) ->
                files.map (entry, idx) ->
                    filename = entry.get('name')
                    if is_course_specific_file(filename)
                        files.setIn([idx, 'mask'], true)
                    return null

        num_pages  = Math.max(1, ((files?.size ? 0) // PAGE_SIZE))

        data =
            listing_files : files
            num_pages     : num_pages
        if (@page_number ? 0) > num_pages
            data.page_number = 0
        return data
