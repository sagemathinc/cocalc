{rclass, React, ReactDOM} = require('./smc-react')
{Button} = require('react-bootstrap')
{LinkContainer} = require('react-router-bootstrap')

{Router, Route, Link} = require('react-router')

# Then we delete a bunch of code from App and
# add some <Link> elements...
App = rclass
    getInitialState : ->
        projects : []

    project_link : (id) ->
        <LinkContainer to="/projects/#{id}" key={id}>
            <Button>Project {id}</Button>
        </LinkContainer>

    render : ->
        <div>
            <h1>App</h1>
            <Button onClick={=>@setState(projects : @state.projects.concat(@state.projects.length))}>Add new project</Button>
            {(@project_link(id) for id in @state.projects)}
            {this.props.children}
        </div>

Project = rclass
    getInitialState : ->
        files : []

    file_link : (id) ->
        <LinkContainer to="#{id}" key={id}>
            <Button>File {id}</Button>
        </LinkContainer>

    render : ->
        console.log(@props.params.projectid, @state.files)
        <div>
            <div>This is project {@props.params.projectid}</div>
            <Button onClick={=>@setState(files : @state.files.concat(@state.files.length))}>Open a new file</Button>
            {(@file_link(id) for id in @state.files)}
        </div>

File = rclass
    render : ->
        <div>This is file {@props.params.fileid}</div>

page = <Router>
        <Route path="/" component={App}>
            <Route path="projects/:projectid" component={Project}>
                <Route path=":fileid" component={File} />
            </Route>
        </Route>
    </Router>

ReactDOM.render(page, document.body)