###
Git "editor" -- basically an application that let's you interact with git.

###


{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')
{Button, Panel, Row, Col} = require('react-bootstrap')
{Icon, Space} = require('./r_misc')
{salvus_client} = require('./salvus_client')
misc = require('smc-util/misc')
{defaults, required} = misc

redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

class GitActions extends Actions
    init: (@project_id, @filename) =>
        @path = misc.path_split(@filename).head
        @setState(git_repo_root : @path)

    exec: (opts) =>
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
                    console.warn("git editor ERROR exec'ing #{opts.cmd} #{opts.args.join(' ')}")
                opts.cb(err, output)

    update_status: () =>
        @setState(git_status : 'updating...')
        @exec
            cmd  : "git"
            args : ['status']
            cb   : (err, output) =>
                if err
                    @setState(git_status : '')
                else
                    @setState(git_status : output.stdout)

    update_diff: () =>
        @setState(git_diff : 'updating...')
        @exec
            cmd  : "git"
            args : ['diff']
            cb   : (err, output) =>
                if err
                    @setState(git_diff : '')
                else
                    @setState(git_diff : output.stdout)


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
            git_repo_root : rtypes.string
            git_status    : rtypes.string
            git_diff      : rtypes.string

    propTypes:
        actions : rtypes.object

    render_status: ->
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

    render_diff: ->
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

    render : ->
        <div>
            <h2>Git Repository at {@props.git_repo_root}</h2>
            <Row>
                <Col sm=6>
                    {@render_status()}
                </Col>
                <Col sm=6>
                    {@render_diff()}
                </Col>
            </Row>
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