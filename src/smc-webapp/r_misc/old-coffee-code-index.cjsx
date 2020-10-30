#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

async = require('async')

{Component, React, ReactDOM, rclass, rtypes, is_redux, is_redux_actions, redux, Store, Actions, Redux} = require('../app-framework')
{Alert, Button, ButtonToolbar, Checkbox, Col, FormControl, FormGroup, ControlLabel, InputGroup, Overlay, OverlayTrigger, Modal, Tooltip, Row, Well} = require('react-bootstrap')
{HelpEmailLink, SiteName, CompanyName, PricingUrl, PolicyTOSPageUrl, PolicyIndexPageUrl, PolicyPricingPageUrl} = require('../customize')
{UpgradeRestartWarning} = require('../upgrade-restart-warning')
{reportException} = require('../../webapp-lib/webapp-error-reporter')
{PROJECT_UPGRADES} = require('smc-util/schema')

{A} = require('./A')
{Icon} = require('./icon')
{Tip} = require('./tip')
{Loading} = require('./loading')
{r_join} = require('./r_join')
{Space} = require('./space')
{CloseX} = require('./close-x')
{CloseX2} = require('./close-x2')
{SimpleX} = require('./simple-x')
{Saving} = require('./saving')
{Spinner} = require('./spinner')
{ErrorDisplay} = require('./error-display')
{SkinnyError} = require('./skinny-error')
{SelectorInput} = require('./selector-input')
{TextInput} = require("./text-input")
{NumberInput} = require("./number-input")
{LabeledRow} = require('./labeled-row')
{TimeElapsed} = require('./time-elapsed')
{TimeAgo} = require('./time-ago')

share_server = require('./share-server');

# injected by webpack, but not for react-static renderings (ATTN don't assign to uppercase vars!)
exports.smc_version = smc_version = SMC_VERSION ? 'N/A'
exports.build_date  = build_date  = BUILD_DATE  ? 'N/A'
exports.smc_git_rev = smc_git_rev = SMC_GIT_REV ? 'N/A'

misc        = require('smc-util/misc')
theme       = require('smc-util/theme')
immutable   = require('immutable')
underscore  = require('underscore')

markdown    = require('../markdown')
feature     = require('../feature')

{defaults, required} = misc

