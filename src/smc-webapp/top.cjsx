{React, ReactDOM, rclass} = require('./smc-react')

{Alert, Button, ButtonToolbar, ButtonGroup, Input, Row, Col,
    Panel, Popover, Tabs, Tab, Well} = require('react-bootstrap')

{HelpPage} = require('./r_help')

{ProjectsPage} = require('./projects')

{AccountPageRedux} = require('./account_page')

Page = rclass
    displayName : "Page"
    render : ->
        <div>
            <Tabs animation={false}>
                <Tab eventKey={'projects'} title={"Projects"}>
                    <ProjectsPage />
                </Tab>
                <Tab eventKey={'activity'} title={"Activity"}>
                    <Activity />
                </Tab>
                <Tab eventKey={'account'} title={"Account"}>
                    <AccountPageRedux />
                </Tab>
                <Tab eventKey={'about'} title={"About"}>
                    <HelpPage />
                </Tab>
                <Tab eventKey={'support'} title={"Support"}>
                </Tab>
                <Tab eventKey={'network'} title={"Network"}>
                </Tab>
            </Tabs>
       </div>

Activity = rclass
    render : ->
        <div>
            <h1>Activity...</h1>
        </div>

$('body').css('padding-top':0).append('<div class="page-container smc-react-container"></div>')
page = <Page/>
ReactDOM.render(page, $(".smc-react-container")[0])
