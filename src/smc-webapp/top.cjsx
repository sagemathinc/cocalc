{React, ReactDOM, rclass} = require('./smc-react')

$('body').append('<div class="page-container smc-react-container"></div>')

Page = rclass
    displayName : "Page"
    render : ->
        <h1>CoCalc</h1>

page = <Page/>        

ReactDOM.render(page, $(".smc-react-container")[0])