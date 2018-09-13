{React, rtypes, rclass}  = require('../app-framework')

{ProjectSettingsPanel} = require('./project-settings-support')

{Icon} = require('../r_misc')

{jupyter_server_url} = require('../editor_jupyter')

{LinkRetryUntilSuccess} = require('../widgets-misc/link-retry')

exports.JupyterServerPanel = rclass
    displayName : 'ProjectSettings-JupyterServer'

    propTypes :
        project_id : rtypes.string.isRequired

    render_jupyter_link: ->
        url = jupyter_server_url(@props.project_id)
        <LinkRetryUntilSuccess href={url}>
            <Icon name='cc-icon-ipynb' /> Plain Jupyter Server
        </LinkRetryUntilSuccess>

    render: ->
        <ProjectSettingsPanel title='Jupyter notebook server' icon='list-alt'>
            <span style={color: '#444'}>
                The Jupyter notebook server runs in your
                project and provides support for classical Jupyter notebooks.
                You can also use the plain classical Jupyter notebook server directly via the link below.
                This does not support multiple users or TimeTravel, but fully supports all classical Jupyter
                notebook features and extensions.

                <br/><br/>
                Click the link below to start your Jupyter notebook server and open it in a new browser tab.
            </span>
            <div style={textAlign:'center', fontSize:'14pt', margin: '15px'}>
                {@render_jupyter_link()}
            </div>
        </ProjectSettingsPanel>

