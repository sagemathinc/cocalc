{React, ReactDOM, rclass, redux, rtypes, Redux} = require('./smc-react')

ProjectPage = rclass

    reduxProps :
        projects :
            project_map : rtypes.immutable

    propTypes :
        redux      : rtypes.object
        project_id : rtypes.string.isRequired

    render : ->
        # The following is just for testing!
        <div>
            <h1>{@props.project_map.get(@props.project_id).get('title')}</h1>
            <h2>{@props.project_map.get(@props.project_id).get('description')}</h2>
        </div>


exports.ProjectPage = rclass
    displayName : 'Projects-ProjectPage'

    propTypes :
        project_id : rtypes.string.isRequired

    render : ->
        <Redux redux={redux}>
            <ProjectPage redux={redux} project_id={@props.project_id} />
        </Redux>
