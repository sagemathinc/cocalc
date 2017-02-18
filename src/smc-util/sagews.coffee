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

###
Some functions for working with Sage worksheets (sagews files) --
###

#---------------------------------------------------------------------------------------------------------
# Support for using synchronized docs to represent Sage Worksheets (i.e., live compute documents)
#---------------------------------------------------------------------------------------------------------

# WARNING: in Codemirror, to avoid issues with parsing I also set the output marker to be a comment character
# by modifying the python mode as follows:     if (ch == "#"  || ch == "\uFE21") {

exports.MARKERS =
    cell   : "\uFE20"
    output : "\uFE21"

exports.FLAGS = FLAGS =
    execute      : "x"   # request that cell be executed
    waiting      : "w"   # request to execute received, but still not running (because of another cell running)
    running      : "r"   # cell currently running
    interrupt    : "c"   # request execution of cell be interrupted
    this_session : "s"   # if set, cell was executed during the current sage session.
    hide_input   : "i"   # hide input part of cell
    hide_output  : "o"   # hide output part of cell

exports.ACTION_FLAGS = [FLAGS.execute, FLAGS.running, FLAGS.waiting, FLAGS.interrupt]
exports.ACTION_SESSION_FLAGS = [FLAGS.execute, FLAGS.running, FLAGS.waiting, FLAGS.interrupt, FLAGS.this_session]

# Return a list of the uuids of files that are displayed in the given document,
# where doc is the string representation of a worksheet.
# At present, this function finds all output messages of the form
#   {"file":{"uuid":"806f4f54-96c8-47f0-9af3-74b5d48d0a70",...}}
# but it could do more at some point in the future.

exports.uuids_of_linked_files = (doc) ->
    uuids = []
    i = 0
    while true
        i = doc.indexOf(exports.MARKERS.output, i)
        if i == -1
            return uuids
        j = doc.indexOf('\n', i)
        if j == -1
            j = doc.length
        line = doc.slice(i, j)
        for m in line.split(exports.MARKERS.output).slice(1)
            # Only bother to run the possibly slow JSON.parse on file messages; since
            # this function would block the global hub server, this is important.
            if m.slice(0,8) == '{"file":'
                mesg = JSON.parse(m)
                uuid = mesg.file?.uuid
                if uuid?
                    uuids.push(uuid)
        i = j


class SageWS
    constructor: (@content) ->

    find_cell_meta: (id, start) =>
        i = @content.indexOf(exports.MARKERS.cell + id, start)
        j = @content.indexOf(exports.MARKERS.cell, i+1)
        if j == -1
            return undefined
        return {start:i, end:j}

    get_cell_flagstring: (id) =>
        pos = @find_cell_meta(id)
        if pos?
            return @content.slice(pos.start+37, pos.end)

    set_cell_flagstring: (id, flags) =>
        pos = @find_cell_meta(id)
        if pos?
            @content = @content.slice(0, pos.start+37) + flags + @content.slice(pos.end)

    remove_cell_flag: (id, flag) =>
        s = @get_cell_flagstring(id)
        if s? and flag in s
            @content = @set_cell_flagstring(id, s.replace(new RegExp(flag, "g"), ""))

    set_cell_flag: (id, flag) =>
        s = @get_cell_flagstring(id)
        if s? and flag not in s
            @content = @set_cell_flagstring(id, s + flag)

exports.sagews = (content) ->
    return new SageWS(content)