# standard non-SMC libraries
immutable = require('immutable')

# SMC libraries
misc = require('smc-util/misc')
{defaults, required} = misc
{salvus_client} = require('../salvus_client')
schema = require('smc-util/schema')

# React libraries and Components
{React, rclass, rtypes, ReactDOM}  = require('../smc-react')
{Alert, Button, ButtonToolbar, ButtonGroup, Row, Col,
    Panel, Well, FormGroup, FormControl, Checkbox} = require('react-bootstrap')

# SMC Components
{Calendar, Icon, LabeledRow, Loading, MarkdownInput, NoUpgrades
     Space, TextInput, TimeAgo, Tip, UPGRADE_ERROR_STYLE} = require('../r_misc')

{PROJECT_UPGRADES} = require('smc-util/schema')

StudentRow = rclass
    render: ->
        <div>
            {#some columns with check boxes}
        </div>

AdjustorHeader = rclass
    render: -.
        <div>
        </div>

exports.UpgradeAdjustor = rclass
    render: ->
        <Well>
        </Well>