###############################################################################
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


###
Compute related schema stuff (see compute.coffee)

Here's a picture of the finite state machine defined below:

   ----------[closing] ------- --------- [stopping] <--------
  \|/                        \|/                           |
[closed] --> [opening] --> [opened] --> [starting] --> [running]
                             /|\                          /|\
                              |                            |
                             \|/                          \|/
                      [saving]  [pending]               [saving]

The icon names below refer to font-awesome, and are used in the UI.

###

exports.COMPUTE_STATES =
    closed:
        desc     : 'Project is in cold storage, and will take longer than normal to start.'
        icon     : 'stop'     # font awesome icon
        display  : 'Offline'  # displayed name for users
        stable   : true
        to       :
            open : 'opening'
        commands : ['open', 'move', 'status', 'destroy', 'mintime']

    opened:
        desc     : 'Project is available and ready to start.'
        icon     : 'stop'
        display  : 'Stopped'
        stable   : true
        to       :
            start : 'starting'
            close : 'closing'
            save  : 'saving'
        commands : ['start', 'close', 'save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    pending:
        desc     : 'Insufficient resources to run your project.  Reduce dedicated RAM or CPU, pay for members only hosting, or contact support.'
        icon     : 'times-rectangle'
        display  : 'Pending'
        stable   : true
        to       :
            stop : 'stopping'
        command : ['stop']

    running:
        desc     : 'Project is running.'
        icon     : 'edit'
        display  : 'Running'
        stable   : true
        to       :
            stop : 'stopping'
            save : 'saving'
        commands : ['stop', 'save', 'address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status', 'migrate_live']

    saving:
        desc     : 'Project is being copied to a central file server for longterm storage.'
        icon     : 'save'
        display  : 'Saving to server'
        to       : {}
        timeout  : 30*60
        commands : ['address', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    closing:
        desc     : 'Project is in the process of being closed.'
        icon     : 'close'
        display  : 'Closing'
        to       : {}
        timeout  : 5*60
        commands : ['status', 'mintime']

    opening:
        desc     : 'Project is being copied from cold storage, which may take several minutes depending on how many files you have.'
        icon     : 'gears'
        display  : 'Opening'
        to       : {}
        timeout  : 30*60
        commands : ['status', 'mintime']

    starting:
        desc     : 'Project is starting up.'
        icon     : 'flash'
        display  : 'Starting'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']

    stopping:
        desc     : 'Project is stopping.'
        icon     : 'hand-stop-o'
        display  : 'Stopping'
        to       :
            save : 'saving'
        timeout  : 60
        commands : ['save', 'copy_path', 'mkdir', 'directory_listing', 'read_file', 'network', 'mintime', 'disk_quota', 'compute_quota', 'status']
