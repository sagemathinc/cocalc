###
Share server top-level landing page.
###

{rclass, React, ReactDOM, rtypes} = require('../smc-react')

exports.Page = rclass
    displayName: "Page"

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
                console.log(css_js.src)
                document.getElementsByTagName('head')[0].appendChild(css_js);
            } catch (e) {
                console.log(e);
            }
        };
        r.send();
        """}
        <script type='text/javascript' dangerouslySetInnerHTML={code} />

    render: ->
        # I commented out the css stuff, because it causes a very annoying "flicker", and it isn't
        # needed for this first rough draft to establish and figure out what the map/functionality of the site
        # actually is...
        #css = {__html : 'html.no-js{display : none;}'}
        <html className="no-js">
            <head>
                <title>CoCalc: shared files</title>
                {# <style dangerouslySetInnerHTML={css} />}
                {# @inject_css() }

                {# temporary bootstrap CDN }
                <link
                    rel         = "stylesheet"
                    href        = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css"
                    integrity   = "sha384-BVYiiSIFeK1dGmJRAkycuHAHRg32OmUcww7on3RYdg4Va+PmSTsz/K68vbdEjh4u"
                    crossOrigin = "anonymous" />

                {# very temporary codemirror cdn}
                <link rel="stylesheet" href="http://esironal.github.io/cmtouch/lib/codemirror.css" />

            </head>
            <body>
                <div style={display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden'}>
                    <div key='top' style={margin:'5px 5px 0'}>
                        CoCalc shared files
                    </div>
                    <div key='index' className="well"  style={margin:'5px 5px 0', display: 'flex', flexDirection: 'column'}>
                        {@props.children}
                    </div>
                </div>
            </body>
        </html>