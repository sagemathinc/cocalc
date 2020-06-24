#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

{React, ReactDOM, rclass, redux, rtypes, Redux, Actions, Store} = require('./app-framework')
{Button, Col, Row, Modal, NavItem} = require('react-bootstrap')
{Icon, Space, Tip} = require('./r_misc')
{COLORS} = require('smc-util/theme')
{webapp_client} = require('./webapp_client')
misc = require('smc-util/misc')

{InfoPage} = require('./info/info')
{ProjectsPage} = require('./projects/projects-page')
{ProjectPage, MobileProjectPage} = require('./project_page')
{AccountPage} = require('./account/account-page')
{FileUsePage} = require('./file-use/page')
{NotificationPage} = require('./notifications')
{AdminPage} = require('./admin')
{show_announce_end} = require('./account')
{user_tracking} = require('./user-tracking')
{KioskModeBanner} = require('./app/kiosk-mode-banner')
{Connecting} = require('./landing-page/connecting')

ACTIVE_BG_COLOR = COLORS.TOP_BAR.ACTIVE
feature = require('./feature')

exports.ActiveAppContent = ({active_top_tab, render_small, open_projects, kiosk_mode}) ->
    v = []
    if open_projects?
        open_projects.forEach (project_id) ->
            is_active = project_id == active_top_tab
            project_name = redux.getProjectStore(project_id).name
            if render_small
                x = <MobileProjectPage name={project_name} project_id={project_id} is_active={is_active} />
            else
                x = <ProjectPage name={project_name} project_id={project_id} is_active={is_active} />
            cls = 'smc-vfill'
            if project_id != active_top_tab
                cls += ' hide'
            v.push(<div key={project_id} className={cls}>{x}</div>)
    else  # open_projects not used (e.g., on mobile).
        if active_top_tab?.length == 36
            project_id = active_top_tab
            project_name = redux.getProjectStore(project_id).name
            if render_small
                x = <MobileProjectPage key={project_id} name={project_name} project_id={project_id} is_active={true} />
            else
                x = <ProjectPage key={project_id} name={project_name} project_id={project_id} is_active={true} />
            v.push(x)

    # in kiosk mode: if no file is opened show a banner
    if kiosk_mode and v.length == 0
        v.push <KioskModeBanner key={'kiosk'} />
    else
        switch active_top_tab
            when 'projects'
                v.push <ProjectsPage key={'projects'}/>
            when 'account'
                v.push <AccountPage key={'account'}/>
            when 'help', 'about'
                v.push <InfoPage key={'about'}/>
            when 'file-use'
                v.push <FileUsePage redux={redux} key={'file-use'}/>
            when 'notifications'
                v.push <NotificationPage key={'notifications'} />
            when 'admin'
                v.push <AdminPage redux={redux} key={'admin'}/>
            when undefined
                v.push <div key={'broken'}>Please click a button on the top tab.</div>

    if v.length == 0
        # this happens upon loading a URL for a project, but the project isn't open yet.
        # implicitly, this waits for a websocket connection, hence show the same banner as for the landing page
        v.push <Connecting key={'connecting'} />
    return v


