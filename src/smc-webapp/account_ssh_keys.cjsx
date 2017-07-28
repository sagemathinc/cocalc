# 3rd Party Libraries
{Alert, Button, ButtonToolbar, Col, FormControl, FormGroup, Panel, Row, Well} = require('react-bootstrap')
immutable = require('immutable')

# Internal & React Libraries
misc = require('smc-util/misc')
{defaults, types, required} = misc
{React, ReactDOM, rclass, rtypes} = require('./smc-react')
{SSHKeyList, SSHKeyAdder} = require('./widget-ssh-keys/main')

exports.SSHKeysPage = rclass
    propTypes:
        ssh_keys : rtypes.immutable.List

    render: ->
        <div style={marginTop:'1em'}>
            <Row>
                <Col md=8>
                    <SSHKeyList ssh_keys={undefined} />
                </Col>
                <Col md=4>
                    <SSHKeyAdder submit_key={()=>console.log "do nothing...."}/>
                </Col>
            </Row>
        </div>