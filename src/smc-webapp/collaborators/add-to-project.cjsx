###
Add collaborators to a project
###

{React, ReactDOM, redux, rtypes, rclass}  = require('../smc-react')

{Button, ButtonToolbar, FormControl, FormGroup, Well, Checkbox} = require('react-bootstrap')

{Icon, LabeledRow, Loading, MarkdownInput, SearchInput} = require('../r_misc')

{webapp_client}      = require('../webapp_client')

exports.AddCollaborators = rclass
    displayName : 'ProjectSettings-AddCollaborators'

    propTypes :
        project : rtypes.object.isRequired

    reduxProps :
        account :
            get_fullname : rtypes.func

    getInitialState: ->
        search           : ''          # search that user has typed in so far
        select           : undefined   # list of results for doing the search -- turned into a selector
        selected_entries : undefined   # list of actually selected entries in the selector list
        searching        : false       # currently carrying out a search
        err              : ''          # display an error in case something went wrong doing a search
        email_to         : ''          # if set, adding user via email to this address
        email_body       : ''          # with this body.

    reset: ->
        @setState(@getInitialState())

    do_search: (search) ->
        search = search.trim()
        @setState(search: search, selected_entries : undefined)  # this gets used in write_email_invite, and whether to render the selection list.
        if @state.searching
             # already searching
             return
        if search.length == 0
             @setState(err:undefined, select:undefined)
             return
        @setState(searching:true)
        webapp_client.user_search
            query : search
            limit : 50
            cb    : (err, select) =>
                @setState(searching:false, err:err, select:select)

    render_options: (select) ->
        for r in select
            name = r.first_name + ' ' + r.last_name
            <option key={r.account_id} value={r.account_id} label={name}>{name}</option>

    invite_collaborator: (account_id) ->
        @actions('projects').invite_collaborator(@props.project.get('project_id'), account_id)

    add_selected: (select) ->
        @reset()
        # handle case, where just one name is listed → clicking on "add" would clear everything w/o inviting
        if (not @state.selected_entries? or @state.selected_entries?.length == 0) and select?.length == 1
            @invite_collaborator(select[0].account_id)
        else
            for option in @state.selected_entries
                @invite_collaborator(option.getAttribute('value'))

    select_list_clicked: ->
        selected_names = ReactDOM.findDOMNode(@refs.select).selectedOptions
        @setState(selected_entries: selected_names)

    write_email_invite: ->
        name       = @props.get_fullname()
        project_id = @props.project.get('project_id')
        title      = @props.project.get('title')
        host       = window.location.hostname
        target     = "[project '#{title}'](https://#{host}/projects/#{project_id})"
        body       = "Hello!\n\nPlease collaborate with me using [CoCalc](https://#{host}) on #{target}.  \n\nBest wishes,\n\n#{name}"
        @setState(email_to: @state.search, email_body: body)

    send_email_invite: ->
        subject      = "CoCalc Invitation to #{@props.project.get('title')}"
        replyto      = redux.getStore('account').get_email_address()
        replyto_name = redux.getStore('account').get_fullname()
        @actions('projects').invite_collaborators_by_email(@props.project.get('project_id'),
                                                                         @state.email_to,
                                                                         @state.email_body,
                                                                         subject,
                                                                         false,
                                                                         replyto,
                                                                         replyto_name)
        @setState(email_to:'',email_body:'')

    render_send_email: ->
        if not @state.email_to
            return
        <div>
            <hr />
            <Well>
                Enter one or more email addresses separated by commas:
                <FormGroup>
                    <FormControl
                        autoFocus
                        type     = 'text'
                        value    = {@state.email_to}
                        ref      = 'email_to'
                        onChange = {=>@setState(email_to:ReactDOM.findDOMNode(@refs.email_to).value)}
                        />
                </FormGroup>
                <div style={border:'1px solid lightgrey', padding: '10px', borderRadius: '5px', backgroundColor: 'white', marginBottom: '15px'}>
                    <MarkdownInput
                        default_value = {@state.email_body}
                        rows          = 8
                        on_save       = {(value)=>@setState(email_body:value, email_body_editing:false)}
                        on_cancel     = {(value)=>@setState(email_body_editing:false)}
                        on_edit       = {=>@setState(email_body_editing:true)}
                        />
                </div>
                <ButtonToolbar>
                    <Button bsStyle='primary' onClick={@send_email_invite} disabled={!!@state.email_body_editing}>Send Invitation</Button>
                    <Button onClick={=>@setState(email_to:'',email_body:'', email_body_editing:false)}>Cancel</Button>
                </ButtonToolbar>
            </Well>
        </div>

    render_search: ->
        if @state.search and (@state.searching or @state.select)
            <div style={marginBottom:'10px'}>Search for '{@state.search}'</div>

    render_select_list: ->
        if @state.searching
            return <Loading />
        if @state.err
            return <ErrorDisplay error={@state.err} onClose={=>@setState(err:'')} />
        if not @state.select? or not @state.search.trim()
            return
        select = []
        existing = []
        for r in @state.select
            if @props.project.get('users').get(r.account_id)?
                existing.push(r)
            else
                select.push(r)
        if select.length == 0
            if existing.length == 0
                <Button style={marginBottom:'10px'} onClick={@write_email_invite}>
                    <Icon name='envelope' /> No matches. Send email invitation...
                </Button>
            else # no hit, but at least one existing collaborator
                collabs = ("#{r.first_name} #{r.last_name}" for r in existing).join(', ')
                <Alert bsStyle='info'>
                    Existing collaborator(s): {collabs}
                </Alert>
        else
            <div style={marginBottom:'10px'}>
                <FormGroup>
                    <FormControl componentClass='select' multiple ref='select' onClick={@select_list_clicked}>
                        {@render_options(select)}
                    </FormControl>
                </FormGroup>
                {@render_select_list_button(select)}
            </div>


    render_select_list_button: (select) ->
        nb_selected = @state.selected_entries?.length ? 0
        btn_text = switch select.length
            when 0 then "No user found"
            when 1 then "Invite user"
            else switch nb_selected
                when 0 then "Select a name above"
                when 1 then "Invite selected user"
                else "Invite #{nb_selected} users"
        disabled = select.length == 0 or (select.length >= 2 and nb_selected == 0)
        <Button onClick={=>@add_selected(select)} disabled={disabled}><Icon name='user-plus' /> {btn_text}</Button>


    render: ->
        <div>
            <LabeledRow label='Add collaborators'>
                <SearchInput
                    on_submit       = {@do_search}
                    default_value   = {@state.search}
                    placeholder     = 'Search by name or email address...'
                    on_change       = {(value) => @setState(select:undefined)}
                    on_clear        = {@reset}
                />
            </LabeledRow>
            {@render_search()}
            {@render_select_list()}
            {@render_send_email()}
        </div>

