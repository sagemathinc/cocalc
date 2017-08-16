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
        <div style={marginTop:'10px', marginBottom:'10px', color:'#444'}>
            SSH keys listed here allow you to connect from your computer via
            SSH to <b><i>all projects</i></b> on which
            you are an owner or collaborator.  Alternatively, set SSH keys that
            grant access only to a project in the settings for that project.
        </div>

    help: ->
        <div>
            To SSH into a project, use the following <span style={color:'#666'}>username@host:</span>
            <pre>[projectIdWithoutDashes]@ssh.sagemath.com </pre>
            Where <code>[projectIdWithoutDashes]</code> looks like 92234d528a1c4e63bde3f2727f5ab8b1.
        </div>

    render: ->
        <div style={marginTop:'1em'}>
            <Row>
                <Col md=8>
                    {@render_pre_list_message()}
                    <SSHKeyList
                        ssh_keys   = {@props.ssh_keys}
                        user_map   = {@props.user_map}
                        pre_list   = {@render_pre_list_message()}
                        delete_key = {@actions('account').delete_ssh_key}
                        help       = {@help()} />
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