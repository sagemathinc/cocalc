# 3rd Party Libraries
{Alert, Button, ButtonToolbar, Col, FormControl, FormGroup, Panel, Row, Well} = require('react-bootstrap')
immutable = require('immutable')

# Internal & React Libraries
misc = require('smc-util/misc')
{defaults, types, required} = misc
{React, ReactDOM, rclass, rtypes} = require('../smc-react')
{TimeAgo} = require('../r_misc')

# Sibling Libraries
{compute_fingerprint} = require('./fingerprint')

BACK_END_CREATE_SSH_KEY = ->
    console.log "todo"

ALLOWED_SSH_TYPES = ['ssh-rsa', 'ssh-dss', 'ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521']
ALLOWED_SSH_TYPES_DESCRIPTION = ALLOWED_SSH_TYPES[...-1].join(', ') + ", or " + ALLOWED_SSH_TYPES[ALLOWED_SSH_TYPES.length - 1]

# Removes all new lines and trims the output
# Newlines are simply illegal in SSH keys
normalize_key = (value) ->
    return value.trim().split(/[\r\n]+/).join('')

# Splits an SSH key into its parts. Doesn't allow options
# Assumes the key has valid formatting ie.
# <key-type>[space]<public-key>[space]<comment>
parse_key = (value) ->
    parts = value.split(/\s+/)
    type = parts[0]
    pubkey = parts[1]
    source = parts[2]
    comments = parts[3..]

    return {value, type, pubkey, source, comments}

lib_is_valid = (key) ->
    ret = true
    console.log "TODO: lib_is_valid called. Returning #{ret}"
    return ret

validate_key = (value) ->
    key = {value, type, pubkey, source, comments} = parse_key(value)
    if type not in ALLOWED_SSH_TYPES
        key.error = "Type not supported"
    else if not lib_is_valid(value)
        key.error = "Invalid key"
    return key

submit_key = (opts) ->
    console.log "submit_key got:", opts
    types opts,
        title         : types.string.isRequired
        value         : types.string.isRequired
        fingerprint   : types.string.isRequired
        cb            : types.func # cb(err, key)

    BACK_END_CREATE_SSH_KEY
        title         : opts.title
        value         : opts.value
        fingerprint   : opts.fingerprint
        creation_date : Date.now()
        last_use_date : undefined
        creator       : "TODO"
        cb            : opts.cb


exports.SSHKeyAdder = rclass
    displayName: 'SSH-Key-Adder'

    propTypes:
        onSubmit : rtypes.func

    getInitialState: ->
        key_title : ""
        key_value : ""

    trigger_error: (err) ->
        @setState(error : err)
        console.log "Add error to state...", err

    clear_error: ->
        @setState(error : undefined)

    submit_form: ->
        validated_key = validate_key(normalize_key(@state.key_value))
        if validated_key.error?
            @trigger_error(validated_key.error)
        else
            if @state.key_title
                title = @state.key_title
            else
                title = validated_key.source
            value = validated_key.value
            submit_key
                title       : title
                value       : value
                fingerprint : compute_fingerprint(validated_key.pubkey)
                cb          : (err) =>
                    if err
                        @trigger_error(err)
                    else
                        @clear_error()
                        @props.onSubmit?(title, value)


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
                        placeholder    = "Begins with #{ALLOWED_SSH_TYPES_DESCRIPTION}"
                        onChange       = {(e) => @setState(key_value : e.target.value)}
                        style          = {resize : "vertical"}
                    />
                </FormGroup>
            </form>
            <div style={display:"flex"}>
                <Button
                    bsStyle  = 'success'
                    onClick  = {@submit_form}
                    disabled = {@state.key_value.length < 10}
                >
                    Add SSH Key
                </Button>
                {<AddKeyError mesg={@state.error}/> if @state.error?}
            </div>
        </Panel>

AddKeyError = ({mesg}) ->
    <Alert bsStyle='warning'>
        mesg
    </Alert>

OneSSHKey = rclass
    displayName: 'SSH-Key'

    propTypes:
        ssh_key : rtypes.immutable.Map.isRequired
        delete  : rtypes.func
        style   : rtypes.object

    getInitialState: ->
        show_delete_conf : false

    render: ->
        <Well style={@props.style}>
            <Row>
                <Col md=9>
                    <div style={fontWeight:600}>{@props.ssh_key.get('title')}</div>
                    {@props.ssh_key.get('value')}<br/>
                    Added on {new Date(@props.ssh_key.get('last_use_date')).toLocaleDateString()}<br/>
                    Last used about <TimeAgo date={new Date(@props.ssh_key.get('last_use_date'))} />
                </Col>
                <Col md=3>
                    <Button
                        bsStyle  = 'warning'
                        bsSize   = 'small'
                        onClick  = {=>@setState(show_delete_conf : true)}
                        disabled = {@state.show_delete_conf}
                    >
                        Delete...
                    </Button>
                </Col>
            </Row>
            {<DeleteConfirmation
                confirm = {@props.delete}
                cancel  = {=>@setState(show_delete_conf : false)}
            /> if @state.show_delete_conf}
        </Well>

DeleteConfirmation = rclass
    propTypes:
        confirm : rtypes.func
        cancel  : rtypes.func

    render: ->
        <Well style={marginBottom:'0px', textAlign:'center'}>
            Are you sure you want to delete this SSH key?<br/>
            This CANNOT be undone. If you want to reuse this key in the future, you will have to reupload it.
            <ButtonToolbar>
                <Button bsStyle='danger' onClick={@props.confirm}>
                    Yes, delete this key.
                </Button>
                <Button bsStyle='primary' onClick={@props.cancel}>
                    Cancel
                </Button>
            </ButtonToolbar>
        </Well>


exports.SSHKeyList = rclass
    displayName: 'SSH-Key-List'

    propTypes:
        ssh_keys : rtypes.immutable.List

    getDefaultProps: ->
        placeholder1 = immutable.Map
            value         : "ssh-rsa blah blah blah"
            title          : "fake 1"
            fingerprint   : '4c:c8:9f:65:01:3f:0a:6f:63:a2:77:d4:8a:59:8d:92'
            creation_date : '1995-12-17T03:24:00'
            last_use_date : '2012-12-17T03:24:00'

        placeholder2 = immutable.Map
            value         : "ssh-rsa Blah Blah Blah"
            title          : "fake 2"
            fingerprint   : '19:a3:c3:8a:91:19:92:26:97:50:01:bd:f3:1d:36:65'
            creation_date : '2002-12-17T03:24:00'
            last_use_date : '2016-12-17T03:24:00'

        return ssh_keys : immutable.List([placeholder1, placeholder2])

    render: ->
        <Panel>
            {(<OneSSHKey ssh_key={ssh_key} key={ssh_key.get('value')} /> for ssh_key in @props.ssh_keys.toArray())}
        </Panel>