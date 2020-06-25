#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{isMobile} = require('./feature')

{React, ReactDOM, rclass, redux, rtypes, Redux, redux_fields} = require('./app-framework')

{Button, Navbar, Nav, NavItem} = require('react-bootstrap')
{ErrorBoundary, Loading, Space, Tip, Icon}   = require('./r_misc')
{COLORS} = require('smc-util/theme')
misc_page = require('./misc_page')

# CoCalc Pages
# SMELL: Page UI's are mixed with their store/state.
# So we have to require them even though they aren't used
{ProjectPage}  = require('./project_page')
{FileUsePage}  = require('./file-use/page')
{Support}      = require('./support')
{ Avatar }     = require("./account/avatar/avatar");

# CoCalc Libraries
misc = require('smc-util/misc')

{ProjectsNav} = require('./projects_nav')
{ActiveContent} = require('./app/active-content')
{NavTab} = require('./app/nav-tab');
{ConnectionIndicator} = require('./app/connection-indicator')
{ConnectionInfo} = require('./app/connection-info')
{NotificationBell} = require('./app/notification-bell')

{VersionWarning, CookieWarning, LocalStorageWarning} = require("./app/warnings")
{FullscreenButton} = require('./app/fullscreen-button')
{AppLogo} = require('./app/logo')

nav_class = 'hidden-xs'

HIDE_LABEL_THOLD = 6

NAV_HEIGHT = 36


{Page} = require('./app/desktop/page')

page =
    <Redux redux={redux}>
        <ErrorBoundary>
            <Page redux={redux}/>
        </ErrorBoundary>
    </Redux>

exports.render = () => ReactDOM.render(page, document.getElementById('smc-react-container'))