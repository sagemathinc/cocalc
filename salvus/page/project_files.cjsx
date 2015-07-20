###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

{React, Actions, Store, Table, rtypes, rclass, FluxComponent}  = require('flux')
{Col, Row} = require('react-bootstrap')
misc = require('misc')
{Icon, Loading} = require('r_misc')
{human_readable_size} = require('misc_page')
project_store = require('project_store')
{MiniTerminal} = require('project_miniterm')
{file_associations} = require('editor')

TimeAgo = require('react-timeago')

# A link that goes back to the current directory
#todo : refactor to use PathSegmentLink?
exports.PathLink = rclass
    propTypes :
        path       : rtypes.array.isRequired
        flux       : rtypes.object
        project_id : rtypes.string.isRequired
        default    : rtypes.string

    styles :
        cursor : 'pointer'

    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_focused_page("project-file-listing")

    render : ->
        <span style={@styles} onClick={@handle_click}>{misc.path_join(@props.path, @props.default ? "home directory of project")}</span>


# One segment of the directory links at the top of the files listing.
PathSegmentLink = rclass
    propTypes :
        path       : rtypes.array
        display    : rtypes.oneOfType([rtypes.string, rtypes.object])
        project_id : rtypes.string
        flux       : rtypes.object

    styles :
        cursor         : 'pointer'
        fontSize       : '16pt'

    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_current_path(@props.path)
        @props.flux.getProjectActions(@props.project_id).set_focused_page("project-file-listing")

    render : ->
        <a style={@styles} onClick={@handle_click}>{@props.display}</a>

FileCheckbox = rclass
    propTypes :
        name       : rtypes.string
        checked    : rtypes.bool
        project_id : rtypes.string
        flux       : rtypes.object

    handle_click : (e) ->
        e.stopPropagation() # so we don't open the file
        @props.flux.getProjectActions(@props.project_id).set_file_checked(@props.name, not @props.checked)

    render : ->
        <span onClick={@handle_click}>
            <Icon name = {if @props.checked then "check-square-o" else "square-o"} style={fontSize:'14pt'} />
        </span>

FileRow = rclass
    propTypes :
        name       : rtypes.string.isRequired
        size       : rtypes.number.isRequired
        time       : rtypes.number
        checked    : rtypes.bool
        mask       : rtypes.bool
        project_id : rtypes.string
        flux       : rtypes.object

    shouldComponentUpdate : (next) ->
        return @props.name != next.name or
        @props.size != next.size        or
        @props.time != next.time        or
        @props.checked != next.checked  or
        @props.mask != next.mask

    render_icon : ->
        ext  = misc.filename_extension(@props.name)
        name = file_associations[ext]?.icon ? 'file'
        <a>
            <Icon name={name} style={fontSize:'14pt'} />
        </a>

    render_name : ->
        ext  = misc.filename_extension(@props.name)
        if ext is ""
            name = @props.name
        else
            name = @props.name.substring(0, @props.name.length - ext.length - 1)

        filename_styles =
            whiteSpace   : 'pre-wrap'
            wordWrap     : 'break-word'
            overflowWrap : 'break-word'

        <a style={filename_styles}>
            <span style={fontWeight:'bold'}>{name}</span>
            <span style={color:'#999'}>{if ext is "" then "" else ".#{ext}"}</span>
        </a>


    handle_click : ->
        console.log("clicked file", @props.name)

    mask_styles : ->
        if @props.mask or misc.startswith(@props.name, '.')
            color : '#bbbbbb'


    render : ->
        row_styles =
            cursor : 'pointer'

        test_styles =
            ':hover':                    # ' TODO: syntax hilighting broken without this comment
                backgroundColor : 'red'

        test_styles2 =
            backgroundColor : 'blue'

        mask_styles = @mask_styles()
        <Row style={row_styles}>
            <Col sm=2>
                <FileCheckbox
                    name       = {@props.name}
                    checked    = {@props.checked}
                    project_id = {@props.project_id}
                    flux       = {@props.flux} />
            </Col>
            <Col sm=1 style={mask_styles}>
                {@render_icon()}
            </Col>
            <Col sm=4>
                {@render_name()}
            </Col>
            <Col sm=3>
                <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} />
            </Col>
            <Col sm=2>
                {human_readable_size(@props.size)}
            </Col>
        </Row>

