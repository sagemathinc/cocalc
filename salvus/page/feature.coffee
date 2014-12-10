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


####################################################
#
# Client device features and capabilities.
#
####################################################

#if not window.WebSocket?  # websocket support -- mark of a modern browser.
#    $(".salvus_client_browser_warning").draggable().find(".fa-times").click () ->
#        $(".salvus_client_browser_warning").hide()
#    $(".salvus_client_browser_warning").show()

isMobile = exports.isMobile =
    Android    : () -> !! navigator.userAgent.match(/Android/i)
    BlackBerry : () -> !! navigator.userAgent.match(/BlackBerry/i)
    iOS        : () -> !! navigator.userAgent.match(/iPhone|iPad|iPod/i)
    Windows    : () -> !! navigator.userAgent.match(/IEMobile/i)
    any        : () -> (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Windows())

if not $.browser?
    $.browser = {}

$.browser.chrome = /chrom(e|ium)/.test(navigator.userAgent.toLowerCase());

exports.IS_MOBILE = exports.isMobile.any()

if $.browser.chrome
    $(".salvus-chrome-only").show()

$.browser.firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > 0