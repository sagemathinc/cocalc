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

exports.HTML = HTML = require('./html').HTML

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