exports.HTML = HTML = rclass
    displayName : 'Misc-HTML' # this name is assumed and USED in the smc-hub/share/mathjax-support to identify this component; do NOT change!

    propTypes :
        value            : rtypes.string
        style            : rtypes.object
        auto_render_math : rtypes.bool     # optional -- used to detect and render math
        project_id       : rtypes.string   # optional -- can be used to improve link handling (e.g., to images)
        file_path        : rtypes.string   # optional -- ...
        className        : rtypes.string   # optional class
        safeHTML         : rtypes.bool     # optional -- default true, if true scripts and unsafe attributes are removed from sanitized html
                                           # WARNING!!! ATTN!  This does not work.  scripts will NEVER be run.  See
                                           # commit 1abcd43bd5fff811b5ffaf7c76cb86a0ad494498, which I've reverted, since it breaks
                                           # katex... and on balance if we can get by with other approaches to this problem we should
                                           # since script is dangerous.  See also https://github.com/sagemathinc/cocalc/issues/4695
        href_transform   : rtypes.func     # optional function that link/src hrefs are fed through
        post_hook        : rtypes.func     # optional function post_hook(elt), which should mutate elt, where elt is
                                           # the jQuery wrapped set that is created (and discarded!) in the course of
                                           # sanitizing input.  Use this as an opportunity to modify the HTML structure
                                           # before it is exported to text and given to react.   Obviously, you can't
                                           # install click handlers here.
        highlight        : rtypes.immutable.Set
        content_editable : rtypes.bool     # if true, makes rendered HTML contenteditable
        reload_images    : rtypes.bool     # if true, after any update to component, force reloading of all images.
        smc_image_scaling : rtypes.bool    # if true, after rendering run the smc_image_scaling pluging to handle smc-image-scaling= attributes, which
                                           # are used in smc_sagews to rescale certain png images produced by other kernels (e.g., the R kernel).
                                           # See https://github.com/sagemathinc/cocalc/issues/4421.  This functionality is NOT actually used at all right now,
                                           # since it doesn't work on the share server anyways...
        highlight_code   : rtypes.bool     # if true, highlight some <code class='language-r'> </code> blocks.  See misc_page for how tiny this is!
        id               : rtypes.string
        mathjax_selector : rtypes.string   # if given, only run mathjax on result of jquery select with this selector and never use katex.
        onClick          : rtypes.func

    getDefaultProps: ->
        auto_render_math : true
        safeHTML         : true

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['value', 'auto_render_math', 'highlight', 'safeHTML', \
                 'reload_images', 'smc_image_scaling', 'highlight_code']) or \
               not underscore.isEqual(@props.style, next.style)

    _update_mathjax: ->
        if not @_is_mounted  # see https://github.com/sagemathinc/cocalc/issues/1689
            return
        if not @props.auto_render_math
            return
        $(ReactDOM.findDOMNode(@)).katex()

    _update_highlight: ->
        if not @_is_mounted or not @props.highlight?
            return
        # Use jquery-highlight, which is a pretty serious walk of the DOM tree, etc.
        $(ReactDOM.findDOMNode(@)).highlight(@props.highlight.toJS())

    _update_links: ->
        if not @_is_mounted
            return
        $(ReactDOM.findDOMNode(@)).process_smc_links
            project_id     : @props.project_id
            file_path      : @props.file_path
            href_transform : @props.href_transform

    _update_tables: ->
        if not @_is_mounted
            return
        $(ReactDOM.findDOMNode(@)).find("table").addClass('table')

    _update_images: ->
        if @_is_mounted
            if @props.reload_images
                $(ReactDOM.findDOMNode(@)).reload_images()
            if @props.smc_image_scaling
                $(ReactDOM.findDOMNode(@)).smc_image_scaling()

    _update_code: ->
        if @_is_mounted and @props.highlight_code
            $(ReactDOM.findDOMNode(@)).highlight_code()

    _do_updates: ->
        if share_server.SHARE_SERVER
            return
        @_update_mathjax()
        @_update_links()
        @_update_tables()
        @_update_highlight()
        @_update_code()
        @_update_images()

    update_content: ->
        if not @_is_mounted
            return
        @_do_updates()

    componentDidUpdate: ->
        @update_content()

    componentDidMount: ->
        @_is_mounted = true
        @update_content()

    componentWillUnmount: ->
        # see https://facebook.github.io/react/blog/2015/12/16/ismounted-antipattern.html
        # and https://github.com/sagemathinc/cocalc/issues/1689
        @_is_mounted = false

    render_html: ->
        if not @props.value
            return {__html: ''}

        if share_server.SHARE_SERVER
            # No sanitization at all for share server.  For now we
            # have set things up so that the share server is served
            # from a different subdomain and user can't sign into it,
            # so XSS is not an issue.  Note that the sanitizing
            # in the else below is quite expensive and often crashes
            # on "big" documents (e.g., 500K).
            {jQuery} = require('smc-webapp/jquery-plugins/katex')  # ensure have plugin here.
            elt = jQuery("<div>")
            elt.html(@props.value)
            if @props.auto_render_math
                elt.katex()
            elt.find("table").addClass("table")
            if @props.highlight_code
                elt.highlight_code()
            html = elt.html()
        else
            if @props.safeHTML
                html = require('../misc_page').sanitize_html_safe(@props.value, @props.post_hook)
            else
                html = require('../misc_page').sanitize_html(@props.value, true, true, @props.post_hook)

        return {__html: html}

    render: ->
        # the random key is the whole span (hence the html) does get rendered whenever
        # this component is updated.  Otherwise, it will NOT re-render except when the value changes.
        if @props.content_editable
            <div
                id                      = {@props.id}
                contentEditable         = {true}
                key                     = {Math.random()}
                className               = {@props.className}
                dangerouslySetInnerHTML = {@render_html()}
                style                   = {@props.style}
                onClick                 = {@props.onClick}
                onDoubleClick           = {@props.onDoubleClick}
                >
            </div>
        else
            <span
                id                      = {@props.id}
                key                     = {Math.random()}
                className               = {@props.className}
                dangerouslySetInnerHTML = {@render_html()}
                style                   = {@props.style}
                onClick                 = {@props.onClick}
                onDoubleClick           = {@props.onDoubleClick}
                >
            </span>

