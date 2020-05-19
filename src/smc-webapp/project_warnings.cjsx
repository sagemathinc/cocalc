#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

# 3rd Party Libraries
{Alert, Button} = require('react-bootstrap')

# Internal & React Libraries
{React, rclass, rtypes} = require('./app-framework')
{Icon} = require('./r_misc')
misc = require('smc-util/misc')
LS = require('misc/local-storage')

OOM_INFO_PAGE = 'https://doc.cocalc.com/howto/low-memory.html'

# alert style, and derived oom alert style. we want to make sure we do not change one of them accidentally...
alert_style = Object.freeze(
    marginBottom : 0
    fontSize     : '13pt'
)

oom_alert_style = Object.freeze(Object.assign({}, alert_style, {fontSize : '11pt', padding : '15px'}))


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
            (<a href={OOM_INFO_PAGE} target={'_blank'} style={cursor:'pointer'}>more information</a>; memory usage is updated about once per minute.)
        </Alert>


# to test this, set the oom_kills value for your dev project directly in the DB:
# 1. reset:         UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '0'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
# 2. single event:  UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '1'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
# 3. several more:  UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '5'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
# 4. reset:         UPDATE projects SET status = jsonb_set(status, '{oom_kills}', '0'::JSONB) WHERE project_id='  ... UUID of your cc-in-cc project ... ';
exports.OOMWarning = rclass ({name}) ->
    displayName : 'OOMWarning'

    reduxProps :
        projects :
            project_map              : rtypes.immutable.Map

    getInitialState: ->
        val = LS.get([@props.project_id, 'oom_dismissed']) ? 0
        deflt =
            oom_dismissed : 0
            start_ts : undefined
        try
            if val.indexOf(':') == -1
                return deflt
            [start_ts, oom_dismissed] = val.split(':')
            return
                start_ts      : Number.parseInt(start_ts)
                oom_dismissed : Number.parseInt(oom_dismissed)
        catch
            return deflt

    propTypes :
        project_id : rtypes.string

    shouldComponentUpdate: (nextProps, state) ->
        return @props.project_map?.get(@props.project_id) != nextProps.project_map?.get(nextProps.project_id) \
            or misc.is_different(@state, state, ['oom_dismissed', 'start_ts'])

    click: (start_ts, oom_kills) ->
        val = "#{start_ts}:#{oom_kills}"
        LS.set([@props.project_id, 'oom_dismissed'], val)
        @setState(oom_dismissed : oom_kills, 'start_ts': start_ts)

    render: ->
        if not require('./customize').commercial
            return <span />
        project = @props.project_map?.get(@props.project_id)
        project_state = project?.get('state')?.get('state')
        if project_state != 'running'
            return <span />
        project_status = project?.get('status')
        if not project_status?
            return <span />
        oom_kills = project_status.get('oom_kills') ? 0
        start_ts = project_status.get('start_ts')

        # if DEBUG then console.log("oom_kills: #{oom_kills}, oom_dismissed: #{@state.oom_dismissed}")

        # either if there is no dismissed start_ts or it matches the current one
        if (oom_kills == 0) or (@state.start_ts != null and @state.start_ts == start_ts)
            # and the number of oom kills is less or equal the number of dismissed ones
            if oom_kills <= @state.oom_dismissed
                return <span />
        if @state.start_ts != start_ts
            oom_dismissed = 0
        else
            oom_dismissed = @state.oom_dismissed

        # first time message is different from later ones
        if oom_dismissed == 0
            if oom_kills > 1
                msg = <span>WARNING: Several programs in your project just crashed because they ran out of memory.</span>
            else
                msg = <span>WARNING: A program in your project just crashed because it ran out of memory.</span>
            style = 'info'
        else
            diff = oom_kills - oom_dismissed
            msg = <span>WARNING: Another program in your project has crashed because it ran out of memory.</span>
            style = 'danger'

        <Alert bsStyle={style} style={oom_alert_style}>
            <div style={display: 'flex'}>
                <div style={flex:'1'}>
                    <Icon name='exclamation-triangle' /> {msg}{' '}
                    You may want to try{' '}
                    <a href={OOM_INFO_PAGE} target={'_blank'} style={cursor:'pointer'}>some common solutions</a> to avoid this.
                </div>
                <div style={flex:'0'}>
                    <Button onClick={=>@click(start_ts, oom_kills)} pullright={"true"}>Dismiss</Button>
                </div>
            </div>
        </Alert>
