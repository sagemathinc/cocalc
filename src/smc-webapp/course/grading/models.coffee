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

# grading specific
{PAGE_SIZE} = require('./const')

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
    student_id      : null      # the currently student
    assignment_id   : null      # the UUID string
    end_of_list     : false     # true, if at the end of student list
    subdir          : ''        # for a collected directory of files, in which (relative) subdirectory are we?
    student_filter  : null      # string, if set the student are filtered by their name
    only_not_graded : true      # by default, we want to only see student who did not recieve a grade yet
    only_collected  : true      # by default, we only want to see students where the assignments are collected
    page_number     : 0         # if there are more files in the listing than "PAGE_SIZE", this tells us the page at which we are
    listing         : null      # an immutable.js map, "files": a sorted and processed list, like they are in project_store (entries have a "mask" field); and "error": e.g. "no_dir"
    show_all_files  : false     # if true, we want to see all files including those which are masked
    cursors         : null,     # information about other collaborators also grading an assignment (i.e. real-time presence information)
    'Grading'

exports.Grading = class Grading extends GradingRecord

    get_listing_files: (show_all_files) ->
        if not @listing?
            return {listing:undefined}

        # TODO this is stupid, file listings should be immutable.js
        listing_js = @listing.get('files')?.toJS() ? []
        {compute_file_masks} = require('../../project_store')
        compute_file_masks(listing_js)
        files      = immutable.fromJS(listing_js)
        if not (show_all_files ? false)
            files  = files.filterNot(course_specific_files)
        else
            files = files.withMutations (files) ->
                files.map (entry, idx) ->
                    filename = entry.get('name')
                    if is_course_specific_file(filename)
                        files.setIn([idx, 'mask'], true)
                    return null

        listing    = @listing.set('files', files)
        num_pages  = Math.max(1, ((files?.size ? 0) // PAGE_SIZE))

        data =
            listing       : listing
            num_pages     : num_pages
        if (@page_number ? 0) > num_pages
            data.page_number = 0
        return data
