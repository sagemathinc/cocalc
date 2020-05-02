#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# global libs
_         = require('underscore')
immutable = require('immutable')
# react elements
{Col, Row, Panel, Button, FormGroup, Checkbox, FormControl, Well, Alert, Modal, Table, Nav, NavItem, ListGroup, ListGroupItem, InputGroup} = require('react-bootstrap')
{React, ReactDOM, redux, Redux, Actions, Store, rtypes, rclass} = require('../app-framework')
{Loading, Icon, Markdown, Space} = require('../r_misc')
# cocalc libs
{defaults, required, optional} = misc = require('smc-util/misc')
# Snippets
{REPO_URL} = require('./common')


exports.ExamplesFooter = rclass
    displayName : 'ExamplesFooter'

    propTypes:
        actions             : rtypes.object
        submittable         : rtypes.bool
        setup_code          : rtypes.string
        prepend_setup_code  : rtypes.bool

    shouldComponentUpdate: (props, state) ->
        ret = misc.is_different(@props, props, ['submittable', 'setup_code', 'prepend_setup_code'])
        return ret

    handle_prepend_setup_code: (value) ->
        @props.actions.set(prepend_setup_code:value)

    insert_code: ->
        @props.actions.insert(false)
        @close()

    insert_all: ->
        @props.actions.insert(true)
        @close()

    close: ->
        @props.actions.hide()

    render: ->
        <Modal.Footer>
            <Button
                className  = {'contrib-link'}
                href       = {REPO_URL}
                target     = {'_blank'}
                rel        = {"noopener"}
            >
                <Icon name = {'code-fork'} /> Contribute
            </Button>
            <Button
                onClick    = {@close}
                className  = {'pull-right'}
            >
                Close
            </Button>
            <Button
                onClick    = {@insert_code}
                disabled   = {not @props.submittable}
                bsStyle    = {'success'}
                className  = {'pull-right'}
            >
                Only Code
            </Button>
            <Button
                onClick   = {@insert_all}
                disabled  = {not @props.submittable}
                bsStyle   = {'success'}
                className = {'pull-right'}
                style     = {fontWeight:'bold'}
            >
                Insert Example
            </Button>
            {
                if @props.setup_code?.length > 0
                    <Checkbox
                        className = {'pull-right'}
                        style     = {margin: '10px', display: 'inline'}
                        checked   = {@props.prepend_setup_code}
                        onChange  = {(e)=>@handle_prepend_setup_code(e.target.checked)}
                    >
                        Setup code
                    </Checkbox>
            }
        </Modal.Footer>