# 3rd Party Libraries
{Alert, Button} = require('react-bootstrap')

# Internal & React Libraries
{React, rclass, rtypes} = require('./app-framework')
{Icon} = require('./r_misc')

alert_style =
    marginBottom : 0
    fontSize     : '13pt'

exports.DiskSpaceWarning = rclass ({name}) ->
    displayName : 'DiskSpaceWarning'

    reduxProps :
        projects :
            project_map              : rtypes.immutable.Map
            get_total_project_quotas : rtypes.func

    propTypes :
        project_id : rtypes.string

    shouldComponentUpdate: (nextProps) ->
        return @props.project_map?.get(@props.project_id) != nextProps.project_map?.get(nextProps.project_id)

    render: ->
        if not require('./customize').commercial
            return null
        quotas = @props.get_total_project_quotas(@props.project_id)
        project_status = @props.project_map?.get(@props.project_id)?.get('status')
        if not quotas?.disk_quota? or not project_status?
            return null
        else
            disk = Math.ceil(project_status.get('disk_MB') ? 0)
        if quotas.disk_quota - 5 > disk
            return null

        <Alert bsStyle='danger' style={alert_style}>
            <Icon name='exclamation-triangle' /> WARNING: This project is running out of disk space. Please increase the quota in <a onClick={=>@actions(project_id: @props.project_id).set_active_tab('settings')} style={cursor:'pointer'}>settings</a> or delete some files.
        </Alert>


exports.RamWarning = rclass ({name}) ->
    displayName : 'RAMWarning'

    reduxProps :
        projects :
            project_map              : rtypes.immutable.Map

    propTypes :
        project_id : rtypes.string

    shouldComponentUpdate: (nextProps) ->
        return @props.project_map?.get(@props.project_id) != nextProps.project_map?.get(nextProps.project_id)

    render: ->
        if not require('./customize').commercial
            return <span />
        project_status = @props.project_map?.get(@props.project_id)?.get('status')
        if not project_status?
            return <span />

        rss = project_status.get('memory')?.get('rss')
        limit = project_status.get('memory')?.get('limit')
        if not rss or not limit
            return <span />

        rss_mb   = Math.round(rss/1000)
        limit_mb = Math.round(limit/1000)
        if limit_mb > rss_mb + 100
            return <span />

        <Alert bsStyle='danger' style={alert_style}>
            <Icon name='exclamation-triangle' /> WARNING: This project is running low on memory.{' '}
            Upgrade Shared RAM memory in <a onClick={=>@actions(project_id: @props.project_id).set_active_tab('settings')} style={cursor:'pointer'}>settings</a>,{' '}
            restart your project or kill some processes.{' '}
            (<a href={'https://github.com/sagemathinc/cocalc/wiki/My-Project-Is-Running-Out-of-Memory'} target={'_blank'} style={cursor:'pointer'}>more information</a>; memory usage is updated about once per minute.)
        </Alert>