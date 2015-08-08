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

###
# Help Page
###

{React, Actions, Store, Table, flux, rtypes, rclass, FluxComponent} = require('flux')

{Well, Col, Row, Accordion, Panel} = require('react-bootstrap')

{Icon, Loading} = require('r_misc')


# Define server stats actions
class ServerStatsActions extends Actions
    # NOTE: Can test causing this action by typing this in the Javascript console:
    #    require('flux').flux.getActions('server_stats').setTo({loading : true})
    setTo: (settings) ->
        settings : settings

# Register server stats actions
flux.createActions('server_stats', ServerStatsActions)

# Define account store
class ServerStatsStore extends Store
    constructor: (flux) ->
        super()
        ActionIds = flux.getActionIds('server_stats')
        @register(ActionIds.setTo, @setTo)
        @state = {}

    setTo: (message) ->
        @setState(message.settings)

# Register server_stats store
flux.createStore('server_stats', ServerStatsStore)

flux.getActions('server_stats').setTo(loading : true)

# The stats table

class StatsTable extends Table
    query: ->
        return 'stats'

    _change: (table, keys) =>
        newest = undefined
        for obj in table.get(keys).toArray()
            if obj? and (not newest? or obj.time > newest.time)
                newest = obj
        newest = newest.toJS()
        newest.loading = false
        flux.getActions('server_stats').setTo(newest)

flux.createTable('stats', StatsTable)


# CSS

li_style =
    lineHeight : 'inherit'
    marginTop  : '0.7ex'

HelpPageUsageSection = rclass
    displayName : 'HelpPage-HelpPageUsageSection'

    propTypes :
        loading            : rtypes.bool.isRequired
        hub_servers        : rtypes.array
        accounts           : rtypes.number
        projects           : rtypes.number
        active_projects    : rtypes.number
        last_day_projects  : rtypes.number
        last_week_projects : rtypes.number

    getDefaultProps : ->
       loading : true

    number_of_clients : ->
        if @props.hub_servers.length == 0
            0
        else
            (x['clients'] for x in @props.hub_servers).reduce((s,t) -> s+t)

    get_live_usage_stats_display : ->
        if @props.loading
            <li style={li_style}> Live server stats <Loading /> </li>
        else
            <li style={li_style}>
                <strong>{@number_of_clients()} people</strong> are connected right now actively modifying
                <strong> {@props.active_projects} projects</strong>. Users modified
                <strong> {@props.last_day_projects} projects</strong> in the last day and
                <strong> {@props.last_week_projects} projects</strong> in the last week.
            </li>

    render : ->
        <div>
            <h3>
                <Icon name='dashboard' /> Usage
            </h3>
            <ul>

                {@get_live_usage_stats_display()}

                <li style={li_style}>
                    <a target='_blank' href='https://github.com/sagemathinc/smc/wiki/Teaching'>Being used by over
                    <strong> 60 courses</strong> during Spring 2015...</a>
                </li>
                <li style={li_style}>
                    <a target='_blank' href='https://cloud.sagemath.com/7561f68d-3d97-4530-b97e-68af2fb4ed13/raw/stats.html'>
                    More usage data...</a>
                </li>
            </ul>
        </div>

