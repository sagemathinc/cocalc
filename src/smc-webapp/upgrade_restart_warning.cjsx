# 3rd Party Libraries
{Alert} = require('react-bootstrap')

# Internal & React Libraries
{React} = require('./smc-react')

# Sibling Libraries

exports.UpgradeRestartWarning = ({style}) ->
    <Alert style={style}>
        Removing upgrades from runnings projects will restart those projects, which will terminate any running computations.
    </Alert>