###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

exports.Landing = rclass
    displayName: "Landing"

    propTypes :
        public_paths : rtypes.immutable.Map.isRequired
        page_number  : rtypes.number.isRequired
        page_size    : rtypes.number.isRequired

    render_overview: ->
        <div>
            There are {@props.public_paths.size} projects with public paths.
        </div>

    render_prev_page: ->
        if @props.page_number > 0
            <a href="?page=#{@props.page_number-1}">Previous</a>

    render_next_page: ->
        if (@props.page_number+1)*@props.page_size < @props.public_paths.size
            <a href="?page=#{@props.page_number+1}">Next</a>

    render_project_link: (project_id) ->
        <div key={project_id}> {project_id} </div>

    render_project_index: ->
        project_ids = @props.public_paths.keySeq().toJS()
        project_ids.sort()
        for i in [@props.page_size * @props.page_number ... @props.page_size * (@props.page_number + 1)]
            if project_ids[i]
                @render_project_link(project_ids[i])

    # this is ugly but at least it helps with development to have the styles available
    inject_css: ->
        {DOMAIN_NAME} = require('smc-util/theme')
        code = {__html : """
        var r = new XMLHttpRequest();
        var d = null;
        r.open('GET', '#{DOMAIN_NAME}/assets.json', true);
        r.onreadystatechange = function() {
            if (! (r.readyState === XMLHttpRequest.DONE && r.status === 200)) {return};
            try {
                d = JSON.parse(r.responseText);
                console.log(d);
                /* TODO too optimistic */
                css_url = d['css']['js'];
                var css_js = document.createElement('script');
                css_js.type = 'text/javascript';
                css_js.onload = function() {
                    html = document.documentElement;
                    html.className = html.className.replace(/\\bno-js\\b/, 'js');
                };
                css_js.src = '#{DOMAIN_NAME}/' + css_url;
                document.getElementsByTagName('head')[0].appendChild(css_js);
            } catch (e) {
                console.log(e);
            }
        };
        r.send();
        """}
        <script type='text/javascript' dangerouslySetInnerHTML={code} />

    render: ->
        css = {__html : 'html.no-js{display : none;}'}
        <html className="no-js">
            <head>
                <title>CoCalc public shared files</title>
                <style dangerouslySetInnerHTML={css} />
                {@inject_css()}
            </head>
            <body>
                <h1>CoCalc public shared files</h1>
                {@render_overview()}
                <br/>
                {@render_prev_page()}
                <br/>
                {@render_next_page()}

                <hr/>

                {@render_project_index()}
            </body>
        </html>