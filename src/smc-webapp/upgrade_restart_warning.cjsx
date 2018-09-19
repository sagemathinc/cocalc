# 3rd Party Libraries
{Alert} = require('react-bootstrap')

# Internal & React Libraries
{React} = require('./app-framework')

# Sibling Libraries

exports.UpgradeRestartWarning = ({style}) ->
    <Alert style={style}>
        WARNING: Adjusting upgrades <b>will restart</b> this project, which will terminate running computations.
    </Alert>