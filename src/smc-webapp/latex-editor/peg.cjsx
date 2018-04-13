###
This is a crazy idea to test writing a renderer directly using PEG.

https://github.com/siefkenj/latex-parser
###

katex = require('katex')

{throttle} = require('underscore')


{Fragment, React, ReactDOM, rclass, rtypes} = require('../smc-react')

{Alert} = require('react-bootstrap')

misc = require('smc-util/misc')

latex_peg_parse = require('./peg/latex').parse

InlineMath = rclass
    displayName: 'LaTeXEditor-PEG-InlineMath'

    propTypes:
        value : rtypes.string.isRequired

    katex: ->
        katex.renderToString(@props.value, {displayMode:false})

    render: ->
        <span
            dangerouslySetInnerHTML = {__html:@katex()}
        />

DisplayMath = rclass
    displayName: 'LaTeXEditor-PEG-DisplayMath'

    propTypes:
        value : rtypes.string.isRequired

    katex: ->
        katex.renderToString(@props.value, {displayMode:true})

    render: ->
        <div
            style                   = {textAlign:'center'}
            dangerouslySetInnerHTML = {__html:@katex()}
        >
        </div>

Verbatim = rclass
    displayName: 'LaTeXEditor-PEG-Verbatim'

    propTypes :
        content : rtypes.string.isRequired

    render: ->
        <code style={display: 'block', marginTop: '1em', whiteSpace: 'pre'}>
            {@props.content}
        </code>

Title = rclass
    displayName: 'LaTeXEditor-PEG-Title'

    propTypes :
        state : rtypes.object

    render_date: ->
        if @props.state.date?
            return render_group(@props.state.date, @props.state)
        else
            # Not quite right...
            return (new Date()).toDateString()

    render: ->
        <div style={textAlign:'center'}>
            <h1>
                {render_group(@props.state.title, @props.state)}
            </h1>
            <div style={fontSize:'15pt'}>
                {render_group(@props.state.author, @props.state)}
            </div>
            <div style={fontSize:'15pt'}>
                {@render_date()}
            </div>
        </div>

Macro = rclass
    displayName: 'LaTeXEditor-PEG-Macro'

    propTypes :
        name  : rtypes.string.isRequired   # name of the macro
        args  : rtypes.array               # 0 or more arguments
        state : rtypes.object

    rendered_arg: (i) ->
        return render_group(@props.args[i], @props.state)

    render_section: ->
        state            = @props.state
        state.section    = (state.section ? 0) + 1
        state.subsection = 0
        <h2 style={fontWeight:'bold', marginTop: '3.5ex', marginBottom: '2.3ex'}>{state.section} {@rendered_arg(0)}</h2>

    render_subsection: ->
        state            = @props.state
        state.section   ?= 1
        state.subsection = (state.subsection ? 0) + 1
        <h3 style={fontWeight:'bold', marginTop: '3.25ex', marginBottom: '1.5ex'}>{state.section}.{state.subsection} {@rendered_arg(0)}</h3>

    render_subsubsection: ->
        state            = @props.state
        state.section    ?= 1
        state.subsection ?= 1
        state.subsubsection = (state.subsubsection ? 0) + 1
        <h4 style={fontWeight:'bold', marginTop: '3.25ex', marginBottom: '1.5ex'}>{state.section}.{state.subsection}.{state.subsubsection} {@rendered_arg(0)}</h4>

    render_textbf: ->
        <b>{@rendered_arg(0)}</b>

    render_textit: ->
        <i>{@rendered_arg(0)}</i>

    render_texttt: ->
        <span style = {fontFamily: 'monospace'}>
            {@rendered_arg(0)}
        </span>

    render_underline: ->
        <u>{@rendered_arg(0)}</u>

    render_LaTeX: ->
        <InlineMath value={'\\LaTeX'} />

    render_hline: ->
        <hr style={border: '.5px solid black'}/>

    render_title: ->
        @props.state.title = @props.args[0]
        return

    render_author: ->
        @props.state.author = @props.args[0]
        return

    render_date: ->
        @props.state.date = @props.args[0]
        return

    render_maketitle: ->
        <Title state={@props.state} />

    render_textbackslash: ->
        <span>\</span>

    render_documentclass: ->
        @props.state.documentclass = @props.args[0]
        return

    render: ->
        if @props.name.length == 1 and '{}\\~'.indexOf(@props.name) != -1
            return <span>{@props.name}</span>

        f = @["render_#{@props.name}"]
        if f?
            f() ? <span />
        else
            <pre>{"\\#{@props.name}(...)"}</pre>