DirectoryRow = rclass
    propTypes :
        name         : rtypes.string.isRequired
        checked      : rtypes.bool
        time         : rtypes.number
        current_path : rtypes.array
        project_id   : rtypes.string
        flux         : rtypes.object


    handle_click : ->
        @props.flux.getProjectActions(@props.project_id).set_current_path(@props.current_path.concat(@props.name))

    render_time : ->
        if @props.time?
            <TimeAgo date={(new Date(@props.time * 1000)).toISOString()} />

    mask_styles : ->
        if misc.startswith(@props.name, '.')
            color : '#bbbbbb'

    render : ->
        row_styles =
            backgroundColor : '#fafafa'
            border          : '1px solid #eee'
            cursor          : 'pointer'
            borderRadius    : '4px'

        directory_styles =
            fontWeight   : 'bold'
            whiteSpace   : 'pre-wrap'
            wordWrap     : 'break-word'
            overflowWrap : 'break-word'

        mask_styles = @mask_styles()

        <Row style={row_styles} onClick={@handle_click}>
            <Col sm=2>
                <FileCheckbox
                    name       = {@props.name}
                    checked    = {@props.checked}
                    project_id = {@props.project_id}
                    flux       = {@props.flux} />
            </Col>
            <Col sm=1>
                <a><Icon name="folder-open-o" style={fontSize:'14pt'} /></a>
            </Col>
            {# TODO: list of styles works with Radium <Col sm=4 style={[directory_styles, mask_styles]}>}
            <Col sm=4 style={directory_styles}>
                <a>{@props.name}</a>
            </Col>
            <Col sm=3>
                {@render_time()}
            </Col>
            <Col sm=2>
                {#size (not applicable for directories)}
            </Col>
        </Row>

NoFiles = rclass
    render : ->
        <div>No Files</div>

FileListing = rclass
    propTypes :
        listing       : rtypes.array
        mask          : rtypes.bool # if true then mask out files that probably won't be opened
        checked_files : rtypes.object
        current_path  : rtypes.array
        project_id    : rtypes.string
        flux          : rtypes.object

    render_row : (name, size, time, isdir) ->
        if isdir
            return <DirectoryRow
                        name         = {name}
                        time         = {time}
                        key          = {name}
                        checked      = {@props.checked_files.has(name)}
                        flux         = {@props.flux}
                        project_id   = {@props.project_id}
                        current_path = {@props.current_path} />
        else
            return <FileRow
                        name       = {name}
                        time       = {time}
                        size       = {size}
                        checked    = {@props.checked_files.has(name)}
                        key        = {name}
                        flux       = {@props.flux}
                        project_id = {@props.project_id} />

    handle_parent : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).set_current_path(@props.current_path.slice(0, -1))

    parent_directory : ->
        styles =
            fontWeight   : 'bold'
            whiteSpace   : 'pre-wrap'
            wordWrap     : 'break-word'
            overflowWrap : 'break-word'

        row_styles =
            backgroundColor : '#fafafa'
            border          : '1px solid #eee'
            cursor          : 'pointer'
            borderRadius    : '4px'

        if @props.current_path.length > 0
            <Row style={row_styles} onClick={@handle_parent}>
                <Col sm=2>
                </Col>
                <Col sm=1>
                    <a><Icon name="reply" style={fontSize:'14pt'} /></a>
                </Col>
                <Col sm=4 style={styles}>
                    <a href="" onClick={@directory_up}>Parent Directory</a>
                </Col>
                <Col sm=3>
                </Col>
                <Col sm=2>
                </Col>
            </Row>

    render_rows: ->
        t = misc.mswalltime()
        v = (@render_row(a.name, a.size, a.mtime, a.isdir) for a in @props.listing)
        return v

    render : ->
        if @props.listing?
            <Col sm=12>
                {@parent_directory()}
                {@render_rows()}
                {if @props.listing.length == 0 then <NoFiles project_id={@props.project_id} current_path={@props.current_path} flux={@props.flux} />}
            </Col>
        else
            <Loading />

ProjectFilesSearch = rclass
    render : ->
        <Col sm=3>
            Search
        </Col>

ProjectFilesPath = rclass
    make_path : ->
        v = []
        v.push <PathSegmentLink path={[]} display={<Icon name="home" />} flux={@props.flux} project_id={@props.project_id} key="home" />
        for segment, i in @props.current_path
            v.push <span key={2 * i + 1}>&nbsp; / &nbsp;</span>
            v.push <PathSegmentLink
                    path       = {@props.current_path.slice(0, i + 1)}
                    display    = {segment}
                    flux       = {@props.flux}
                    project_id = {@props.project_id}
                    key        = {2 * i + 2} />
        return v

    render : ->
        <Col sm=6>
            <span>{@make_path()}</span>
        </Col>

ProjectFilesButtons = rclass
    propTypes :
        show_hidden  : rtypes.bool
        sort_by_time : rtypes.bool
        current_path : rtypes.array
        project_id   : rtypes.string.isRequired
        flux         : rtypes.object

    handle_refresh : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).set_directory_files(@props.current_path, @props.sort_by_time, props.show_hidden)

    handle_sort_method : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).setTo(sort_by_time : not @props.sort_by_time)
        @props.flux.getProjectActions(@props.project_id).set_directory_files(@props.current_path, not @props.sort_by_time, @props.show_hidden)

    handle_hidden_toggle : (e) ->
        e.preventDefault()
        @props.flux.getProjectActions(@props.project_id).setTo(show_hidden : not @props.show_hidden)
        @props.flux.getProjectActions(@props.project_id).set_directory_files(@props.current_path, @props.sort_by_time, not @props.show_hidden)

    render_refresh : ->
        <a href="" onClick={@handle_refresh}><Icon name="refresh" /> </a>

    render_sort_method : ->
        if @props.sort_by_time
            <a href="" onClick={@handle_sort_method}><Icon name="sort-numeric-asc" /> </a>
        else
            <a href="" onClick={@handle_sort_method}><Icon name="sort-alpha-asc" /> </a>

    render_hidden_toggle : ->
        if @props.show_hidden
            <a href="" onClick={@handle_hidden_toggle}><Icon name="eye" /> </a>
        else
            <a href="" onClick={@handle_hidden_toggle}><Icon name="eye-slash" /> </a>

    render_trash : ->
        <a href="" onClick={@handle_click}><Icon name="trash" /> </a>

    render_backup : ->
        <a href="" onClick={@handle_click}><Icon name="life-saver" /> <span style={fontSize: 14}>Backups</span> </a>


    render : ->
        <Col sm=3 style={textAlign: "right", fontSize: "14pt"}>
            {@render_refresh()}
            {@render_sort_method()}
            {@render_hidden_toggle()}
            {@render_trash()}
            {@render_backup()}
        </Col>

