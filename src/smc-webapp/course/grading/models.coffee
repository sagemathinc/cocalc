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
    student_id      : null
    progress        : 0
    assignment_id   : null
    listing         : null
    end_of_list     : null
    subdir          : ''
    student_filter  : null
    only_not_graded : true
    only_collected  : true
    page_number     : 0
    listing         : null
    show_all_files  : false
    cursors         : null,
    'Grading'

exports.Grading = class Grading extends GradingRecord
    setListing: (listing) ->
        return @set('listing', listing)

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
