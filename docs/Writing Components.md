## `rclass`

### Normal Usage
Just use as if your object was being passed to `React.createClass()`

### Enhanced Usage
However, it can also be passed a function which takes in properties only known at runtime. This allows you to do things like pass in names of stores which are generated at run time.
```coffee
ProjectPage = rclass ({project_store_name, another_store_name}) ->
    reduxProps:
        "#{project_store_name}"
            active_tab : rtypes.string
            open_files : rtypes.immutable
        "#{another_store_name}"
            first_name : rtypes.string
            last_name  : rtypes.string

    propTypes:
        project_id : rtypes.string

    render: ->
        <p>Example!</p>

ReactDOM.render(<ProjectPage project_store_name={name} another_store_name={other_name} project_id={project_id})
```
