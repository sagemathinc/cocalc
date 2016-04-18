{React, rclass, rtypes}  = require('./smc-react')
{Loading, r_join, Space, Footer} = require('./r_misc')
misc = require('smc-util/misc')
{Button, Row, Col, Well, Panel, ProgressBar} = require('react-bootstrap')
{ProjectTitle} = require('./projects')
{HelpEmailLink, SiteName, PolicyPricingPageUrl} = require('./customize')

exports.SupportPage = rclass
    displayName : "SupportPage"

    reduxProps :
        account:
            support_tickets      : rtypes.array
            support_ticket_error : rtypes.string

    render_header : ->
        <Row>
            <Col md=1>ID</Col>
            <Col md=1>Status</Col>
            <Col md=1>Subject</Col>
            <Col md=7>Description</Col>
            <Col md=2></Col>
        </Row>

    open : (id) ->
        window.alert("open #{id}")

    render_list : (tickets) ->

        for i, ticket of tickets
            <Row id={i}>
                <Col md=2>{ticket.id}</Col>
                <Col md=2>{ticket.status}</Col>
                <Col md=2>{ticket.subject}</Col>
                <Col md=6>{ticket.description}</Col>
                <Col md=2><Button onclick={@open(ticket.id)} /></Col>
            </Row>

    render : ->
        if not @props.support_tickets?
            return <Loading />

        <div>
            <Col style={minHeight:"65vh"} md=12>
                {@render_header()}
                {@render_list(@props.support_tickets)}
            </Col>
            <Footer/>
        </div>