{React, rtypes, rclass}  = require('../app-framework')

{Loading, Space} = require('../r_misc')

misc = require('smc-util/misc')

exports.LinkRetryUntilSuccess = rclass
    displayName : 'LinkRetryUntilSuccess'

    propTypes :
        href   : rtypes.string.isRequired

    getInitialState: ->
        working : false
        loading : false
        error   : false

    open: ->
        # open_new_tab takes care of blocked popups -- https://github.com/sagemathinc/cocalc/issues/2599
        {open_new_tab} = require('smc-webapp/misc_page')
        open_new_tab(@props.href)

    start: ->
        @setState(loading:true, error:false)
        misc.retry_until_success
            f : (cb) =>
                x = $.ajax
                    url     : @props.href
                    timeout : 3000
                x.done(-> cb())
                x.fail(-> cb('fail'))
            max_delay: 1000
            max_time : 30000
            cb : (err) =>
                if err
                    @setState(error:true, loading:false, working:false)
                else
                    @open()
                    @setState(error:false, loading:false, working:true)

    click: ->
        if @state.working
            @open()
        else if not @state.loading
            @start()

    render_loading: ->
        if @state.loading
            <span>
                <Space/> <Loading />
            </span>

    render_error: ->
        if @state.error
            <span style={color:'darkred'}><Space/> (failed to load) </span>

    render_link: ->
        <a onClick={@click} style={cursor:'pointer'}>
            {@props.children}
        </a>

    render : ->
        <span>
            {@render_link()}
            {@render_loading()}
            {@render_error()}
        </span>
