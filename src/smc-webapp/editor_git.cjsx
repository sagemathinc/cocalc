###
Git "editor" -- basically an application that let's you interact with git.

###

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Form, FormControl, FormGroup, Panel, Row, Col, ControlLabel, Tabs, Tab, DropdownButton, MenuItem, Modal} = require('react-bootstrap')
{Icon, Octicon, Space, Tip} = require('./r_misc')
{salvus_client} = require('./salvus_client')
misc = require('smc-util/misc')
{defaults, required} = misc

TABS = [
    {"name": "Configuration", "icon": "settings", "description": "Configure global git settings as well as repo settings", "init_actions": ['get_git_user_name', 'get_git_user_email', 'update_github_login']},
    {"name": "Commit", "icon": "git-commit", "description": "Commit files", "init_actions": ['get_changed_tracked_files', 'get_changed_untracked_files', 'update_diff']},
    {"name": "Log", "icon": "history", "description": "Log of commits", "init_actions": ['update_log']},
    {"name": "Issues", "icon": "issue-opened", "description": "Github issues for upstream", "init_actions": ['get_github_issues']},
]

TABS_BY_NAME = {}
for tab in TABS
    TABS_BY_NAME[tab["name"].toLowerCase()] = tab

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class GitActions extends Actions

    init: (@project_id, @filename) =>
        @path = misc.path_split(@filename).head
        @setState(git_repo_root : @path)
        @setState(data_file : misc.path_split(@filename).tail)
        @set_tab('configuration')

    exec: (opts) =>
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
                    console.warn(JSON.stringify(output))
                    opts.cb(err, output)
                opts.cb(err, output)

    get_github_issues: =>
        url = 'https://api.github.com/repos/sagemathinc/smc/issues'
        callback = (response) => @setState(github_issues: response)
        $.get url, callback

    get_current_github_issue: =>
        store = @redux.getStore(@name)
        if store.get('current_branch') and store.get('remotes')
            if store.get('current_branch').startsWith('upstream_issue_')
                issue_number = store.get('current_branch').slice(15)
                upstream_url = store.get('remotes').get('upstream')
                regex = /r?\/([\w]+)\/([\w]+)\.git?/g
                match = regex.exec(upstream_url)
                username = match[1]
                repo = match[2]
                url = 'https://api.github.com/repos/'+username+'/'+repo+'/issues/'+issue_number
                callback = (response) => @setState(current_github_issue: response)
                $.get url, callback

    save_github_login: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['set_github_login', store.get('data_file'), store.get('github_username'), store.get('github_access_token')]
            cb   : (err, output) =>
                ''

    make_upstream_pr_for_current_branch: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['make_upstream_pr_for_current_branch', store.get('data_file')]
            cb   : (err, output) =>
                ''

    update_github_login: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['get_data_file_contents', store.get('data_file')]
            cb   : (err, output) =>
                data = JSON.parse(output.stdout)
                @setState(github_username : data['github_username'])
                @setState(github_access_token : data['github_access_token'])

    set_git_user_name: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['config', '--global', 'user.name', store.get('git_user_name')]
            cb   : (err, output) =>
                @setState(git_user_name : store.get('git_user_name'))

    get_git_user_name: =>
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

    set_git_user_email: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['config', '--global', 'user.email', store.get('git_user_email')]
            cb   : (err, output) =>
                @setState(git_user_email : store.get('git_user_email'))

    get_git_user_email: =>
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

    simple_smc_git: (f_name) =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : [f_name]
            cb   : (err, output) =>
                ''

    set_remotes: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['remotes']
            cb   : (err, output) =>
                @setState(remotes : JSON.parse(output.stdout))

    get_current_branch: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['current_branch']
            cb   : (err, output) =>
                @setState(current_branch : output.stdout)
                t = @
                run = (t) ->
                    t.get_current_github_issue()
                setTimeout(run(t), 5000)

    get_branches: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['branches']
            cb   : (err, output) =>
                @setState(branches : JSON.parse(output.stdout))

    create_branch_and_reset_to_upstream_master_with_name: (new_branch_name) =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['create_branch_and_reset_to_upstream_master', new_branch_name]
            cb   : (err, output) =>
                @setState(new_branch_name : '')

    create_branch_and_reset_to_upstream_master: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['create_branch_and_reset_to_upstream_master', store.get('new_branch_name')]
            cb   : (err, output) =>
                @setState(new_branch_name : '')

    checkout_branch: (branch) =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['checkout', '--force', branch]
            cb   : (err, output) =>
                ''

    get_changed_tracked_files: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['changed_tracked_files']
            cb   : (err, output) =>
                @setState(git_changed_tracked_files : JSON.parse(output.stdout))

    get_changed_untracked_files: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "smc-git"
            args : ['changed_untracked_files']
            cb   : (err, output) =>
                @setState(git_changed_untracked_files : JSON.parse(output.stdout))



    git_add_selected: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['add'].concat store.get('checked_files').get('untracked')
            cb   : (err, output) =>
                ''

    git_add_all: =>
        store = @redux.getStore(@name)
        @exec
            cmd  : "git"
            args : ['add', '.']
            cb   : (err, output) =>
                ''

    run_git_commit: =>
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



    update_diff: =>
        store = @redux.getStore(@name)
        if store
            args = if store.get('file_to_diff') then ['diff', store.get('file_to_diff')] else ['diff']
        else
            args = ['diff']
        @exec
            cmd  : "git"
            args : args
            cb   : (err, output) =>
                if err
                    @setState(git_diff : '')
                else
                    @setState(git_diff : output.stdout)

    update_log: () =>
        @exec
            cmd  : "git"
            args : ['log', '-20']
            cb   : (err, output) =>
                if err
                    @setState(git_log : '')
                else
                    @setState(git_log : output.stdout)

    run_for_tab: =>
        store = @redux.getStore(@name)
        if store
            tab = store.get('tab')
            general_actions_to_run = ['set_remotes', 'get_current_branch', 'get_branches']
            actions_to_run = general_actions_to_run.concat TABS_BY_NAME[tab]["init_actions"]
            for action in actions_to_run
                @[action]()

    set_tab: (tab) =>
        @setState(tab:tab)
        t = @
        run = (t) ->
            t.run_for_tab()
        setTimeout(run(t), 1000)

    add_or_removed_checked_files: (name, listing_type) =>
        store = @redux.getStore(@name)
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

    handle_click: (e) ->
        @props.actions.add_or_removed_checked_files(@props.name, @props.listing_type)

    render: ->
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

    render: ->
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

    getDefaultProps: ->
        file_search : ''

    render_row: (name, key) ->
        checked = true

        return <FileRow
            name         = {name}
            key          = {key}
            listing_type = {@props.listing_type}
            checked      = {if @props.checked_files then @props.checked_files[@props.listing_type].indexOf(name) > -1 else false}
            current_path = {@props.current_path}
            actions      = {@props.actions} />

    render_rows: ->
        (@render_row(name, idx) for name, idx in @props.listing)

    render: ->
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
            data_file                   : rtypes.string
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
            show_create_branch_modal    : rtypes.bool
            new_branch_name             : rtypes.string
            interval                    : rtypes.func
            github_issues               : rtypes.array
            current_github_issue        : rtypes.object
            remotes                     : rtypes.object
            github_username             : rtypes.string
            github_access_token         : rtypes.string

    propTypes :
        actions : rtypes.object


    render_user_name_input: ->
        <FormGroup>
            <FormControl
                ref         = 'git_user_name'
                type        = 'text'
                placeholder = {@props.git_user_name ? ''}
                onChange    = {=>@props.actions.setState(git_user_name:ReactDOM.findDOMNode(@refs.git_user_name).value)}
                onKeyDown   = {@handle_user_name_keypress}
            />
        </FormGroup>

    render_user_name_panel: ->
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

    handle_user_name_keypress: (e) ->
        if e.keyCode == 13 and @props.git_name_email != ''
            @props.actions.set_git_user_name()

    handle_user_email_keypress: (e) ->
        if e.keyCode == 13 and @props.git_user_email != ''
            @props.actions.set_git_user_email()

    handle_commit_message_keypress: (e) ->
        if e.keyCode == 13 and @props.commit_message != ''
            @props.actions.run_git_commit()

    render_user_email_input: ->
        <FormGroup>
            <FormControl
                ref         = 'git_user_email'
                type        = 'text'
                placeholder = {@props.git_user_email ? ''}
                onChange    = {=>@props.actions.setState(git_user_email:ReactDOM.findDOMNode(@refs.git_user_email).value)}
                onKeyDown   = {@handle_user_email_keypress}
            />
        </FormGroup>

    render_user_email_panel: ->
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


    render_commit_panel: ->
        window.refs = @refs # SMELL: is this needed?
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
                <FormGroup>
                    Write your commit message
                    <FormControl
                        ref         = 'commit_message'
                        type        = 'text'
                        value       = {@props.commit_message ? ''}
                        placeholder = {@props.commit_message ? 'Commit message'}
                        onChange    = {=>@props.actions.setState(commit_message:ReactDOM.findDOMNode(@refs.commit_message).value)}
                        onKeyDown   = {@handle_commit_message_keypress}
                    />
                </FormGroup>
                <Button
                    onClick  = {=>@props.actions.run_git_commit()} >
                    Commit the selected changed tracked files
                </Button>
            </div>
        <Panel header={head}>
            {<pre>{@props.git_commit_return}</pre> if @props.git_commit_return}
        </Panel>

    render_log_panel: ->
        head =
            <span>
                git log

            </span>
        <Panel header={head}>
            {<pre>{@props.git_log}</pre> if @props.git_log}
        </Panel>

    render_changed_untracked_files: ->
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

    render_diff_files: ->
        if @props.git_changed_tracked_files
            for file, idx in @props.git_changed_tracked_files
                <MenuItem key={idx} eventKey="{file}" onSelect={(e)=>@props.actions.setState(file_to_diff:e.target.text);@props.actions.update_diff()}>{file}</MenuItem>

    render_diff: ->
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

    handle_github_login_keypress: (e) ->
        if e.keyCode == 13
            @props.actions.save_github_login()

    render_github_login_panel: ->
        head =
            <span>
                Github login credentials
            </span>
        <Panel header={head}>
            <div>
                <Row>
                    <Col sm={2}>
                        Username
                    </Col>
                    <Col sm={10}>
                        <FormGroup>
                            <FormControl
                                ref         = 'github_username'
                                type        = 'text'
                                value       = {@props.github_username ? ''}
                                onChange    = {=>@props.actions.setState(github_username:ReactDOM.findDOMNode(@refs.github_username).value)}
                                onKeyDown   = {@handle_github_login_keypress}
                            />
                        </FormGroup>
                    </Col>
                </Row>
                <Row>
                    <Col sm={2}>
                        Personal access token
                    </Col>
                    <Col sm={10}>
                        <FormGroup>
                            <FormControl
                                ref         = 'github_access_token'
                                type        = 'password'
                                value       = {@props.github_access_token ? ''}
                                onChange    = {=>@props.actions.setState(github_access_token:ReactDOM.findDOMNode(@refs.github_access_token).value)}
                                onKeyDown   = {@handle_github_login_keypress}
                            />
                        </FormGroup>
                    </Col>
                </Row>
                <Row>
                    <Col sm={2}>
                    </Col>
                    <Col sm={10}>
                        <Button onClick={=>@props.actions.save_github_login()}>
                            Save
                        </Button>
                    </Col>
                </Row>
            </div>
        </Panel>

    render_configuration: ->
        <div>
            <Row>
                <Col sm=6>
                    {@render_user_name_panel()}
                </Col>
                <Col sm=6>
                    {@render_user_email_panel()}
                </Col>
            </Row>
            <Row>
                <Col sm=6>
                    {@render_github_login_panel()}
                </Col>
            </Row>
        </div>

    render_commit: ->
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

    render_log: ->
        <div>
            <Row>
                <Col sm=12>
                    {@render_log_panel()}
                </Col>
            </Row>
        </div>

    pass_issue: (number) ->
        @props.actions.create_branch_and_reset_to_upstream_master_with_name('upstream_issue_'+number)

    list_issues: ->
        if @props.github_issues
            for issue, idx in @props.github_issues
                t = @
                do (issue, t) ->
                    <Row key={idx}>
                        <Col sm=8>
                             { issue.title }
                        </Col>
                        <Col>
                            <Button onClick={=>t.pass_issue(issue.number)}>
                                Create branch for this ticket: upstream_issue_{ issue.number }
                            </Button>
                        </Col>
                    </Row>

    render_issues: ->
        <div>
            <Row>
                <Col sm=12>
                    {@list_issues()}
                </Col>
            </Row>
        </div>


    render_tab_header: (name, icon, description)->
        <Tip delayShow=1300
             title={name} tip={description}>
            <span>
                <Octicon name={icon}/> {name }
            </span>
        </Tip>

    render_tab: (idx, name, icon, description) ->
        <Tab key={idx}
             eventKey={name.toLowerCase()}
             title={@render_tab_header(name, icon, description)}>
                 <div style={marginTop:'8px'}></div>
                 {@['render_'+name.toLowerCase()]()}
        </Tab>

    render_tabs: ->
        for tab, idx in TABS
            @render_tab(idx, tab.name, tab.icon, tab.description)

    render_branches: ->
        if @props.branches
            for branch, idx in @props.branches
                <MenuItem key={idx} eventKey="{branch}" onSelect={(e)=>@props.actions.checkout_branch(e.target.text);}>{branch}</MenuItem>

    handle_keypress: (e, input_name, action) ->
        if e.keyCode == 13 and @props[input_name] != ''
            @props.actions[action]()

    componentDidMount: ->
        @props.actions.set_tab('configuration')
        @props.interval = setInterval =>
            @props.actions.run_for_tab()
          , 30000

    componentWillUnmount: ->
        clearInterval(@props.interval)

    render_current_issue: ->
        if @props.current_github_issue
            head =
                <span className="small">
                    <strong>Working on issue #{@props.current_github_issue.number}:</strong> {@props.current_github_issue.title}
                </span>
            <Panel className="small" header={head}>
                <p>{@props.current_github_issue.body}</p>
                <a target="_blank" href={@props.current_github_issue.html_url}>Open on Github</a>
            </Panel>

    render: ->
        <div>
            <div>
                <h2 style={display:'inline'}>Git Repository at {@props.git_repo_root}</h2>
                <b><br/>(WARNING: The git editor is highly experimental and not finished!)</b>
                <Space/> <Space/>
                <DropdownButton title={'Switch branch from '+@props.current_branch} id='switch_branches'>
                    <MenuItem eventKey="{file}" onSelect={(e)=>@props.actions.setState(show_create_branch_modal:true)}>Create a branch and reset to upstream master</MenuItem>
                    {@render_branches()}
                </DropdownButton>
                <Space/> <Space/>
                <Button onClick={=>@props.actions.simple_smc_git('push_to_origin_same_branch')}>
                    Push to origin {@props.current_branch}
                </Button>
                <Space/> <Space/>
                <Button onClick={=>@props.actions.simple_smc_git('pull_upstream_master')}>
                    Pull upstream master
                </Button>
                <Space/> <Space/>
                <Button onClick={=>@props.actions.make_upstream_pr_for_current_branch()}>
                    Send pull request
                </Button>
                <div className="custom-modal">
                    <Modal show={@props.show_create_branch_modal} onHide={=>@props.actions.setState(show_create_branch_modal:false)}>
                        <Modal.Header>
                            <Modal.Title>Create a banch</Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <FormGroup>
                                <FormControl
                                    ref         = 'new_branch_name'
                                    type        = 'text'
                                    value       = {@props.new_branch_name ? ''}
                                    placeholder = {'Branch name'}
                                    onChange    = {=>@props.actions.setState(new_branch_name:ReactDOM.findDOMNode(@refs.new_branch_name).value)}
                                    onKeyDown   = {=>@handle_keypress('new_branch_name', 'create_branch_and_reset_to_upstream_master')}
                                />
                            </FormGroup>
                        </Modal.Body>
                        <Modal.Footer>
                            <Button onClick={=>@props.actions.setState(show_create_branch_modal:false)}>Close</Button>
                            <Button bsStyle="primary" onClick={=>@props.actions.create_branch_and_reset_to_upstream_master();@props.actions.setState(show_create_branch_modal:false)}>Create the branch</Button>
                        </Modal.Footer>
                    </Modal>
                </div>
            </div>
            <div>
                {@render_current_issue()}
            </div>
            <Tabs animation={false} activeKey={@props.tab} onSelect={(key)=>@props.actions.set_tab(key)} id="git-tabs">
                {@render_tabs()}
            </Tabs>

        </div>

render = (redux, project_id, path) ->
    name    = redux_name(project_id, path)
    actions = redux.getActions(name)
    Git_connected = Git(name)
    <Git_connected actions={actions} />

exports.free = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)