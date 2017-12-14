{React, ReactDOM, rtypes, rclass}  = require('./smc-react')

{ProjectSettingsPanel} = require('project-settings-support')

exports.JupyterServerPanel = rclass
    displayName : 'ProjectSettings-JupyterServer'

    propTypes :
        project_id : rtypes.string.isRequired

    render_jupyter_link: ->
        <a href="/#{@props.project_id}/port/jupyter/" target='_blank'>
            Plain Jupyter Server
        </a>

    render: ->
        <ProjectSettingsPanel title='Jupyter notebook server' icon='list-alt'>
            <span style={color: '#666'}>
                The Jupyter notebook server is a Python process that runs in your
                project that provides backed support for Jupyter notebooks with
                synchronized editing and TimeTravel.   You can also just
                use your Jupyter notebook directly via the link below.
                This does not support multiple users or TimeTravel.
            </span>
            <div style={textAlign:'center', fontSize:'14pt', margin: '15px'}>
                {@render_jupyter_link()}
            </div>
            <span style={color: '#666'}>
                <b>
                (The first time you click the above link it <i>will probably fail</i>; refresh and try again.)
                </b>
            </span>
        </ProjectSettingsPanel>