ProjectFilesActions = rclass
    ###
    When a directory is selected:
        Download, Delete, Rename, Move, Copy

    When a file is selected:
        Copy public link, Download, Comment, Delete, Rename, Move, Copy, Previous versions

    When multiple items are selected:
        Download, Delete, Move, Copy, Compress

    Some items can't be modified. When there is at least one in the selection:
        Download, Compress
    ###

    propTypes :
        checked_files : rtypes.object
        flux          : rtypes.object

    render : ->
        <Row>
            <Col sm=12>
                <div style={backgroundColor:"#eee"}>
                    File Actions...
                </div>
            </Col>
        </Row>

ProjectFiles = rclass
    propTypes :
        project_id : rtypes.string.isRequired
        flux       : rtypes.object

    render : ->
        <div>
            <Row>
                <Col sm=12>
                    <ProjectFilesSearch />
                    <ProjectFilesPath current_path={@props.current_path} project_id={@props.project_id} flux={@props.flux} />
                    <ProjectFilesButtons
                        project_id   = {@props.project_id}
                        flux         = {@props.flux}
                        show_hidden  = {@props.show_hidden ? false}
                        sort_by_time = {@props.sort_by_time ? true}
                        current_path = {@props.current_path} />
                </Col>
            </Row>
            <ProjectFilesActions
                checked_files = {@props.checked_files}
                flux = {@props.flux} />
            <Row>
                <Col sm=3 smOffset=9>
                    <MiniTerminal project_id={@props.project_id} current_path={@props.current_path} flux={@props.flux} />
                </Col>
            </Row>
            <FileListing
                listing       = {@props.directory_file_listing?.get(@props.current_path.join("/"))}
                checked_files = {@props.checked_files}
                current_path  = {@props.current_path}
                project_id    = {@props.project_id}
                flux          = {@props.flux} />
        </div>

render = (project_id, flux) ->
    store = project_store.getStore(project_id, flux)
    <FluxComponent flux={flux} connectToStores={[store.name]}>
        <ProjectFiles project_id={project_id} flux={flux} />
    </FluxComponent>

exports.render_new = (project_id, dom_node, flux) ->
    React.render(render(project_id, flux), dom_node)