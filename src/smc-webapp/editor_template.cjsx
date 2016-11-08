###
This is a TEMPLATE for making new editors.  Copy this file to editor_type.cjsx,
and also copy the template-related entries in editor.coffee.

Test this by making a file that ends with .sage-template.

FUTURE:

  - show how to open a syncstring file
  - show how to connect to a syncdb database backed by the file, so store is sync'd across users of the file
  - eliminate as much boilerplate as possible
  - make it so requiring this file sets any hooks in editor.coffee, so that editor.coffee doesn't have to edited at all!

###


# The immutable.js library, which is used to store data.
immutable = require('immutable')

# React bootstrap widgets.
{Button, FormControl, FormGroup, Panel, Row, Col} = require('react-bootstrap')

# Hooking into SMC's react support.
{React, ReactDOM, rclass, rtypes, Redux, Actions, Store}  = require('./smc-react')

# Helper functions
misc = require('smc-util/misc')

# The name for redux of this editor.  This controls where in the redux store,
# which is an immutable.js map, that data about this editor is located.
redux_name = (project_id, path) ->
    return "editor-#{project_id}-#{path}"

# The Actions object
class TemplateActions extends Actions
    init: (@project_id, @filename) =>
        # Set a sample property to a default value.
        @setState(sample_property: 'foo')

    # Whenever the underlying syncdb changes (due to a change locally or by another user),
    # this funtion gets called.  The changes then get set in the redux store.
    _syncdb_change: (changes) =>
        s = s0 = @redux.getStore(@name).get('syncdb')
        for x in changes
            if x.insert?
                s = s.set(x.insert.id, immutable.fromJS(x.insert.val))
            else if x.remove?
                s = s.delete(x.remove.id)
        if s != s0
            # State actually changed, so change the store.
            @setState(syncdb: s)

    # We treat the syncdb as a key:value store.   You could do something more complicated if necessary.
    set: (id, val) =>
        @syncdb.update
            set :
                val : val
            where :
                id : id
        @syncdb.save()

# Create the redux action, store, and syncdb connection.

exports.init_redux = init_redux = (redux, project_id, filename) ->
    name = redux_name(project_id, filename)  # name of all this stuff
    if redux.getActions(name)?
        return  # already initialized

    # Create the actions for this file.
    actions = redux.createActions(name, TemplateActions)
    actions.init(project_id, filename)

    # The store
    store = redux.createStore(name)

    # Use the corresponding file on disk as a synchronized database.
    require('./syncdb').synchronized_db
        project_id    : project_id
        filename      : filename
        cb            : (err, syncdb) =>
            if err
                alert_message(type:'error', message:"unable to open #{@filename}")
            else if not syncdb.valid_data
                alert_message(type:'error', message:"json in #{@filename} is broken")
            else
                # Here we use the syncdb as a key value store.  This is NOT the only
                # way to use the syncdb; you can do anything you want with it, as it is
                # just an array of distinct Javascript objects.
                s = immutable.fromJS({})
                for x in syncdb.select()
                    s = s.set(x.id, x.val)
                actions.setState(syncdb : s)

                # Whenever the syncdb is changed, _syncdb_change is called to take
                # into account this change (in the store).
                syncdb.on('change', actions._syncdb_change)
                store.syncdb = actions.syncdb = syncdb


# This is a template for the component that includes the editor.
Template = (name) -> rclass
    reduxProps:  # the Template react component will be updated whenever syncdb or sample_propery change in the store.
        "#{name}" :
            syncdb          : rtypes.immutable
            sample_property : rtypes.string

    propTypes:
        actions : rtypes.object


    # For a demo, we render the data in the syncdb immutable map, with the keys in sorted order.
    render_syncdb: ->
        if not @props.syncdb?
            return
        v = ([id,val] for id, val of @props.syncdb.toJS())
        v.sort (a,b) -> misc.cmp(a[0], b[0])
        for x in v
            v.push <div key={"#{x[0]}"}>{x[0]} {"#{misc.to_json(x[1])}"}</div>
        return v

    # Something to allow the user to add an entry to the syncdb.
    add_entry: ->
        v = misc.split(ReactDOM.findDOMNode(@refs.input).value)
        @props.actions.set(v[0], v[1])

    render_add_entry: ->
        <div key='add'>
            <FormGroup>
                <FormControl key="input"
                    autoFocus
                    type        = 'text'
                    ref         = 'input'
                    placeholder = 'id value'
                    style       = {width:'30em'}
                />
            </FormGroup>
            <Button onClick={@add_entry}>Add Entry</Button>
        </div>

    render: ->
        <div>
            <h2>Template for an editor -- {@props.sample_property}</h2>
            <hr/>
            {@render_add_entry()}
            <hr/>
            {@render_syncdb()}
        </div>

# Actually render the editor component:
render = (redux, project_id, path) ->
    name    = redux_name(project_id, path)  # name of the store/actions
    actions = redux.getActions(name)
    Template_connected = Template(name)     # the component, but with the redux props hooked in
    # Finally create the component hooked into redux, so that it autoupdates whenever certain keys in the store change.
    <Redux redux={redux}>
        <Template_connected actions={actions} />
    </Redux>

# Boilerplate for interacting with non-React app.
exports.free = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.render = (project_id, path, dom_node, redux) ->
    init_redux(redux, project_id, path)
    ReactDOM.render(render(redux, project_id, path), dom_node)

exports.hide = (project_id, path, dom_node, redux) ->
    ReactDOM.unmountComponentAtNode(dom_node)

exports.show = (project_id, path, dom_node, redux) ->
    ReactDOM.render(render(redux, project_id, path), dom_node)