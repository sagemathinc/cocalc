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
(c) William Stein, 2014

Synchronized document-oriented database -- browser client.

###


syncdoc              = require('./syncdoc')
misc                 = require('smc-util/misc')
{SynchronizedDB}     = require('smc-util/syncdb')
{defaults, required} = misc

to_json = (s) ->
    try
        return misc.to_json(s)
    catch e
        console.log("UNABLE to convert this object to json", s)
        throw e

exports.synchronized_db = (opts) ->
    opts = defaults opts,
        project_id : required
        filename   : required
        max_len    : undefined
        sync_interval : 200
        cb         : required

    syncdoc.synchronized_string
        project_id    : opts.project_id
        filename      : opts.filename
        sync_interval : opts.sync_interval
        cb            : (err, doc) =>
            if err
                opts.cb(err)
            else
                opts.cb(undefined, new SynchronizedDB(doc, to_json, undefined, opts.max_len))
    return