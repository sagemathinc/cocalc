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


############################################
# connection to Salvus hub
############################################

if window.location.hash.length > 1
    window.salvus_target = decodeURIComponent(window.location.hash.slice(1))

if not window.smc_base_url?
    window.smc_base_url = ""

exports.salvus_client = client = window.smc.client

connection_protocol = ''
exports.protocol = () ->
    if connection_protocol
        return connection_protocol
    else
        return "not connected"

last_ping_time = ''
exports.ping_time = () -> last_ping_time

client.on "connecting", () ->
    $(".salvus-connection-status-connected").hide()
    $(".salvus-connection-status-connecting").show()
    $(".salvus-fullscreen-activate").hide()
    $(".salvus-connection-status-ping-time").html('')
    connection_protocol = ''
    last_ping_time = ''
    $("a[href=#salvus-connection-reconnect]").find("i").addClass('fa-spin')

client.on "connected", () ->
    $(".salvus-connection-status-connecting").hide()
    $(".salvus-connection-status-connected").show()
    if not client.in_fullscreen_mode()
        $(".salvus-fullscreen-activate").show()
    $("a[href=#salvus-connection-reconnect]").find("i").removeClass('fa-spin')

client.on "ping", (ping_time) ->
    last_ping_time = ping_time
    $(".salvus-connection-status-ping-time").html("#{ping_time}ms")
