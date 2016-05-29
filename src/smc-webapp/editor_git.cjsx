###
Git "editor" -- basically an application that let's you interact with git.

###

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Input, Form, Panel, Row, Col, Tabs, Tab, DropdownButton, MenuItem, Modal} = require('react-bootstrap')
{Icon, Octicon, Space, Tip} = require('./r_misc')
{salvus_client} = require('./salvus_client')
misc = require('smc-util/misc')
{defaults, required} = misc

TABS = [
    {"name": "Configuration", "icon": "settings", "description": "Configure global git settings as well as repo settings", "init_actions": ['get_git_user_name', 'get_git_user_email']},
    {"name": "Commit", "icon": "git-commit", "description": "Commit files", "init_actions": ['get_changed_tracked_files', 'get_changed_untracked_files', 'update_diff']},
    {"name": "Log", "icon": "history", "description": "Log of commits", "init_actions": ['update_log']},
]

TABS_BY_NAME = {}
for tab in TABS
    TABS_BY_NAME[tab["name"].toLowerCase()] = tab

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class GitActions extends Actions

    init : (@project_id, @filename) =>
        @path = misc.path_split(@filename).head
        @setState(git_repo_root : @path)
        @set_tab('configuration')

    exec : (opts) =>
        opts = defaults opts,
            cmd  : required
            args : []
            cb   : required
        salvus_client.exec
            project_id  : @project_id
            command     : opts.cmd
            args        : opts.args
            path        : @path
            err_on_exit : true
            cb          : (err, output) =>
                if err
                    console.warn("git editor ERROR exec'ing #{opts.cmd} #{opts.args.join(' ')}")
                    opts.cb(err, output)
                opts.cb(err, output)

    set_git_user_name : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['config', '--global', 'user.name', store.get('git_user_name')]
            cb   : (err, output) =>
                @setState(git_user_name : store.get('git_user_name'))

    get_git_user_name : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['config', '--global', 'user.name']
            cb   : (err, output) =>
                if err
                    if @redux.getStore('account').get_fullname() != ''
                        name = @redux.getStore('account').get_fullname()
                    else
                        name = 'Unknown name'
                    @setState(git_user_name : name)
                    @set_git_user_name()
                else
                    @setState(git_user_name : output.stdout)

    set_git_user_email : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['config', '--global', 'user.email', store.get('git_user_email')]
            cb   : (err, output) =>
                @setState(git_user_email : store.get('git_user_email'))

    get_git_user_email : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['config', '--global', 'user.email']
            cb   : (err, output) =>
                if err
                    if @redux.getStore('account').get_email_address() != ''
                        email = @redux.getStore('account').get_fullname()
                    else
                        email = 'unknown@unknown.com'
                    @setState(git_user_email : email)
                    @set_git_user_email()
                else
                    @setState(git_user_email : output.stdout)

    get_current_branch : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['current_branch']
            cb   : (err, output) =>
                @setState(current_branch : output.stdout)

    get_branches : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['branches']
            cb   : (err, output) =>
                @setState(branches : JSON.parse(output.stdout))
                
    create_branch_and_reset_to_upstream_master : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['create_branch_and_reset_to_upstream_master', store.get('new_branch_name')]
            cb   : (err, output) =>
                @setState(new_branch_name : '')
                @set_tab(store.get('tab'))

    get_changed_tracked_files : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['changed_tracked_files']
            cb   : (err, output) =>
                @setState(git_changed_tracked_files : JSON.parse(output.stdout))

    get_changed_untracked_files : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['changed_untracked_files']
            cb   : (err, output) =>
                @setState(git_changed_untracked_files : JSON.parse(output.stdout))



    git_add_selected : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['add'].concat store.get('checked_files').get('untracked')
            cb   : (err, output) =>
                @get_changed_untracked_files()
                @get_changed_tracked_files()

    git_add_all : =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['add', '.']
            cb   : (err, output) =>
                @get_changed_untracked_files()
                @get_changed_tracked_files()
                @update_diff()

    run_git_commit : =>
        store = @redux.getStore(@name)
        commit_message = store.get('commit_message')
        if store.get('checked_files')
            checked_tracked_files = JSON.parse(JSON.stringify(store.get('checked_files').get('tracked')))
        else
            checked_tracked_files = []
        @setState(git_commit_return : 'commiting...')
        @exec
            cmd  : "git"
            args : ['commit', '-m', commit_message].concat checked_tracked_files
            cb   : (err, output) =>
                if err
                    @setState(git_commit_return : JSON.stringify(err) + ' ' + JSON.stringify(output))
                else
                    @setState(git_commit_return : output.stdout)
                    @setState(commit_message : '')
                    @get_changed_tracked_files()
                    @update_diff()

    update_status : () =>
        @setState(git_status : 'updating...')
        @exec
            cmd  : "git"
            args : ['status']
            cb   : (err, output) =>
                if err
                    @setState(git_status : '')
                else
                    @setState(git_status : output.stdout)

    update_diff : =>
        store = @redux.getStore(@name)
        
        if store
            args = if store.get('file_to_diff') then ['diff', store.get('file_to_diff')] else ['diff']
        else
            args = ['diff']
        @setState(git_diff : 'updating...')
        @exec
            cmd  : "git"
            args : args
            cb   : (err, output) =>
                if err
                    @setState(git_diff : '')
                else
                    @setState(git_diff : output.stdout)

    update_log : () =>
        @setState(git_log : 'updating...')
        @exec
            cmd  : "git"
            args : ['log', '-20']
            cb   : (err, output) =>
                if err
                    @setState(git_log : '')
                else
                    @setState(git_log : output.stdout)

    set_tab : (tab) =>
        @setState(tab:tab)
        general_actions_to_run = ['get_current_branch', 'get_branches']
        actions_to_run = general_actions_to_run.concat TABS_BY_NAME[tab]["init_actions"]
        for action in actions_to_run
            @[action]()

    add_or_removed_checked_files : (name, listing_type) =>
        store = @redux.getStore(@name)
        window.actions = @; window.store = store
        if not store.get('checked_files')
            @setState(checked_files: {"tracked": [], "untracked": []})
        # I was unable to modify the object as is Only worked once I did -> JSON -> object
        if store.get('checked_files').get(listing_type).indexOf(name) > -1
            checked_files = JSON.parse(JSON.stringify(store.get('checked_files')))
            checked_files[listing_type] = checked_files[listing_type].filter (word) -> word isnt name
            @setState(checked_files: checked_files)
        else
            checked_files = JSON.parse(JSON.stringify(store.get('checked_files')))
            checked_files[listing_type].push(name)
            @setState(checked_files: checked_files)