Environment = rclass
    displayName: 'LaTeXEditor-PEG-Environment'

    propTypes :
        env     : rtypes.array
        args    : rtypes.object
        content : rtypes.array
        state   : rtypes.object

    rendered_content: ->
        return render_group(@props.content, @props.state)

    render_document: ->
        @rendered_content()

    get_list_items: ->
        v = []
        for i in [0...@props.content.length]
            if @props.content[i].TYPE == 'macro' and @props.content[i].content == 'item'
                v.push(i)
        v.push(@props.content.length)
        return (<li key={i}>{render_group(@props.content.slice(v[i]+1, v[i+1]), @props.state)}</li> for i in [0...v.length-1])

    render_abstract: ->
        <div>
            <div style={textAlign:'center'}>
                <b style={fontSize:'13pt'}>Abstract</b>
            </div>
            <p style={textIndent: '20px', marginLeft: 'auto', marginRight:'auto', maxWidth: '80%', marginTop:'15px'}>
                {@rendered_content()}
            </p>
        </div>

    render_itemize: ->
        if not @props.content?
            return
        <ul>
            {@get_list_items()}
        </ul>

    render_enumerate: ->
        if not @props.content?
            return
        <ol>
            {@get_list_items()}
        </ol>

    render_quote: ->
        <blockquote>
            {@rendered_content()}
        </blockquote>

    render_center: ->
        <div style={textIndent: 0, textAlign: 'center'}>
            {@rendered_content()}
        </div>

    render: ->
        if not @props.env
            return <pre>Environment</pre>
        name = @props.env[0]  # can it be more than one?
        f = @["render_#{name}"]
        if f?
            f() ? <span />
        else
            <pre>{"\\begin{\\#{name}}(...)\\end{\\#{name}}"}</pre>


macro_nargs = (name) ->
    switch name
        when 'maketitle', 'LaTeX'
            return 0
        when 'section', 'subsection', 'subsubsection', 'textbf', 'textit', 'texttt', 'underline', 'documentclass', 'title', 'author', 'date'
            return 1
        when 'setcounter'
            return 2
        else
            return 0

render_group = (group, state) ->
    if not group?
        return <span/>

    if typeof(group) == 'string'
        return <Fragment>{group}</Fragment>

    v     = []
    macro = undefined

    i = 0
    for x in group
        i += 1

        if typeof(x) == 'string'
            v.push <Fragment key={i}>{x}</Fragment>
            continue

        if macro?
            if x.TYPE == 'group'
                macro.args.push(x.content)
                macro.nargs -= 1
                if macro.nargs == 0
                    v.push(<Macro key={i} name={macro.name} args={macro.args} state={state} />)
                    macro = undefined
            continue

        switch x.TYPE
            when 'macro'
                name  = x.content
                nargs = macro_nargs(name)
                if nargs == 0
                    v.push(<Macro key={i} name={name} state={state} />)
                else
                    macro =
                        name  : name
                        nargs : nargs
                        args  : []
            when 'whitespace'
                v.push(<Fragment key={i} > </Fragment>)
            when 'parbreak'
                v.push(<br key={i}/>)
                v.push(<span key={i+'b'} style={display:'inline-block', marginRight:'2em'}/>)
            when 'verbatim'
                v.push(<Verbatim key={i} content={x.content} />)
            when 'environment'
                v.push(<Environment key={i} env={x.env} args={x.args} content={x.content} state={state} />)
            when 'comment'
                continue
            when 'group'
                v.push(render_group(x, state))
            else
                # not implemented yet.
                v.push(<pre key={i}>{JSON.stringify(x, null, "  ")}</pre>)

    return v

LaTeX = rclass
    displayName: 'LaTeXEditor-PEG-LaTeX'

    propTypes :
        value : rtypes.string


    render_parse: (parsed) ->
        <pre>
            {JSON.stringify(parsed, null, "  ")}
        </pre>

    render_error: (err) ->
        <Alert bsStyle={'danger'}>
            #{"#{err}"}
        </Alert>

    render: ->
        if not @props.value?
            return <span/>
        try
            parsed = latex_peg_parse(@props.value)
        catch err
            return @render_error(err)
        state  = {}
        <div>
            {render_group(parsed, state)}
            <br />
            <hr />
            <br />
            {@render_parse(parsed)}
        </div>

exports.PEG = rclass
    displayName: 'LaTeXEditor-PEG'

    propTypes :
        id            : rtypes.string.isRequired
        actions       : rtypes.object.isRequired
        editor_state  : rtypes.immutable.Map
        is_fullscreen : rtypes.bool
        project_id    : rtypes.string
        path          : rtypes.string
        reload        : rtypes.number
        font_size     : rtypes.number
        value         : rtypes.string
        content       : rtypes.string

    shouldComponentUpdate: (next) ->
        return misc.is_different(@props, next, ['id', 'project_id', 'path', 'font_size', 'read_only', \
               'value', 'content', 'reload_images'])

    on_scroll: ->
        elt = ReactDOM.findDOMNode(@refs.scroll)
        if not elt?
            return
        scroll = $(elt).scrollTop()
        @props.actions.save_editor_state(@props.id, {scroll:scroll})

    componentDidMount: ->
        @restore_scroll()
        setTimeout(@restore_scroll, 200)
        setTimeout(@restore_scroll, 500)

    componentDidUpdate: ->
        setTimeout(@restore_scroll, 1)

    restore_scroll: ->
        scroll = @props.editor_state?.get('scroll')
        if scroll?
            elt = ReactDOM.findDOMNode(@refs.scroll)
            if elt?
                $(elt).scrollTop(scroll)

    render: ->
        <div
            ref       = {'scroll'}
            onScroll  = {throttle(@on_scroll, 250)}
            className = {'smc-vfill'}
            style     = {background:'white', padding:'15px', overflowY:'scroll', \
                         width:'100%', zoom:(@props.font_size ? 16)/16, \
                         fontFamily: "Computer Modern", textAlign: 'justify'}
        >
            <LaTeX value={@props.value} />
        </div>



