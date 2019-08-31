# 3rd Party Libraries
{Alert} = require('react-bootstrap')

# Internal & React Libraries
{React} = require('./app-framework')

# Sibling Libraries

exports.UpgradeRestartWarning = ({style}) ->
    <Alert style={style}>
        WARNING: Adjusting project upgrades <b>will restart</b> that project, which will terminate running computations.
    </Alert>