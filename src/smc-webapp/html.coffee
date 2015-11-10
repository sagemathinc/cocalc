###
This module loads the static html which gets progressively refined/used as
templated by jQuery and sticks it at the bottom of the body of the document on load.

TODO: This and all of the HTML loaded below will GO AWAY with the react.js rewrite!
###

html = require('./top_navbar.html') + require('./account.html') + require('./misc_page.html') + require('./alerts.html') + require('./help.html') + require('./console.html') + require('./projects.html') + require('./project.html') + require('./editor.html') + require('./tasks.html') + require('./jupyter.html') + require('./interact.html') + require('./3d.html') + require('./d3.html')

# Page container is for https://github.com/jschr/bootstrap-modal, which of course will go away...
html = '<div class="page-container">' + html + '</div>'

$('body').append(html)