exports.Markdown = rclass
    displayName : 'Misc-Markdown'

    propTypes :
        value            : rtypes.string
        style            : rtypes.object
        project_id       : rtypes.string   # optional -- can be used to improve link handling (e.g., to images)
        file_path        : rtypes.string   # optional -- ...
        className        : rtypes.string   # optional class
        safeHTML         : rtypes.bool     # optional -- default true, if true scripts and unsafe attributes are removed from sanitized html

        href_transform   : rtypes.func     # optional function used to first transform href target strings
        post_hook        : rtypes.func     # see docs to HTML
        highlight        : rtypes.immutable.Set
        content_editable : rtypes.bool     # if true, makes rendered Markdown contenteditable
        id               : rtypes.string
        reload_images    : rtypes.bool
        smc_image_scaling: rtypes.bool
        highlight_code   : rtypes.bool
        onClick          : rtypes.func
        onDoubleClick          : rtypes.func
        line_numbers : rtypes.bool   # injects data attributes with line numbers to enable reverse search

    getDefaultProps: ->
        safeHTML         : true

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['value', 'highlight', 'safeHTML',  \
                    'checkboxes', 'reload_images', 'smc_image_scaling', 'highlight_code']) or \
               not underscore.isEqual(@props.style, next.style)

    to_html: ->
        if not @props.value
            return
        return markdown.markdown_to_html(@props.value, {line_numbers:@props.line_numbers})

    render: ->
        <HTML
            id               = {@props.id}
            auto_render_math = {true}
            value            = {@to_html()}
            style            = {@props.style}
            project_id       = {@props.project_id}
            file_path        = {@props.file_path}
            className        = {@props.className}
            href_transform   = {@props.href_transform}
            post_hook        = {@props.post_hook}
            highlight        = {@props.highlight}
            safeHTML         = {@props.safeHTML}
            reload_images    = {@props.reload_images}
            smc_image_scaling= {@props.smc_image_scaling}
            highlight_code   = {@props.highlight_code}
            content_editable = {@props.content_editable}
            onClick          = {@props.onClick}
            onDoubleClick    = {@props.onDoubleClick}
            />


# Error boundry. Pass components in as children to create one.
# https://reactjs.org/blog/2017/07/26/error-handling-in-react-16.html
exports.ErrorBoundary = rclass
    displayName: 'Error-Boundary'

    getInitialState: ->
        error : undefined
        info  : undefined

    componentDidCatch: (error, info) ->
        reportException(error,"render error",null,info)
        @setState
            error : error
            info  : info

    render: ->
        # This is way worse than nothing, because it suppresses reporting the actual error to the
        # backend!!!  I'm disabling it completely.
        return @props.children
        if @state.info?
            <Alert
                bsStyle = 'warning'
                style   = {margin:'15px'}
            >
                <h2 style={color:'rgb(217, 83, 79)'}>
                    <Icon name='bug'/> You have just encountered a bug in CoCalc.  This is not your fault.
                </h2>
                <h4>
                    {"You will probably have to refresh your browser to continue."}
                </h4>
                {"We have been notified of this error; however, if this bug is causing you significant trouble, file a support ticket:"}
                <br/>
                <br/>
                <Button onClick={=>redux.getActions('support').show(true)}>
                    Create Ticket
                </Button>
                <br/>
                <br/>
                <details style={whiteSpace:'pre-wrap', cursor:'pointer'} >
                    <summary>Stack trace (in case you are curious)</summary>
                    <div style={cursor:'pointer'} >
                        {@state.error?.toString()}
                        <br/>
                        {@state.info.componentStack}
                    </div>
                </details>
            </Alert>
        else
            @props.children
