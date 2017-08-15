# 3rd Party Libraries
{Alert} = require('react-bootstrap')

# Internal & React Libraries
{React} = require('./smc-react')

# Sibling Libraries

exports.UpgradeRestartWarning = ({style}) ->
    <Alert style={style}>
        Adjustments to a project's upgrades will restart the project. Running computations will be terminated.
    </Alert>