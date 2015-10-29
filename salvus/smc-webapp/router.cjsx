{rclass, React, ReactDOM} = require('r')

{Router, Route, Link} = require('react-router')

# Then we delete a bunch of code from App and
# add some <Link> elements...
App = rclass
    render : ->
        <div>
            <h1>App</h1>
            <ul>
                <li><Link to="/about">About</Link></li>
                <li><Link to="/inbox">Inbox</Link></li>
            </ul>
            {this.props.children}
        </div>

About = rclass
    render : ->
        <div>About</div>

Inbox = rclass
    render : ->
        <div>Inboxt</div>

page = <Router>
        <Route path="/" component={App}>
            <Route path="about" component={About} />
            <Route path="inbox" component={Inbox} />
        </Route>
    </Router>

ReactDOM.render(page, document.body)