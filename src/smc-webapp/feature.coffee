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

if not $?
    # don't even have jQuery -- obviously won't have any features -- this happens, e.g., in node.js
    exports.IS_MOBILE = false

if not $.browser?
    $.browser = {}

user_agent = navigator.userAgent.toLowerCase()

$.browser.chrome = /chrom(e|ium)/.test(user_agent)

exports.IS_MOBILE = exports.isMobile.any()

if $.browser.chrome
    $(".salvus-chrome-only").show()

$.browser.opera   = (!!window.opr && !!opr.addons) || !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0
$.browser.firefox = not $.browser.chrome and user_agent.indexOf('firefox') > 0
$.browser.safari  = not $.browser.chrome and user_agent.indexOf('safari') > 0
$.browser.ie      = not $.browser.chrome and user_agent.indexOf('windows') > 0
$.browser.blink   = ($.browser.chrome || $.browser.opera) && !!window.CSS

exports.get_browser = () ->
    for k, v of $.browser
        if v
            return k
    return null

# Check for cookies (see http://stackoverflow.com/questions/6125330/javascript-navigator-cookieenabled-browser-compatibility)
if not navigator.cookieEnabled
    $(".smc-cookie-warning").show()


# returns true if the page is currently displayed in responsive mode (the window is less than 768px)
# Use this because CSS and JS display different widths due to scrollbar
exports.is_responsive_mode = () ->
    return $(".salvus-responsive-mode-test").width() < 768

