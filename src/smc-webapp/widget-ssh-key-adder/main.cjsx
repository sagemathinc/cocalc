# 3rd Party Libraries
{Button, FormControl, FormGroup, Panel, Row, Well} = require('react-bootstrap')
immutable = require('immutable')

# Internal & React Libraries
misc = require('smc-util/misc')
{React, ReactDOM, rclass, rtypes} = require('../smc-react')

submit_key = ->
    console.log "Do nothing yet! This will be an action soon."
###
ssh_key_description =
    name          : rtypes.string
    value         : rtypes.string
    fingerprint   : rtypes.string
    creation_date : rtypes.Date
    last_use_date : rtypes.Date
###
exports.SSHKeyAdder = rclass
    displayName: 'SSH-Key-Adder'

    propTypes:
        onSubmit : rtypes.func

    getInitialState: ->
        key_title : ""
        key_value : ""

    submit_form: ->
        submit_key(@state.key_title, @state.key_value)
        @props.onSubmit?(@state.key_title, @state.key_value)

    render: ->
        <Panel style={@props.style}>
            {# TODO: Make a style mapper to the components if necessary}
            <form>
                <FormGroup>
                    Title
                    <FormControl
                        id    = "ssh-title"
                        type  = "text"
                        value = {@state.key_title}
                        onChange = {(e) => @setState(key_title : e.target.value)}
                     />
                </FormGroup>

                <FormGroup>
                    Key
                    <FormControl
                        componentClass = "textarea"
                        value          = {@state.key_value}
                        rows           = {8}
                        placeholder    = "Begins with 'ssh-rsa', 'ssh-dss', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', or 'ecdsa-sha2-nistp521'"
                        onChange       = {(e) => @setState(key_value : e.target.value)}
                        style          = {resize : "vertical"}
                    />
                </FormGroup>
            </form>
            <Button
                bsStyle = 'success'
                onClick = {@submit_form}
            >
                Add SSH Key
            </Button>
        </Panel>

OneSSHKey = rclass
    displayName: 'SSH-Key'

    propTypes:
        ssh_key : rtypes.immutable.Map.isRequired
        style   : rtypes.object

    render: ->
        <Well style={@props.style}>
            <Row>
                {@props.ssh_key.get('name')}
            </Row>
            <Row>
                {@props.ssh_key.get('value')}
            </Row>
            <Button bsStyle='danger'>
                Delete
            </Button>
        </Well>

exports.SSHKeyList = rclass
    displayName: 'SSH-Key-List'

    propTypes:
        ssh_keys : rtypes.immutable.List

    getDefaultProps: ->
        placeholder1 = immutable.Map
            value : "ssh-rsa blah blah blah"
            name  : "fake 1"

        placeholder2 = immutable.Map
            value : "ssh-rsa Blah Blah Blah"
            name  : "fake 2"

        return ssh_keys : immutable.List([placeholder1, placeholder2])

    render: ->
        <Panel>
            {(<OneSSHKey ssh_key={ssh_key} key={ssh_key.get('value')} /> for ssh_key in @props.ssh_keys.toArray())}
        </Panel>