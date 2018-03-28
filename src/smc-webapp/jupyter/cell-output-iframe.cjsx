###
Handle iframe output messages involving a srcdoc.
###

{React, ReactDOM, rclass, rtypes}  = require('../smc-react')

{get_blob_url} = require('./server-urls')
{Icon} = require('../r_misc')
{Button} = require('react-bootstrap')

exports.IFrame = rclass
    propTypes:
        sha1       : rtypes.string
        project_id : rtypes.string

    getInitialState: ->
        attempts : 0
        show     : false

    componentDidMount: ->
        @_is_mounted = true

    componentWillUnmount: ->
        @_is_mounted = false

    load_error: ->
        if @state.attempts < 5 and @_is_mounted
            f = =>
                if @_is_mounted
                    @setState(attempts : @state.attempts + 1)
            setTimeout(f, 500)

    render_iframe: ->
        src = get_blob_url(@props.project_id, 'html', @props.sha1) + "&attempts=#{@state.attempts}"
        <iframe
            src     = {src}
            onError = {@load_error}
            width   = '100%'
            height  = '500px'
            style   = {border:0}
            />

    render: ->
        if @state.show
            return @render_iframe()
        else
            <Button onClick={=>@setState(show:true)} bsStyle = "info">
                <Icon name='cube'/> Load Viewer...
            </Button>


