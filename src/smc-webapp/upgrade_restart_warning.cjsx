# 3rd Party Libraries
{Alert} = require('react-bootstrap')

# Internal & React Libraries
{React} = require('./smc-react')

# Sibling Libraries

exports.UpgradeRestartWarning = ({style}) ->
    <Alert style={style}>
        Adjustments to any project upgrades (except idle timeout) will restart the project. Running computations may be terminated.
    </Alert>