SUPPORT_LINKS =
    contact :
        icon : 'envelope-o'
        href : 'mailto:help@sagemath.com'
        link : 'help@sagemath.com'
        text : <span>In case of problems with the SageMathCloud platform, <strong style={fontStyle:'italic'}>do
                   not hesitate</strong> to immediately email us. We want to know if anything is broken! <b>Include
                   a link (the address in your browser) to any project or document you are asking about.</b></span>
    getting_started :
        icon : 'play'
        href : '#help-page-getting-started'
        link : 'Getting started with SageMathCloud'
    teaching :
        icon : 'users'
        href : 'http://sagemath.blogspot.com/2014/10/sagemathcloud-course-management.html'
        link : 'Teaching a course with SageMathCloud'
    realtime_chat :
        icon : 'comments-o'
        href : 'https://gitter.im/sagemath/cloud'
        link : 'Realtime chat and help'
    quick_question :
        icon : 'question-circle'
        href : 'http://ask.sagemath.org/questions/'
        link : 'Ask a quick question'
    github :
        icon : 'github-square'
        href : 'https://github.com/sagemathinc/smc'
        link : 'Source on Github'
        text : 'SageMathCloud is 100% open source'
    github_issue_tracker :
        icon : 'exclamation-circle'
        href : 'https://github.com/sagemathinc/smc/issues'
        link : 'Github issue tracker'
        text : '(you may also email bug reports to us)'
    support_mailing_list :
        icon : 'life-ring'
        href : 'https://groups.google.com/forum/?fromgroups#!forum/sage-cloud'
        link : 'SageMathCloud support mailing list'
    developer_mailing_list :
        icon : 'envelope-o'
        href : 'https://groups.google.com/forum/?fromgroups#!forum/sage-cloud-devel'
        link : 'SageMathCloud developer mailing list'
    frequently_asked_questions :
        icon : 'question-circle'
        href : 'https://github.com/sagemathinc/smc/wiki/FAQ'
        link : 'Frequently Asked Questions'
    sagemath_blog :
        icon : 'rss'
        href : 'http://sagemath.blogspot.com/'
        link : 'SageMath Blog'
    google_plus :
        icon : 'google-plus-square'
        href : 'https://plus.google.com/115360165819500279592/posts'
        link : 'Google+ William Stein'
        text : 'William Stein - development updates'
    google_plus_smc :
        icon : 'google-plus-square'
        href : 'https://plus.google.com/117696122667171964473/posts'
        link : 'Google+ SageMathCloud'
        text : 'SageMathCloud updates on Google+'
    twitter :
        icon : 'twitter-square'
        href : 'https://twitter.com/wstein389'
        link : 'Twitter'
        text : 'Follow the Twitter feed'
    general_sagemath :
        icon : 'superscript'
        href : 'http://www.sagemath.org/help.html'
        link : 'General SageMath help and support pages'
    chrome_app :
        icon      : 'google'
        href      : 'https://chrome.google.com/webstore/detail/the-sagemath-cloud/eocdndagganmilahaiclppjigemcinmb'
        link      : 'Install the Chrome App'
        className : 'salvus-chrome-only'

HelpPageSupportSection = rclass
    displayName : 'HelpPage-HelpPageSupportSection'

    propTypes :
        support_links : rtypes.object

    get_support_links : ->
        for name, data of @props.support_links
            <li key={name} style={li_style} className={if data.className? then data.className}>
                <a target={if data.href.indexOf('#') != 0 then '_blank'} href={data.href}>
                    <Icon name={data.icon} fixedWidth /> {data.link}
                </a> {if data.text? then data.text}
            </li>

    render : ->
        <div>
            <h3> <Icon name='support' /> Support </h3>
            <ul>
                {@get_support_links()}
            </ul>
        </div>

ABOUT_SECTION =
    legal :
        <span>
            <a target='_blank' href='/policies/index.html'>
                LEGAL: Terms of Service, Pricing, Copyright and Privacy policies
            </a>
        </span>
    developers :
        <span>
            <a target='_blank' href='http://wstein.org'>William Stein</a> is
            the founder and main architect of SageMathCloud, and
            <a target='_blank' href='http://harald.schil.ly/'> Harald Schilly</a> does marketing and QA testing.
            Also, Keith Clawson has done hardware, and Jonathan Lee, Nicholas Ruhland, and Andy Huchala
            have done web development.
        </span>
    funding :
        <span>
            SageMathCloud has received support from SageMath, Inc., the National Science Foundation
            (awards <a target='_blank' href='http://www.nsf.gov/awardsearch/showAward?AWD_ID=1161226'> 1161226</a>,
            <a target='_blank' href='http://www.nsf.gov/awardsearch/showAward?AWD_ID=1147802'> 1147802</a>,
            <a target='_blank' href='http://www.nsf.gov/awardsearch/showAward?AWD_ID=1020378'> 1020378</a> and
            <a target='_blank' href='http://www.nsf.gov/awardsearch/showAward?AWD_ID=1015114'> 1015114</a>), and
            <a target='_blank' href='https://research.google.com/university/relations/appengine/index.html'> The Google
            Education Grant program.</a>
        </span>
    launched :
        'SageMathCloud first launched in April, 2013.'
    incorporated :
        'SageMath, Inc. (a Delaware C Corporation) was incorporated on Feb 2, 2015.'

