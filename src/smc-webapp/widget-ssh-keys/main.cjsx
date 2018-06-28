# 3rd Party Libraries
{Alert, Button, ButtonToolbar, Col, FormControl, FormGroup, ListGroup, ListGroupItem, Panel, Row, Well} = require('react-bootstrap')
immutable = require('immutable')

# Internal & React Libraries
misc = require('smc-util/misc')
{defaults, types, required} = misc
{React, ReactDOM, rclass, rtypes} = require('../app-framework')
{Icon, HelpIcon, Space, TimeAgo} = require('../r_misc')
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

validate_key = (value) ->
    key = {value, type, pubkey, source, comments} = parse_key(value)
    if type not in ALLOWED_SSH_TYPES
        key.error = "Type not supported"
    else
        delete key.error
    # TODO: Use some validation library.
    return key

exports.SSHKeyAdder = rclass
    displayName: 'SSH-Key-Adder'

    propTypes:
        add_ssh_key  : rtypes.func.isRequired  # See arg signature at end of @submit_form
        account_id   : rtypes.string
        toggleable   : rtypes.bool             # If it should be a button

    getInitialState: ->
        key_title  : ""
        key_value  : ""
        show_panel : false

    cancel_and_close: ->
        @setState
            key_title  : ""
            key_value  : ""
            error      : undefined
            show_panel : not @props.toggleable

    trigger_error: (err) ->
        @setState(error : err)

    clear_error: ->
        @setState(error : undefined)

    submit_form: (e) ->
        e?.preventDefault()
        validated_key = validate_key(normalize_key(@state.key_value))
        if validated_key.error?
            @trigger_error(validated_key.error)
            return
        else
            @clear_error()

        if @state.key_title
            title = @state.key_title
        else
            title = validated_key.source

        value = validated_key.value

        @props.add_ssh_key
            title       : title
            value       : value
            fingerprint : compute_fingerprint(validated_key.pubkey)

        @cancel_and_close()

    key_down: (e) ->
        if e.keyCode == 13 # Enter key
            e.preventDefault()
            @submit_form()

    render_panel: ->
        <Panel header={<h2> <Icon name='plus-circle' /> Add an SSH key</h2>} style={@props.style}>
            {### TODO: Make a style mapper to the components if necessary ###}
            <form onSubmit={@submit_form}>
                <FormGroup>
                    Title
                    <FormControl
                        id    = "ssh-title"
                        type  = "text"
                        value = {@state.key_title}
                        onChange = {(e) => @setState(key_title : e.target.value)}
                     />
                    Key
                    <FormControl
                        componentClass = "textarea"
                        value          = {@state.key_value}
                        rows           = {8}
                        placeholder    = "Begins with #{ALLOWED_SSH_TYPES_DESCRIPTION}"
                        onChange       = {(e) => @setState(key_value : e.target.value)}
                        onKeyDown      = {@key_down}
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
            <h3>
            Are you sure you want to delete this SSH key?
            </h3>
            <hr />
            This CANNOT be undone. If you want to reuse this key in the future, you will have to reupload it.
            <hr />
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
        delete   : rtypes.func

    getInitialState: ->
        show_delete_conf : false

    render_last_use: ->
        d = @props.ssh_key.get('last_use_date')
        if d
            <div style={color:'#1e7e34'}>
                Last used <TimeAgo date={new Date(d)} />
            </div>
        else
            <div style={color:'#333'}>
                Never used
            </div>

    render: ->
        key_style = {fontSize:'42px'}
        if @props.ssh_key.get('last_use_date')
            key_style.color = '#1e7e34'
        <ListGroupItem>
            <Row>
                <Col md={1}>
                    <Icon
                        style = {key_style}
                        name='key'
                    />
                </Col>
                <Col md={8}>
                    <div style={fontWeight:600}>{@props.ssh_key.get('title')}</div>
                    <span style={fontWeight:600}>Fingerprint: </span><code>{@props.ssh_key.get('fingerprint')}</code><br/>
                    Added on {new Date(@props.ssh_key.get('creation_date')).toLocaleDateString()}
                    {@render_last_use()}
                </Col>
                <Col md={3}>
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
# Takes an optional Help string or node to render as a help modal
exports.SSHKeyList = rclass
    displayName: 'SSH-Key-List'

    propTypes:
        ssh_keys   : rtypes.immutable.Map
        delete_key : rtypes.func
        help       : rtypes.oneOfType([rtypes.string, rtypes.element])

    getDefaultProps: ->
        ssh_keys : immutable.Map()

    render_header: ->
        <h3>
            <Icon name='list-ul' /> SSH keys <Space/>
            {<HelpIcon title='Using SSH Keys'>
                {@props.help}
            </HelpIcon> if @props.help?}
        </h3>

    render_keys: ->
        v = []

        @props.ssh_keys.forEach (ssh_key, fingerprint) =>
            if not ssh_key
                return
            ssh_key = ssh_key.set('fingerprint', fingerprint)
            v.push
                date      : ssh_key.get('last_use_date')
                fp        : fingerprint
                component : <OneSSHKey
                    ssh_key  = {ssh_key}
                    delete   = {@props.delete_key}
                    key      = {fingerprint}
                />
            return
        # sort in reverse order by last_use_date, then by fingerprint
        v.sort (a,b) ->
            if a.date? and b.date?
                return -misc.cmp(a.date, b.date)
            if a.date and not b.date?
                return -1
            if b.date and not a.date?
                return +1
            return misc.cmp(a.fp, b.fp)
        return (x.component for x in v)

    render: ->
        <Panel header={@render_header()}>
            {@props.children}
            <Panel style={marginBottom:'0px'} >
                <ListGroup fill={true}>
                    {@render_keys()}
                </ListGroup>
            </Panel>
        </Panel>