FileCheckbox = rclass
    displayName : 'ProjectGit-FileCheckbox'

    propTypes :
        name         : rtypes.string
        checked      : rtypes.bool
        actions      : rtypes.object.isRequired
        current_path : rtypes.string
        style        : rtypes.object
        listing_type : rtypes.string

    handle_click : (e) ->
        @props.actions.add_or_removed_checked_files(@props.name, @props.listing_type)

    render : ->
        <span onClick={@handle_click} style={@props.style}>
            <Icon name={if @props.checked then 'check-square-o' else 'square-o'} fixedWidth style={fontSize:'14pt'}/>
        </span>

FileRow = rclass
    displayName : 'ProjectGit-FileRow'

    propTypes :
        name         : rtypes.string.isRequired
        current_path : rtypes.string
        actions      : rtypes.object.isRequired
        listing_type : rtypes.string
        key          : rtypes.string

    render : ->
        <Row key={@props.key} onClick={@handle_click} className={'noselect small'}>
            <FileCheckbox
                    name         = {@props.name}
                    checked      = {@props.checked}
                    current_path = {@props.current_path}
                    actions      = {@props.actions}
                    style        = {verticalAlign:'sub'}
                    listing_type = {@props.listing_type} />
            {@props.name}
        </Row>

FileListing = rclass
    displayName : 'ProjectGit-FileListing'

    propTypes :
        listing             : rtypes.array.isRequired
        listing_type        : rtypes.string
        checked_files       : rtypes.object
        current_path        : rtypes.string
        actions             : rtypes.object.isRequired

    getDefaultProps : ->
        file_search : ''

    render_row : (name, key) ->
        checked = true

        return <FileRow
            name         = {name}
            key          = {key}
            listing_type = {@props.listing_type}
            checked      = {if @props.checked_files then @props.checked_files[@props.listing_type].indexOf(name) > -1 else false}
            current_path = {@props.current_path}
            actions      = {@props.actions} />

    render_rows : ->
        (@render_row(name, idx) for name, idx in @props.listing)

    render : ->
        <Col sm=12>
            {@render_rows()}
        </Col>




exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)
    if redux.getActions(name)?
        return  # already initialized
    actions = redux.createActions(name, GitActions)
    actions.init(project_id, filename)
    redux.createStore(name)