HelpPageAboutSection = rclass
    displayName : 'HelpPage-HelpPageAboutSection'

    get_about_section : ->
        for name, item of ABOUT_SECTION
            <li key={name} style={li_style}>
                {item}
            </li>

    render : ->
        <div>
            <h3> <Icon name='info-circle' /> About </h3>
            <ul>
                {@get_about_section()}
            </ul>
        </div>

HelpPageGettingStartedSection = rclass
    displayName : 'Help-HelpPageGettingStartedSection'

    get_panel_header : (icon, header) ->
        <div><Icon name={icon} fixedWidth /> {header}</div>

    insert_sample_function : ->
        '$J_\\alpha(x) = \\sum\\limits_{m=0}^\\infty \\frac{(-1)^m}{m! \\, \\Gamma(m + \\alpha + 1)}{\\left({\\frac{x}{2}}\\right)}^{2 m + \\alpha}$'

    render : ->
        <div>
            <h3 id='help-page-getting-started'><Icon name='cubes' /> Getting started with SageMathCloud</h3>

            <Accordion>
                <Panel header={@get_panel_header('user', 'Create an account')} eventKey='1'>
                    <p>
                        <a target='_blank' href='https://www.youtube.com/watch?v=eadnL5hDg9M'><Icon name='youtube-play' /> video</a>
                    </p>
                    <p>
                        Navigate to <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a>.
                        If you are already signed in, first sign out
                        by clicking on your email address by the <Icon name='cog' /> icon
                        in the upper right, and clicking 'Sign out'.
                        Click on 'create an account', then agree to the terms of usage.
                        Next either enter your name, email address, and password for
                        the new account you would like to create, or login
                        using your Google, Github, Facebook, etc., account.
                        You may change your name, email address or password
                        at any time later, and also reset your password in case you forget it.
                    </p>
                    <div style={color:'#666'}>
                        <h4>Technical Notes</h4>
                        <ul>
                            <li> Please
                                use a strong password or login via Google, Github or another provider,
                                especially when you start using SageMathCloud frequently.
                            </li>
                            <li> Only the hash of your password is stored by the server, which uses 1000 iterations
                                of a sha-512 hash function, with a salt length of 32. This makes it more
                                difficult for a hacker to brute-force your password, even if they have the database of
                                password hashes, since every guess takes much more work to make.
                            </li>
                        </ul>
                    </div>
                </Panel>

                <Panel header={@get_panel_header('user', 'Change your name, email address, or password')} eventKey='2'>
                    <p>
                        <a target='_blank' href='https://www.youtube.com/watch?v=A9zltIsU2cM'><Icon name='youtube-play' /> video</a>
                    </p>
                    <p>
                        Log into <a target='_blank' href='https://cloud.sagemath.com'>https://cloud.sagemath.com</a>,
                        then click in the upper right corner on your email address by
                        the <Icon name='cog' /> icon.
                        Change your first or last name in the settings tab that appears, then click save.
                    </p>
                    <p>
                        To change your password, click the "Change password" link, enter your old password,
                        then enter a new password.
                    </p>

                    <p>
                        To change the email account that is linked to your SageMathCloud account, click
                        on the "change" link next to your email address, type in the password (to your SageMathCloud
                        account), then enter a new email address.
                    </p>

                    <div style={color:'#666'}>
                        <h4>Technical Notes</h4>
                        <ul>
                            <li>Changing your first or last name at any time is pretty harmless, since it
                                only changes the name other people see when collaborating with
                                you on projects.
                            </li>
                            <li>The primary purpose of providing an email address is that you
                                can use it to reset your password when you forget it.
                            </li>
                        </ul>
                    </div>
                </Panel>

                <Panel header={@get_panel_header('line-chart', 'Get a bunch of examples')} eventKey='3'>
                    <div>
                        To easily copy our collection of examples into a project, just click "<Icon name='plus-circle' /> New", paste
                        in this link <pre>https://github.com/sagemath/cloud-examples.git</pre> and
                        click "From Web".  In a few seconds you will find a directory
                        <pre>sage-cloud-templates</pre> in your project, full of examples.
                    </div>

                    <div style={color:'#666'}>
                        <h4>Technical Notes</h4>
                        <ul>
                            <li>The collection of examples is a <a target='_blank' href='https://github.com/haraldschilly/sage-cloud-templates'>Github repository</a>.
                                In a terminal in the sage-cloud-templates directory, you can type
                                <pre>git pull</pre>
                                to get the latest changes and
                                examples (you may have to type <span style={fontFamily:'monospace'}>"git commit -a"</span> first,
                                if you have made changes). You can also
                                <a href='https://github.com/haraldschilly/sage-cloud-templates/commits/master' target='_blank'> see
                                what is new in the Github repository</a>.
                            </li>
                        </ul>
                    </div>
                </Panel>

                <Panel header={@get_panel_header('line-chart', 'Watch a March 2015 talk about all of the main features of SageMathCloud')} eventKey='4'>
                    William Stein (lead developer of SageMathCloud) gave the following one-hour talk in March 2015 at
                    the <a target='_blank' href='http://escience.washington.edu/'>UW eScience Institute</a>:
                    <p>
                        <a target='_blank' href='https://www.youtube.com/watch?v=_ff2HdME8MI'><Icon name='youtube-play' /> video</a>
                    </p>
                </Panel>

                <Panel header='$x^2$ Using $\LaTeX$' eventKey='5' className='salvus-mathjax-on-startup'>
                    <ul>
                        <li><a target='_blank' href='https://www.youtube.com/watch?v=IaachWg4IEQ'><Icon name='youtube-play' /> video1</a></li>
                        <li><a target='_blank' href='https://www.youtube.com/watch?v=cXhnX3UtizI'><Icon name='youtube-play' /> video2</a></li>
                        <li><a target='_blank' href='https://www.youtube.com/playlist?list=PLnC5h3PY-znxc090kGv7W4FpbotlWsrm0'>
                        <Icon name='youtube-play' /> Introduction to $\LaTeX$ by Vincent Knight </a></li>
                    </ul>

                    <p>
                        <a target='_blank' href='http://www.latex-project.org/'>$\LaTeX$</a> is a system for creating
                        professional quality documents, with excellent support for typesetting mathematical formulas
                        like {@insert_sample_function()}.
                        There are two main ways to use latex in the SageMathCloud:
                    </p>

                    <ol>
                        <li> In chats or in worksheet cells that start with %html or %md,
                            enclose mathematical formulas in single or double
                            dollar signs and they will be typeset
                            (using <a target='_blank' href='http://www.mathjax.org/'>MathJax</a>) when
                            you submit them.  In addition to dollar
                            signs, you can use the other standard latex equation wrappers
                            \­[ \] and \­(  \).
                            In worksheets, if f is some object, you can type <span style={fontFamily:'monospace'}>show(f)</span>
                            to see f nicely typeset using the latex generated by <span style={fontFamily:'monospace'}>latex(f)</span>.
                            In a worksheet, type <span style={fontFamily:'monospace'}>typeset_mode(True)</span> to show the nicely
                            typeset version of objects by default. You may also use MathJax in
                            Markdown cells in Jupyter notebooks.
                        </li>
                        <li> You can edit a full LaTeX document by creating or uploading
                            a file with an extension of .tex, then opening it.
                            The tex file appears on the left, and there is a preview of
                            the compiled version on the right,
                            which is updated whenever you save the file (ctrl+s).
                            By clicking <Icon name='film' />, you can split the tex
                            editor so that you can see two parts of the file at once.
                            You can also use inverse and forward search to easily move back
                            and forth between the tex file and the preview. In addition to
                            the preview, there is an error and warning log with buttons
                            to jump to the corresponding issue in the tex file or preview.
                            There is also a button to show or download the final high-quality PDF.
                            In addition, you can see the output of running pdflatex, bibtex, and
                            <a target='_blank' href='http://www.sagemath.org/doc/tutorial/sagetex.html'> use
                            SageTex</a> (which should "just work"), make any of those programs re-run, and customize the
                            latex build command. If necessary, you can do extremely sophisticated processing of tex files
                            in a Terminal (<Icon name='plus-circle' /> New --&gt; Terminal).
                        </li>
                    </ol>

                </Panel>

                <Panel header={@get_panel_header('area-chart', 'Use R in SageMath worksheets')} eventKey='6'>
                    <p>
                        <a target='_blank' href='https://www.youtube.com/watch?v=JtVuX4yb70A'><Icon name='youtube-play' /> video</a>
                    </p>
                    <p>
                        In a project, click "<Icon name='plus-circle' /> New" then the
                        "Sage" button.  In the worksheet that appears, type <pre>%default_mode r</pre>
                        then press shift+enter.
                        For the reset of the worksheet, type normal R commands, followed by shift+enter.
                        Plotting should just work as usual in R.
                        See <a target='_blank' href='https://github.com/haraldschilly/sage-cloud-templates/tree/master/r'>these
                        example worksheets</a>.
                    </p>
                </Panel>


                <Panel header={@get_panel_header('bar-chart', 'Use Jupyter notebooks')} eventKey='7'>
                    <p>
                        <a target='_blank' href='https://www.youtube.com/watch?v=sDBbt8U4aJw'><Icon name='youtube-play' /> video</a>
                    </p>
                    <p>
                        In a project, click <span style={color:'#08c'}><Icon name='plus-circle' /> New</span> then the
                        "Jupyter" button, or just open an ipynb file.
                        The notebook will be opened using Jupyter's html-based client,
                        with support for embedded graphics.
                        To support the collaborative nature of the SageMathCloud,
                        we've enhanced the Jupyter notebook with realtime sync,
                        so if you open the same notebook on multiple computers (or if multiple
                        people open the same notebook), they will stay in sync.
                        Also, if you want to use the Sage preparser, type
                        <span style={fontFamily:'monospace'}> %load_ext sage</span> into a notebook cell.
                    </p>
                    <div style={color:'#666'}>
                        <h4>Technical Notes</h4>
                        <ul>
                            <li>
                                You can also run a normal version of the Jupyter notebook server
                                (no sync, not integrated into cloud) by (1) finding your project id in project settings, then (2) visiting
                                <span style={fontFamily:'monospace'}> https://cloud.sagemath.com/[project_id]/port/jupyter</span> (you
                                will possibly have to refresh your browser if this takes too long the first time).
                                Any collaborator on your project can securely use the Jupyter notebook server by visiting
                                this link, but nobody else can.
                            </li>
                        </ul>
                    </div>
                </Panel>

            </Accordion>
        </div>

HelpPage = rclass
    displayName : 'HelpPage'

    render : ->
        <Row>
            <Col sm=12>
                <Well>
                    <h3>
                        <img src='favicon-128.png' className='img-rounded pull-right' />
                        SageMathCloud™ collaborative computational mathematics
                    </h3>
                    <h4 style={marginTop:'30px', marginBottom:'30px'}> SageMath, Python, LaTeX, and terminals in your browser </h4>

                    <HelpPageSupportSection support_links={SUPPORT_LINKS} />
                    <HelpPageAboutSection />

                    <FluxComponent flux={flux} connectToStores={'server_stats'}>
                        <HelpPageUsageSection />
                    </FluxComponent>

                    <HelpPageGettingStartedSection />
                </Well>
            </Col>
        </Row>

exports.render_help_page = () ->
    React.render(<HelpPage />, document.getElementById('salvus-help'))
    # also setup a listener for switching to the page. (TODO: temporary until react-router...)
    require('top_navbar').top_navbar.on "switch_to_page-salvus-help", () ->
        window.history.pushState("", "", window.salvus_base_url + '/help')

exports._test =
    HelpPageSupportSection : HelpPageSupportSection
    SUPPORT_LINKS : SUPPORT_LINKS

