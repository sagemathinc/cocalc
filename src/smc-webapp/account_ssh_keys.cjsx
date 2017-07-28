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
        account_id : rtypes.string.isRequired
        user_map   : rtypes.immutable.Map
        ssh_keys   : rtypes.immutable.List

    render: ->
        <div style={marginTop:'1em'}>
            <Row>
                <Col md=8>
                    {#TODO: Pass down the ssh_keys}
                    <SSHKeyList ssh_keys={undefined} user_map={@props.user_map}/>
                </Col>
                <Col md=4>
                    <SSHKeyAdder account_id={@props.account_id} submit_key={()=>console.log "do nothing...."} style={marginBottom:'0px'}/>
                    Check out <a href="https://git-scm.com/book/en/v2/Git-on-the-Server-Generating-Your-SSH-Public-Key">this</a> guide on generating SSH keys.
                </Col>
            </Row>
        </div>