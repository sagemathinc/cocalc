# standard non-SMC libraries
immutable = require('immutable')
{ReactReorderable} = require('react-reorderable')

{React, ReactDOM, Actions, Store, Flux, rclass, rtypes} = require('./r')
{synchronized_db} = require('./syncdb')
{alert_message} = require('./alerts')
{Icon, TimeAgo} = require('./r_misc')
{Row, Col, Button, Input, ButtonToolbar, ButtonGroup} = require('react-bootstrap')
misc = require('smc-util/misc')

class TasksActions extends Actions
    setTo: (payload) =>
        payload

    _syncdb_change: (changes) =>
        m = tasks = @flux.getStore(@name).state.tasks
        for x in changes
            if x.insert
                tasks = tasks.set(x.insert.task_id, immutable.fromJS(x.insert))
            else if x.remove
                tasks = tasks.delete(x.remove.task_id)
        if m != tasks
            @setTo(tasks: tasks)

    set_task_done : (task_id, done) =>
        @syncdb.update
            set :
                done : done
            where :
                task_id : task_id
        @syncdb.save()

    set_search : (search) ->
        @setTo(search: search)

    set_selected_task : (task_id) ->
        @setTo(selected_task: task_id)

    delete_task : (task_id) ->
        @syncdb.update
            set :
                deleted : true
            where :
                task_id : task_id
        @syncdb.save()

    undelete_task : (task_id) ->
        @syncdb.update
            set :
                deleted : undefined
            where :
                task_id : task_id
        @syncdb.save()

class TasksStore extends Store
    _init: (flux) =>
        ActionIds = flux.getActionIds(@name)
        @register(ActionIds.setTo, @setState)
        @state =
            tasks : immutable.fromJS({})
            search : ''

exports.init_flux = init_flux = (flux, project_id, filename) ->
    name = flux_name(project_id, filename)
    if flux.getActions(name)?
        return  # already initialized
    actions = flux.createActions(name, TasksActions)
    store   = flux.createStore(name, TasksStore)
    store._init(flux)
    synchronized_db
        project_id : project_id
        filename   : filename
        sync_interval : 0
        cb         : (err, syncdb) ->
            if err
                alert_message(type:'error', message:"unable to open #{@filename}")
            else
                v = {}
                for x in syncdb.select()
                    v[x.task_id] = x
                store.setState(tasks : immutable.fromJS(v))
                syncdb.on('change', actions._syncdb_change)
                store.syncdb = actions.syncdb = syncdb

flux_name = (project_id, path) ->
    return 'editor-#{project_id}-#{path}'

task_item_styles =
    padding: '1ex 0 0 1ex'
    border: '2px solid transparent'
    borderRadius: '1ex'
    width: '99%'
    marginLeft: 0
    marginRight: 0

selected_task_item_styles =
    padding: '1ex 0 0 1ex'
    borderRadius: '1ex'
    width: '99%'
    marginLeft: 0
    marginRight: 0
    border: '2px solid #08c'
    backgroundColor: '#e8f2ff'

reorder_styles =
    fontSize: '17pt'
    color: '#888'
    marginRight: '6px'

ReorderHandle = () ->
    <Icon name='reorder' style={reorder_styles} />

DoneCheckbox = ({checked, actions, task_id}) ->
    check_box = () ->
        value = if checked then undefined else (new Date() - 0)
        actions.set_task_done(task_id, value)
    if checked
        name = 'check-square-o'
    else
        name = 'square-o'

    <span onClick={check_box}>
        <Icon name={name} style={fontSize: '17pt', color: '#888'} />
    </span>

UndeleteTaskButton = ({task, actions}) ->
    <Button bsSize='small' onClick={=>actions.undelete_task(task.get('task_id'))} bsStyle='danger'>
        <Icon name='trash' /> Undelete
    </Button>

TaskDescription = ({desc}) ->
    <div>{desc}</div>

TaskDueDate = ({due}) ->
    if due?
        <div>{due}</div>
    else
        <div>none</div>

TimeLastEdited = ({last_edited}) ->
    <TimeAgo date={last_edited} style={fontSize: '10pt', color: '#888'}/>

TaskItem = ({task, selected, actions}) ->
    <Row style={if selected then selected_task_item_styles else task_item_styles} onClick={=>actions.setTo(selected_task: task.get('task_id'))}>
        <Col sm=1>
            <ReorderHandle />
            <DoneCheckbox checked={task.get('done')} actions={actions} task_id={task.get('task_id')} />
            {<UndeleteTaskButton task={task} actions={actions} /> if task.get('deleted')}
        </Col>
        <Col sm=9>
            <TaskDescription desc={task.get('desc')} />
        </Col>
        <Col sm=1>
            <TaskDueDate due={task.get('due')} />
        </Col>
        <Col sm=1>
            <TimeLastEdited last_edited={task.get('last_edited')} />
        </Col>
    </Row>

