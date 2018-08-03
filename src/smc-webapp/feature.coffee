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

####################################################
#
# Client device features and capabilities.
#
####################################################

if window?
    # In a web browser.
    $ = window.$

    isMobile = exports.isMobile =
        Android    : -> !! navigator?.userAgent.match(/Android/i)
        BlackBerry : -> !! navigator?.userAgent.match(/BlackBerry/i)
        iOS        : -> !! navigator?.userAgent.match(/iPhone|iPad|iPod/i)
        Windows    : -> !! navigator?.userAgent.match(/IEMobile/i)
        tablet     : -> !! navigator?.userAgent.match(/iPad/i) or !! navigator?.userAgent.match(/Tablet/i)
        any        : -> (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Windows())

    if not $?
        # don't even have jQuery -- obviously won't have any features -- this happens, e.g., in node.js
        exports.IS_MOBILE = false

    if not $.browser?
        $.browser = {}

    user_agent = navigator?.userAgent.toLowerCase() ? ''

    $.browser.chrome = /chrom(e|ium)/.test(user_agent)

    if $.browser.chrome
        $(".webapp-chrome-only").show()

    $.browser.opera   = (!!window.opr && !!opr.addons) || !!window.opera || navigator?.userAgent.indexOf(' OPR/') >= 0
    $.browser.firefox = not $.browser.chrome and user_agent.indexOf('firefox') > 0
    $.browser.safari  = not $.browser.chrome and user_agent.indexOf('safari') > 0
    $.browser.ie      = not $.browser.chrome and user_agent.indexOf('windows') > 0
    $.browser.blink   = ($.browser.chrome || $.browser.opera) && !!window.CSS
    $.browser.edge    = /edge\/\d./i.test(user_agent)

    exports.get_browser = ->
        for k, v of $.browser
            if v
                return k
        return null

    exports.get_mobile = ->
        for k, v of exports.isMobile
            if v()
                return k
        return null


    # returns true if the page is currently displayed in responsive mode (the window is less than 768px)
    # Use this because CSS and JS display different widths due to scrollbar
    exports.is_responsive_mode = ->
        return $(".webapp-responsive-mode-test").width() < 768

    # MOBILE for us means "responsive skinny" and on a mobile device.
    # On iPad, where the screen is wide, we do not enable MOBILE, since that
    # currently disables things like chat completely.
    # See https://github.com/sagemathinc/cocalc/issues/1392
    exports.IS_MOBILE = exports.isMobile.any() and exports.is_responsive_mode()

    # IS_TOUCH for us means multitouch tablet or mobile.
    exports.IS_TOUCH = exports.isMobile.tablet() or exports.IS_MOBILE or exports.isMobile.any()

    exports.IS_IPAD  = navigator?.userAgent.match(/iPad/i)

    # DEBUG
    # exports.IS_MOBILE = true


    # DEBUG is injected by webpack and its value is true if the '--debug' cmd line parameter is set.
    # You can use DEBUG anywhere in the webapp code!
    if DEBUG
        console.log "DEBUG MODE:", DEBUG
    exports.DEBUG = DEBUG

    cookies_and_local_storage = ->
        if not navigator?
            return
        page = require('./app-framework')?.redux?.getActions('page')
        if not page?
            # It's fine to wait until page has loaded and then some before showing a warning
            # to the user.  This is also necessary to ensure the page actions/store have been defined.
            setTimeout(cookies_and_local_storage, 2000)
            return

        # Check for cookies (see http://stackoverflow.com/questions/6125330/javascript-navigator-cookieenabled-browser-compatibility)
        if not navigator.cookieEnabled
            page.show_cookie_warning()

        # Check for local storage
        if not require('smc-util/misc').has_local_storage()
            page.show_local_storage_warning()

    setTimeout(cookies_and_local_storage, 2000)

else
    # Backend.

    # TODO: maybe provide the full api?
    exports.IS_MOBILE = exports.IS_TOUCH = false