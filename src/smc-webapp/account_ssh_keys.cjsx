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
        ssh_keys   : rtypes.immutable.Map

    render_pre_list_message: ->
        <div>
            This is your list of account access SSH keys. Remove keys you do not recognize.
        </div>

    render: ->
        <div style={marginTop:'1em'}>
            <Row>
                <Col md=8>
                    <SSHKeyList
                        ssh_keys   = {@props.ssh_keys}
                        user_map   = {@props.user_map}
                        pre_list   = {@render_pre_list_message()}
                        delete_key = {@actions('account').delete_ssh_key} />
                </Col>
                <Col md=4>
                    <SSHKeyAdder
                        account_id  = {@props.account_id}
                        add_ssh_key = {@actions('account').add_ssh_key}
                        style       = {marginBottom:'0px'}
                        />
                    <div style={marginTop:'10px'}>
                        <a href="https://github.com/sagemathinc/cocalc/wiki/AllAboutProjects#create-ssh-key" target="_blank">How to create SSH Keys...</a>
                    </div>
                </Col>
            </Row>
        </div>