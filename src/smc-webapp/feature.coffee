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

if navigator?
    # Check for cookies (see http://stackoverflow.com/questions/6125330/javascript-navigator-cookieenabled-browser-compatibility)
    if not navigator.cookieEnabled
        require('./smc-react').redux.getActions('page').show_cookie_warning()

    # Check for local storage
    if not require('smc-util/misc').has_local_storage()
        require('./smc-react').redux.getActions('page').show_local_storage_warning()

####################################################
#
# Client device features and capabilities.
#
####################################################

$ = window.$

isMobile = exports.isMobile =
    Android: () -> !! navigator?.userAgent.match(/Android/i)
    BlackBerry: () -> !! navigator?.userAgent.match(/BlackBerry/i)
    iOS: () -> !! navigator?.userAgent.match(/iPhone|iPad|iPod/i)
    Windows: () -> !! navigator?.userAgent.match(/IEMobile/i)
    tablet: () -> !! navigator?.userAgent.match(/iPad/i) or !! navigator.userAgent.match(/Tablet/i)
    any: () -> (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Windows())

if not $?
    # don't even have jQuery -- obviously won't have any features -- this happens, e.g., in node.js
    exports.IS_MOBILE = false

if not $.browser?
    $.browser = {}

user_agent = navigator?.userAgent.toLowerCase()

$.browser.chrome = /chrom(e|ium)/.test(user_agent)

exports.IS_MOBILE = exports.isMobile.any()

# DEBUG
# exports.IS_MOBILE = true

if $.browser.chrome
    $(".salvus-chrome-only").show()

$.browser.opera   = (!!window.opr && !!opr.addons) || !!window.opera || navigator?.userAgent.indexOf(' OPR/') >= 0
$.browser.firefox = not $.browser.chrome and user_agent.indexOf('firefox') > 0
$.browser.safari  = not $.browser.chrome and user_agent.indexOf('safari') > 0
$.browser.ie      = not $.browser.chrome and user_agent.indexOf('windows') > 0
$.browser.blink   = ($.browser.chrome || $.browser.opera) && !!window.CSS
$.browser.edge    = /Edge\/\d./i.test(navigator.userAgent)

exports.get_browser = () ->
    for k, v of $.browser
        if v
            return k
    return null

exports.get_mobile = () ->
    for k, v of exports.isMobile
        if v()
            return k
    return null


# returns true if the page is currently displayed in responsive mode (the window is less than 768px)
# Use this because CSS and JS display different widths due to scrollbar
exports.is_responsive_mode = () ->
    return $(".salvus-responsive-mode-test").width() < 768

# DEBUG is injected by webpack and its value is true if the '--debug' cmd line parameter is set.
# You can use DEBUG anywhere in the webapp code!
if DEBUG
    console.log "DEBUG MODE:", DEBUG
