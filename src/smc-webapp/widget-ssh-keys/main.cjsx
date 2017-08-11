# 3rd Party Libraries
{Alert, Button, ButtonToolbar, Col, FormControl, FormGroup, ListGroup, ListGroupItem, Panel, Row, Well} = require('react-bootstrap')
immutable = require('immutable')

# Internal & React Libraries
misc = require('smc-util/misc')
{defaults, types, required} = misc
{React, ReactDOM, rclass, rtypes} = require('../smc-react')
{Icon, TimeAgo} = require('../r_misc')
{User} = require('../users')

# Sibling Libraries
{compute_fingerprint} = require('./fingerprint')

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

exports.SSHKeyAdder = rclass
    displayName: 'SSH-Key-Adder'

    propTypes:
        add_ssh_key  : rtypes.func     # See arg signature at end of @submit_form
        account_id   : rtypes.string
        toggleable   : rtypes.bool     # If it should be a button

    getInitialState: ->
        key_title  : ""
        key_value  : ""
        show_panel : false

    cancel_and_close: ->
        @setState
            key_title  : ""
            key_value  : ""
            show_panel : false

    trigger_error: (err) ->
        @setState(error : err)

    clear_error: ->
        @setState(error : undefined)

    submit_form: ->
        validated_key = validate_key(normalize_key(@state.key_value))
        if validated_key.error?
            @trigger_error(validated_key.error)
            return

        if @state.key_title
            title = @state.key_title
        else
            title = validated_key.source

        value = validated_key.value

        @props.add_ssh_key
            title         : title
            value         : value
            fingerprint   : compute_fingerprint(validated_key.pubkey)
            creation_date : Date.now()
            creator_id    : @props.account_id

        @cancel_and_close() if @props.toggleable

    render_panel: ->
        <Panel header={<h2> <Icon name='plus-circle' /> Add an SSH Key</h2>} style={@props.style}>
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
            <div>
                <ButtonToolbar>
                    <Button
                        bsStyle  = 'success'
                        onClick  = {@submit_form}
                        disabled = {@state.key_value.length < 10}
                    >
                        Add SSH Key
                    </Button>
                    {<Button onClick={@cancel_and_close}>
                        Cancel
                    </Button> if @props.toggleable }
                </ButtonToolbar>
                {<AddKeyError style={marginTop:'10px'} mesg={@state.error}/> if @state.error?}
            </div>
        </Panel>

    render_open_button: ->
        <Button bsStyle='success' onClick={=>@setState(show_panel : true)} style={@props.style}>
            <Icon name='terminal' /> Add an SSH Key...
        </Button>

    render: ->
        if not @props.toggleable or @state.show_panel
            @render_panel()
        else
            @render_open_button()

AddKeyError = ({mesg, style}) ->
    <Alert style={style} bsStyle='danger'>
        {mesg}
    </Alert>


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

OneSSHKey = rclass
    displayName: 'SSH-Key'

    propTypes:
        ssh_key  : rtypes.immutable.Map.isRequired
        user_map : rtypes.immutable.Map
        delete   : rtypes.func

    getInitialState: ->
        show_delete_conf : false

    render_creator: ->
        <div>
            Created by <User account_id={@props.ssh_key.get('creator_id')} user_map={@props.user_map} />
        </div>

    render_last_use: ->
        <div>
            Last used about <TimeAgo date={new Date(@props.ssh_key.get('last_use_date'))} />
        </div>

    render: ->
        <ListGroupItem>
            <Row>
                <Col md=9>
                    <div style={fontWeight:600}>{@props.ssh_key.get('title')}</div>
                    <span style={fontWeight:600}>Fingerprint: </span><code>{@props.ssh_key.get('fingerprint')}</code><br/>
                    Added on {new Date(@props.ssh_key.get('last_use_date')).toLocaleDateString()}
                    {@render_creator() if @props.ssh_key.get('creator_id')}
                    {@render_last_use() if @props.ssh_key.get('last_use_date')}
                </Col>
                <Col md=3>
                    <Button
                        bsStyle  = 'warning'
                        bsSize   = 'small'
                        onClick  = {=>@setState(show_delete_conf : true)}
                        disabled = {@state.show_delete_conf}
                        style    = {float:'right'}
                    >
                        Delete...
                    </Button>
                </Col>
            </Row>
            {<DeleteConfirmation
                confirm = {()=>@props.delete(@props.ssh_key.get('fingerprint'))}
                cancel  = {=>@setState(show_delete_conf : false)}
            /> if @state.show_delete_conf}
        </ListGroupItem>

# Children are rendered above the list of SSH Keys
exports.SSHKeyList = rclass
    displayName: 'SSH-Key-List'

    propTypes:
        user_map   : rtypes.immutable.Map
        ssh_keys   : rtypes.immutable.Map
        delete_key : rtypes.func

    render: ->
        <Panel header={<h2> <Icon name='list-ul' /> SSH Keys</h2>}>
            {@props.children}
            <Panel style={marginBottom:'0px'} >
                <ListGroup fill={true}>
                    {(<OneSSHKey ssh_key={ssh_key} delete={@props.delete_key} key={ssh_key.get('fingerprint')} user_map={@props.user_map}/> for ssh_key in @props.ssh_keys.toArray())}
                </ListGroup>
            </Panel>
        </Panel>