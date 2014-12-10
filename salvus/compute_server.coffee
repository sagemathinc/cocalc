###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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


######################################################################
#
# compute_server
#
#    -- launches and monitors all relevant services on the compute nodes
#       on ports 6000, 6001, etc.
#    -- listens on port 5999 and can provide
#       overall status/health info on this node
#    -- ensures permissions are restricted appropriately
#    -- properly stops all spawned servers when this process is stopped
#
# For local debugging, run this way, since it gives better stack traces.
#
#         make_coffee && echo "require('compute_server').start_server()" | coffee
#
#######################################################################


child_process  = require 'child_process'
winston        = require 'winston'
program        = require 'commander'
daemon         = require 'start-stop-daemon'
net            = require 'net'

message        = require 'message'
misc_node      = require 'misc_node'
misc           = require 'misc'

status_message = () ->
    message.compute_server_status(running_servers:'todo')

server = net.createServer (socket) ->
    misc_node.enable_mesg(socket)
    socket.on 'mesg', (type, mesg) ->
        switch mesg.event
            when 'compute_server_status'
                socket.write(status_message())
            else
                socket.write(message.error(error:"Unknown message event '#{mesg.event}'"))

PATH = require('path').resolve(__dirname + '/../..')
restrict_permissions = () ->
    # Just in case we mess up in preparing the VM, it's good to ensure our source code doesn't leak.
    child_process.spawn('chmod', ['-R', 'og-rwx', "#{PATH}"])


###########################################################################################################
# All code for starting and stopping specific compute services is in this section.
# When adding a new compute service, it would be included here.

sage_server = undefined
start_sage_server = () ->
    sage_server = child_process.spawn('sage', ['--python', 'sage_server.py', '--host', program.host], {detached:true})

stop_sage_server = () ->
    if sage_server?
        process.kill(-sage_server, 'SIGKILL')
        sage_server = undefined

start_console_server = () ->
    child_process.spawn('console_server', ['start', '--host', program.host])

stop_console_server = () ->
    child_process.spawn('console_server', ['stop'])

start_project_server = () ->
    child_process.spawn('project_server', ['start', '--host', program.host])

stop_project_server = () ->
    child_process.spawn('project_server', ['stop'])

start_servers = () ->
    start_console_server()       # 6001
    start_project_server()       # 6002

stop_servers = () ->
    stop_sage_server()
    stop_console_server()
    stop_project_server()

# end compute services section
###########################################################################################################
#

# Start listening for connections on the socket.
exports.start_server = start_server = () ->
    server.listen program.port, program.host, () -> winston.info "listening on port #{program.port}"
    restrict_permissions()
    start_sage_server()

program.usage('[start/stop/restart/status] [options]')
    .option('-p, --port <n>', 'port to listen on (default: 5999)', parseInt, 5999)
    .option('--pidfile [string]', 'store pid in this file (default: "data/pids/compute_server.pid")', String, "data/pids/compute_server.pid")
    .option('--logfile [string]', 'write log to this file (default: "data/logs/compute_server.log")', String, "data/logs/compute_server.log")
    .option('--host [string]', 'bind to only this host (default: "127.0.0.1")', String, "127.0.0.1")   # important for security reasons to prevent user binding more specific host attack
    .parse(process.argv)

if program._name == 'compute_server.js'
    process.addListener "uncaughtException", (err) ->
        winston.error "Uncaught exception: " + err
        if console? and console.trace?
            console.trace()

    # we start/stop/status before daemonizing, because after becoming a daemon the PATH, PWD, etc., are lost.
    if 'stop' in program.args or 'restart' in program.args
        stop_servers()

    if 'start' in program.args or 'restart' in program.args
        start_servers()

    daemon({pidFile:program.pidfile, outFile:program.logfile, errFile:program.logfile}, start_server)




