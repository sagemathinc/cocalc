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
Compute related schema stuff (see compute.coffee)

Here's a picture of the finite state machine defined below:

   ----------[closing] ------- --------- [stopping] <--------
  \|/                        \|/                           |
[closed] --> [opening] --> [opened] --> [starting] --> [running]
                             /|\                          /|\
                              |                            |
                             \|/                          \|/
                           [saving]                     [saving]

The icon names below refer to font-awesome, and are used in the UI.

###

exports.COMPUTE_STATES =
    closed:
        desc     : 'None of the files, users, etc. for this project are on the compute server.'
        icon     : 'stop'     # font awesome icon
        display  : 'Offline'  # displayed name for users
        stable   : true
        to       :
            open : 'opening'
        commands : ['open', 'move', 'status', 'destroy', 'mintime']

    opened:
        desc     : 'All files and snapshots are ready to use and the project user has been created, but the project is not running.'
        icon     : 'stop'
        display  : 'Stopped'
        stable   : true
        to       :
            start : 'starting'
            close : 'closing'
            save  : 'saving'
        commands : ['start', 'close', 'save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    running:
        desc     : 'The project is opened, running, and ready to be used.'
        icon     : 'edit'
        display  : 'Running'
        stable   : true
        to       :
            stop : 'stopping'
            save : 'saving'
        commands : ['stop', 'save', 'address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    saving:
        desc     : 'The project is being copied to a central file server for longterm storage.'
        icon     : 'save'
        display  : 'Saving to server'
        to       : {}
        timeout  : 30*60
        commands : ['address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    closing:
        desc     : 'The project is in the process of being closed, so the latest changes are being saved to the server and all processes are being killed.'
        icon     : 'close'
        display  : 'Closing'
        to       : {}
        timeout  : 5*60
        commands : ['status', 'mintime']

    opening:
        desc     : 'The project is being opened, so all files and snapshots are being downloaded, the user is being created, etc. This could take up to 10 minutes depending on the size of your project.'
        icon     : 'gears'
        display  : 'Opening'
        to       : {}
        timeout  : 30*60
        commands : ['status', 'mintime']

    starting:
        desc     : 'The project is starting up and getting ready to be used.'
        icon     : 'flash'
        display  : 'Starting'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    stopping:
        desc     : 'All processes associated to the project are being killed.'
        icon     : 'hand-stop-o'
        display  : 'Stopping'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']
