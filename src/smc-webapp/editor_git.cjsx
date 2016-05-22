###
Git "editor" -- basically an application that let's you interact with git.

###

{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Input, Panel, Row, Col, Tabs, Tab} = require('react-bootstrap')
{Icon, Space, Tip} = require('./r_misc')
{salvus_client} = require('./salvus_client')
misc = require('smc-util/misc')
{defaults, required} = misc

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
        console.log("git editor exec #{opts.cmd} #{opts.args.join(' ')}")
        salvus_client.exec
            project_id  : @project_id
            command     : opts.cmd
            args        : opts.args
            path        : @path
            err_on_exit : true
            cb          : (err, output) =>
                if err
                    console.log(JSON.stringify(err), JSON.stringify(output))
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
        console.log('FULL NAME '+@redux.getStore('account').get_fullname())
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
        console.log('FULL email '+@redux.getStore('account').get_email_address())
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


    run_git_commit : =>
        store = @redux.getStore(@name)
        commit_message = store.get('commit_message')
        console.log('CM: '+commit_message)
        @setState(git_commit_return : 'commiting...')
        @exec
            cmd  : "git"
            args : ['commit', '-a', '-m', commit_message]
            cb   : (err, output) =>
                if err
                    @setState(git_commit_return : JSON.stringify(err) + ' ' + JSON.stringify(output))
                else
                    @setState(git_commit_return : output.stdout)
                    @setState(commit_message : '')
                    @update_status()
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

    update_diff : () =>
        @setState(git_diff : 'updating...')
        @exec
            cmd  : "git"
            args : ['diff']
            cb   : (err, output) =>
                if err
                    @setState(git_diff : '')
                else
                    @setState(git_diff : output.stdout)

    set_tab : (tab) =>
        @setState(tab:tab)
        if tab == 'configuration'
            @get_git_user_name()
            @get_git_user_email()
        if tab == 'commit'
            @update_status()
            @update_diff()


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
            tab                   : rtypes.string
            git_repo_root         : rtypes.string
            git_user_name         : rtypes.string
            git_user_email        : rtypes.string
            git_user_name_return  : rtypes.string
            git_user_email_return : rtypes.string
            git_commit_return     : rtypes.string
            commit_message        : rtypes.string
            git_status            : rtypes.string
            git_diff              : rtypes.string

    propTypes :
        actions : rtypes.object

    render_configuration_header : ->
        <Tip delayShow=1300
             title="Configuration" tip="This tab lists all ">
            <span>
                <Icon name="cogs"/> Configuration
            </span>
        </Tip>

    render_commit_header : ->
        <Tip delayShow=1300
             title="Commit" tip="This tab lists all ">
            <span>
                <Icon name="cogs"/> Commit
            </span>
        </Tip>

    render_commit_message_input : ->
        <Input
            ref         = 'commit_message'
            type        = 'text'
            placeholder = 'Commit message'

            onChange    = {=>@props.actions.setState(commit_message:@refs.commit_message.getValue())}
            onKeyDown   = {@handle_commit_message_keypress}
        />

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
            @props.actions.set_git_name_email()

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
        head =
            <span>
                git commit -a -m "{@render_commit_message_input()}"
                <Button
                    onClick  = {=>@props.actions.run_git_commit()} >
                    Run
                </Button>

            </span>
        <Panel header={head}>
            {<pre>{@props.git_commit_return}</pre> if @props.git_commit_return}
        </Panel>

    render_status : ->
        head =
            <span>
                git status
                <Space/> <Space/>
                <Button onClick={=>@props.actions.update_status()}>
                    Refresh
                </Button>
                <Button onClick={=>@props.actions.setState(git_status:'')}>
                    Clear
                </Button>
            </span>
        <Panel header={head}>
            {<pre>{@props.git_status}</pre> if @props.git_status}
        </Panel>

    render_diff : ->
        head =
            <span>
                git diff
                <Space/> <Space/>
                <Button onClick={=>@props.actions.update_diff()}>
                    Refresh
                </Button>
                <Button onClick={=>@props.actions.setState(git_diff:'')}>
                    Clear
                </Button>
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
                <Col sm=4>
                    {@render_commit_panel()}
                </Col>
                <Col sm=4>
                    {@render_status()}
                </Col>
                <Col sm=4>
                    {@render_diff()}
                </Col>
            </Row>
        </div>

    render : ->
        <div>
            <h2>Git Repository at {@props.git_repo_root}</h2>
            <Tabs animation={false} activeKey={@props.tab} onSelect={(key)=>@props.actions.set_tab(key)}>
                <Tab eventKey={'configuration'} title={@render_configuration_header()}>
                    <div style={marginTop:'8px'}></div>
                    {@render_configuration()}
                </Tab>
                <Tab eventKey={'commit'} title={@render_commit_header()}>
                    <div style={marginTop:'8px'}></div>
                    {@render_commit()}
                </Tab>
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