TaskList = ({tasks, selected_task, actions}) ->
    display_tasks = ->
        items = []
        tasks.forEach (task, id) ->
            items.push(<TaskItem task={task} selected={selected_task==id} actions={actions} />)
        items

    <div>{display_tasks()}</div>

TaskSearch = rclass
    clear_and_focus_input : ->
        @props.actions.setTo(search : '')
        @refs.tasks_search.getInputDOMNode().focus()

    delete_search_button : ->
        <Button onClick={@clear_and_focus_input}>
            <Icon name='times-circle' />
        </Button>

    edit_first_task : ->
        console.log('TODO: edit first task on search submit')

    render : ->
        <form onSubmit={@edit_first_task}>
            <Input
                ref         = 'tasks_search'
                autoFocus
                type        = 'search'
                value       =  @props.search
                placeholder = 'Find task...'
                onChange    = {=>@props.actions.setTo(search : @refs.tasks_search.getValue())}
                buttonAfter = {@delete_search_button()} />
        </form>

InclusionButtonsList = ({include_done, include_deleted, actions}) ->
    toggleDone = () ->
        actions.setTo('include_done' : not include_done)
    toggleDeleted = () ->
        actions.setTo('include_deleted' : not include_deleted)
    # TODO: Style correctly
    <div>
        Include: <CheckedButton checked={include_done} onClick={toggleDone}>Done</CheckedButton>
        <CheckedButton checked={include_deleted} onClick={toggleDeleted}>Deleted</CheckedButton>
    </div>

CheckedButton = ({children, checked, onClick}) ->
    if checked
        name = 'check-square-o'
    else
        name = 'square-o'

    <Button onClick={onClick}>
        <Icon name={name} /> {children}
    </Button>

DescribeQuery = ({tasks, search, include_done, include_deleted}) ->
    desc = "Showing #{tasks.size} #{misc.plural(tasks.size, 'task')}."

    if search
        desc += " Only showing tasks that contain #{search}."
    if include_deleted and include_done
        desc += ' Including deleted tasks and completed tasks.'
    else if include_deleted
        desc += ' Including deleted tasks.'
    else if include_done
        desc += ' Including completed tasks.'
    else
        desc += ' Excluding all deleted and completed tasks.'
    <span>{desc}</span>

TasksTop = ({tasks, search, include_done, include_deleted, actions}) ->
    <Row>
        <Col sm=4>
            <TaskSearch search={search} actions={actions} />
        </Col>
       <Col sm=3>
            <InclusionButtonsList include_done={include_done} include_deleted={include_deleted} actions={actions}/>
        </Col>
        <Col sm=5>
            <DescribeQuery tasks={tasks} search={search} include_done={include_done} include_deleted={include_deleted} />
        </Col>
    </Row>

OrderByDue = () ->
    <div>Order by due</div>

OrderByLastEdited = () ->
    <div>Order by last edited</div>

TasksButtons = ({tasks, selected_task, actions}) ->
    <Row>
        <Col sm=6>
            <ButtonToolbar>
                <ButtonGroup>
                    <Button><Icon name='plus-circle' /> New</Button>
                    <Button><Icon name='hand-o-up' /></Button>
                    <Button><Icon name='hand-o-down' /></Button>
                    <Button onClick={=>actions.delete_task(selected_task)} bsStyle='danger'><Icon name='trash' /></Button>
                </ButtonGroup>
                <ButtonGroup>
                    <Button bsStyle='success'><Icon name='save' /> Save</Button>
                    <Button bsStyle='info'><Icon name='question-circle' /> Help</Button>
                </ButtonGroup>
            </ButtonToolbar>
        </Col>
        <Col smOffset=4 sm=1>
            <OrderByDue />
        </Col>
        <Col sm=1>
            <OrderByLastEdited />
        </Col>
    </Row>

Tasks = ({tasks, selected_task, search, include_done, include_deleted, actions}) ->
    filter_tasks = (tasks) ->
        split = misc.search_split(search)
        tasks.filter (task) ->
            misc.search_match(task.get('desc'), split) and
            (include_deleted or not task.get('deleted')) and
            (include_done or not task.get('done'))
    filtered_tasks = filter_tasks(tasks)
    <div>
        <TasksTop tasks={filtered_tasks} search={search} actions={actions} include_done={include_done} include_deleted={include_deleted} />
        <TasksButtons tasks={filtered_tasks} selected_task={selected_task} actions={actions} />
        <TaskList tasks={filtered_tasks} selected_task={selected_task} actions={actions} />
    </div>

render = (flux, project_id, path) ->
    name = flux_name(project_id, path)
    actions = flux.getActions(name)
    connect_to =
        tasks : name
        selected_task : name
        search : name
        include_done : name
        include_deleted : name


    <Flux flux={flux} connect_to={connect_to}>
        <Tasks actions={actions} />
    </Flux>

exports.free = (project_id, path, dom_node, flux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, flux) ->
    init_flux(flux, project_id, path)
    ReactDOM.render(render(flux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, flux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, flux) ->
    ReactDOM.render(render(flux, project_id, path), dom_node)