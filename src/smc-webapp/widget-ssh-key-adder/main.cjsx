# 3rd Party Libraries
{Button, FormControl, FormGroup, Panel} = require('react-bootstrap')

# Internal & React Libraries
misc = require('smc-util/misc')
{React, ReactDOM, rclass, rtypes} = require('../smc-react')

submit_key = ->
    console.log "Do nothing yet! This will be an action soon."

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
        <Panel>
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