Git = (name) -> rclass
    reduxProps:
        "#{name}" :
            tab                         : rtypes.string
            git_repo_root               : rtypes.string
            git_user_name               : rtypes.string
            git_user_email              : rtypes.string
            git_user_name_return        : rtypes.string
            git_user_email_return       : rtypes.string
            git_commit_return           : rtypes.string
            commit_message              : rtypes.string
            git_status                  : rtypes.string
            git_diff                    : rtypes.string
            git_log                     : rtypes.string
            current_branch              : rtypes.string
            branches                    : rtypes.array
            git_changed_tracked_files   : rtypes.array
            git_changed_untracked_files : rtypes.array
            checked_files               : rtypes.object
            file_to_diff                : rtypes.string
            show_create_branch_modal    : rtypes.boolean
            new_branch_name             : rtypes.string

    propTypes :
        actions : rtypes.object


    render_user_name_input : ->
        <Input
            ref         = 'git_user_name'
            type        = 'text'
            placeholder = {@props.git_user_name ? ''}
            onChange    = {=>@props.actions.setState(git_user_name:@refs.git_user_name.getValue())}
            onKeyDown   = {@handle_user_name_keypress}
        />

    render_user_name_panel : ->
        head =
            <span>
                git config --global user.name "{@render_user_name_input()}"
                <Button
                    onClick  = {=>@props.actions.set_git_user_name()} >
                    Run
                </Button>

            </span>
        <Panel header={head}>
            {<pre>{@props.git_user_name_return}</pre> if @props.git_user_name_return}
        </Panel>

    handle_user_name_keypress : (e) ->
        if e.keyCode == 13 and @props.git_name_email != ''
            @props.actions.set_git_user_name()

    handle_user_email_keypress : (e) ->
        if e.keyCode == 13 and @props.git_user_email != ''
            @props.actions.set_git_user_email()

    handle_commit_message_keypress : (e) ->
        if e.keyCode == 13 and @props.commit_message != ''
            @props.actions.run_git_commit()

    render_user_email_input : ->
        <Input
            ref         = 'git_user_email'
            type        = 'text'
            placeholder = {@props.git_user_email ? ''}
            onChange    = {=>@props.actions.setState(git_user_email:@refs.git_user_email.getValue())}
            onKeyDown   = {@handle_user_email_keypress}
        />

    render_user_email_panel : ->
        head =
            <span>
                git config --global user.email "{@render_user_email_input()}"
                <Button
                    onClick  = {=>@props.actions.set_git_user_email()} >
                    Run
                </Button>

            </span>
        <Panel header={head}>
            {<pre>{@props.git_user_email_return}</pre> if @props.git_user_email_return}
        </Panel>


    render_commit_panel : ->
        window.refs = @refs
        head =
            <div>
                <span>
                    Select the changed tracked files to commit
                </span>
                <div>
                {<FileListing
                    listing             = {@props.git_changed_tracked_files}
                    listing_type        = 'tracked'
                    checked_files       = {@props.checked_files}
                    actions             = {@props.actions} /> if @props.git_changed_tracked_files}
                </div>
                Write your commit message
                <Input
                    ref         = 'commit_message'
                    type        = 'text'
                    value       = {@props.commit_message ? ''}
                    placeholder = {@props.commit_message ? 'Commit message'}
                    onChange    = {=>@props.actions.setState(commit_message:@refs.commit_message.getValue())}
                    onKeyDown   = {@handle_commit_message_keypress}
                />
                <Button
                    onClick  = {=>@props.actions.run_git_commit()} >
                    Commit the selected changed tracked files
                </Button>
            </div>
        <Panel header={head}>
            {<pre>{@props.git_commit_return}</pre> if @props.git_commit_return}
        </Panel>

    render_log_panel : ->
        head =
            <span>
                git log

            </span>
        <Panel header={head}>
            {<pre>{@props.git_log}</pre> if @props.git_log}
        </Panel>

    render_changed_untracked_files : ->
        head =
            <span>
                Changed untracked files not covered by .gitignore
                <Button onClick={=>@props.actions.git_add_selected()}>
                    Add selected
                </Button>
            </span>
        <Panel header={head}>
            {<FileListing
                listing             = {@props.git_changed_untracked_files}
                listing_type        = 'untracked'
                checked_files       = {@props.checked_files}
                actions             = {@props.actions} /> if @props.git_changed_untracked_files}
        </Panel>

    render_diff_files : ->
        if @props.git_changed_tracked_files
            for file, idx in @props.git_changed_tracked_files
                <MenuItem key={idx} eventKey="{file}" onSelect={(e)=>@props.actions.setState(file_to_diff:e.target.text);@props.actions.update_diff()}>{file}</MenuItem>

    render_diff : ->
        head =
            <span>
                git diff
                <Space/> <Space/>
                <DropdownButton title='file' id='files_to_diff'>
                    {@render_diff_files()}
                </DropdownButton>
                <Space/> <Space/>
                
            </span>
        <Panel header={head}>
            {<pre>{@props.git_diff}</pre> if @props.git_diff}
        </Panel>

    render_configuration : ->
        <Row>
            <Col sm=6>
                {@render_user_name_panel()}
            </Col>
            <Col sm=6>
                {@render_user_email_panel()}
            </Col>
        </Row>

    render_commit : ->
        <div>
            <Row>
                <Col sm=6>
                    {@render_commit_panel()}
                    {@render_changed_untracked_files()}
                </Col>
                <Col sm=6>
                    {@render_diff()}
                </Col>
            </Row>
        </div>

    render_log : ->
        <div>
            <Row>
                <Col sm=12>
                    {@render_log_panel()}
                </Col>
            </Row>
        </div>


    render_tab_header : (name, icon, description)->
        <Tip delayShow=1300
             title={name} tip={description}>
            <span>
                <Octicon name={icon}/> {name }
            </span>
        </Tip>

    render_tab : (idx, name, icon, description) ->
        <Tab key={idx}
             eventKey={name.toLowerCase()}
             title={@render_tab_header(name, icon, description)}>
                 <div style={marginTop:'8px'}></div>
                 {@['render_'+name.toLowerCase()]()}
        </Tab>

    render_tabs : ->
        for tab, idx in TABS
            @render_tab(idx, tab.name, tab.icon, tab.description)

    render_branches : ->
        if @props.branches
            for branch, idx in @props.branches
                <MenuItem key={idx} eventKey="{branch}" onSelect={(e)=>@props.actions.checkout_branch(e.target.text);}>{branch}</MenuItem>

    handle_keypress : (e, input_name, action) ->
        if e.keyCode == 13 and @props[input_name] != ''
            @props.actions[action]()

    render : ->
        <div>
            <div>
                <h2 style={display:'inline'}>Git Repository at {@props.git_repo_root}</h2>
                <Space/> <Space/>
                <Button onClick={=>@props.actions.set_tab(@props.tab)}>
                    Refresh
                </Button>
                <Space/> <Space/>
                <DropdownButton title={'Switch branch from '+@props.current_branch} id='switch_branches'>
                    <MenuItem eventKey="{file}" onSelect={(e)=>@props.actions.setState(show_create_branch_modal:true)}>Create a branch and reset to upstream master</MenuItem>
                    {@render_branches()}
                </DropdownButton>
                <div className="static-modal">
                    <Modal.Dialog show={@props.show_create_branch_modal}>
                        <Modal.Header>
                            <Modal.Title>Create a banch</Modal.Title>
                        </Modal.Header>

                      <Modal.Body>
                        <Input
                            ref         = 'new_branch_name'
                            type        = 'text'
                            value       = {@props.new_branch_name ? ''}
                            placeholder = {'Branch name'}
                            onChange    = {=>@props.actions.setState(new_branch_name:@refs.new_branch_name.getValue())}
                            onKeyDown   = {=>@handle_keypress(e, 'new_branch_name', 'create_branch_and_reset_to_upstream_master')}
                        />
                      </Modal.Body>

                      <Modal.Footer>
                        <Button>Close</Button>
                        <Button bsStyle="primary" onClick={=>@props.actions.create_branch_and_reset_to_upstream_master();@props.actions.setState(show_create_branch_modal:false)}>Create the branch</Button>
                      </Modal.Footer>

                    </Modal.Dialog>
                </div>
            </div>
            <Tabs animation={false} activeKey={@props.tab} onSelect={(key)=>@props.actions.set_tab(key)}>
                {@render_tabs()}
            </Tabs>

        </div>

render = (redux, project_id, path) ->
    name    = redux_name(project_id, path)
    actions = redux.getActions(name)
    Git_connected = Git(name)
    <Redux redux={redux}>
        <Git_connected actions={actions} />
    </Redux>

exports.free = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)