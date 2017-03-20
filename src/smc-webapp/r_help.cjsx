##############################################################################
#
#    CoCalc: Collaborative Calculations in the Cloud
#
#    Copyright (C) 2016, Sagemath Inc.
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

$ = window.$
misc = require('smc-util/misc')
{React, ReactDOM, redux, rtypes, rclass} = require('./smc-react')
{Well, Col, Row, Accordion, Panel, ProgressBar, Table} = require('react-bootstrap')
{Icon, Loading, Space, TimeAgo, UNIT, Footer} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription, PolicyPricingPageUrl} = require('./customize')
{ShowSupportLink} = require('./support')
{RECENT_TIMES, RECENT_TIMES_KEY} = require('smc-util/schema')
{APP_LOGO} = require('./misc_page')
{COLORS, HELP_EMAIL, WIKI_URL} = require('smc-util/theme')

# List item style
li_style =
    lineHeight    : 'inherit'
    marginBottom  : '10px'

exports.HelpPageUsageSection = HelpPageUsageSection = rclass
    reduxProps :
        server_stats :
            loading             : rtypes.bool.isRequired
            hub_servers         : rtypes.array
            time                : rtypes.object
            accounts            : rtypes.number
            projects            : rtypes.number
            accounts_created    : rtypes.object # {RECENT_TIMES.key → number, ...}
            projects_created    : rtypes.object # {RECENT_TIMES.key → number, ...}
            projects_edited     : rtypes.object # {RECENT_TIMES.key → number, ...}

    displayName : 'HelpPage-HelpPageUsageSection'

    getDefaultProps: ->
       loading : true

    number_of_active_users: ->
        if @props.hub_servers.length == 0
            0
        else
            (x.clients for x in @props.hub_servers).reduce((s,t) -> s+t)

    render_active_users_stats: ->
        if @props.loading
            <div> Live server stats <Loading /> </div>
        else
            n = @number_of_active_users()
            <div style={textAlign:'center'}>
                    Currently connected users
                <ProgressBar style={marginBottom:10}
                    now={Math.max(n / 12 , 45 / 8) }
                    label={"#{n} connected users"} />
            </div>

    render_active_projects_stats: ->
        n = @props.projects_edited?[RECENT_TIMES_KEY.active]
        <ProgressBar now={Math.max(n / 3, 60 / 2)} label={"#{n} projects being edited"} />

    recent_usage_stats_rows: ->
        stats = [
            ['Modified projects', @props.projects_edited],
            ['Created projects', @props.projects_created],
            ['Created accounts', @props.accounts_created]
        ]
        for stat in stats
            <tr key={stat[0]}>
                <th style={textAlign:'left'}>{stat[0]}</th>
                <td>
                    {stat[1]?[RECENT_TIMES_KEY.last_hour]}
                </td>
                <td>
                    {stat[1]?[RECENT_TIMES_KEY.last_day]}
                </td>
                <td>
                    {stat[1]?[RECENT_TIMES_KEY.last_week]}
                </td>
                <td>
                    {stat[1]?[RECENT_TIMES_KEY.last_month]}
                </td>
            </tr>

    render_recent_usage_stats: ->
        if @props.loading
            return
        <Table bordered condensed hover className='cc-help-stats-table'>
            <thead>
                <tr>
                    <th>past</th>
                    <th>hour</th>
                    <th>day</th>
                    <th>week</th>
                    <th>month</th>
                </tr>
            </thead>
            <tbody>
                {@recent_usage_stats_rows()}
            </tbody>
        </Table>

    render_historical_metrics: ->
        return  # disabled, due to being broken...
        <li key='usage_metrics' style={li_style}>
            <a target='_blank' href='https://cloud.sagemath.com/b97f6266-fe6f-4b40-bd88-9798994a04d1/raw/metrics/metrics.html'>
                <Icon name='area-chart' fixedWidth />Historical system metrics
            </a> &mdash; CPU usage, running projects and software instances, etc
        </li>

    render_when_updated: ->
        if @props.time
            <span style={fontSize: '9pt', marginLeft: '20px', color: '#666'}>
                updated <TimeAgo date={new Date(@props.time)} />
            </span>

    render: ->
        <Col sm={12} md={6}>
            <h3>
                <Icon name='dashboard' /> Statistics
                {@render_when_updated()}
            </h3>
            <div>
                {@render_active_users_stats()}
                {# @render_active_projects_stats()}
                <div style={marginTop: 20, textAlign:'center'}>
                    Recent user activity
                </div>
                {@render_recent_usage_stats()}
                <Icon name='line-chart' fixedWidth />{' '}
                <a target='_blank' href='https://cloud.sagemath.com/7561f68d-3d97-4530-b97e-68af2fb4ed13/raw/stats.html'>
                More data...
                </a>
                <br/>
                {@render_historical_metrics()}
            </div>
        </Col>


SUPPORT_LINKS =
    email_help :
        commercial: true
        bold : true
        icon : 'envelope'
        href : 'mailto:' + HELP_EMAIL
        link : HELP_EMAIL
        text : 'Please include the URL link to the relevant project or file!'
    teaching :
        icon : 'graduation-cap'
        href : 'https://mikecroucher.github.io/SMC_tutorial/'
        link : <span>How to teach a course with <SiteName/></span>
    pricing :
        icon : 'money'
        href : PolicyPricingPageUrl
        link : 'Pricing and subscription options'
        commercial: true
    frequently_asked_questions :
        icon : 'question-circle'
        bold : true
        href : WIKI_URL
        link : <span><SiteName/> documentation</span>
    courses :
        icon : 'users'
        href : 'https://github.com/sagemathinc/cocalc/wiki/Teaching'
        link :  <span>Courses using <SiteName/></span>

CONNECT_LINKS =
    support_mailing_list :
        bold : true
        icon : 'list-alt'
        href : 'https://groups.google.com/forum/?fromgroups#!forum/cocalc'
        link : <span>Mailing list</span>
    sagemath_blog :
        icon : 'rss'
        href : 'http://blog.sagemath.com/'
        link : 'News and updates on our blog'
    twitter :
        icon : 'twitter-square'
        href : 'https://twitter.com/co_calc'
        link : 'follow @co_calc on twitter'
    facebook :
        icon : 'facebook-square'
        href : 'https://www.facebook.com/SageMathCloudOnline/'
        link : 'Like our facebook page'
    google_plus :
        icon : 'google-plus-square'
        href : 'https://plus.google.com/117696122667171964473/posts'
        link : <span>+1 our Google+ page</span>
    github :
        icon : 'github-square'
        href : 'https://github.com/sagemathinc/cocalc'
        link : 'GitHub'
        text : 'source code, bug tracker and issue database'
    github_issue_tracker :
        icon : 'exclamation-circle'
        href : 'https://github.com/sagemathinc/smc/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aopen%20label%3AI-bug%20sort%3Acreated-asc%20-label%3Ablocked'
        link : 'Bugs'

THIRD_PARTY =
    sagemath :
        icon : 'cc-icon-sagemath'
        href : 'http://www.sagemath.org/help.html'
        link : 'SageMath'
        text : <span>documentation, help, support and books</span>
    r :
        icon : 'cc-icon-r'
        href : 'https://cran.r-project.org/doc/manuals/r-release/R-intro.html'
        link : 'An Introduction to R'
        text : 'open source statistics software'
    python :
        icon : 'cc-icon-python'
        href : 'http://www.scipy-lectures.org/'
        link : 'Scientific Python'
        text : <span>see also{' '}
                    <a href='http://statsmodels.sourceforge.net/stable/' target='_blank'>Statsmodels</a>,{' '}
                    <a href='http://pandas.pydata.org/pandas-docs/stable/' target='_blank'>Pandas</a>,{' '}
                    <a href='http://docs.sympy.org/latest/index.html' target='_blank'>SymPy</a>,{' '}
                    <a href='http://scikit-learn.org/stable/documentation.html' target='_blank'>Scikit Learn</a> and many more
               </span>
    julia :
        icon : 'building-o'
        href : 'http://docs.julialang.org/en/stable/manual/introduction/'
        link : 'Julia'
        text : 'programming language for numerical computing'
    tensorflow :
        icon : 'lightbulb-o'
        href : 'https://www.tensorflow.org/get_started/get_started'
        link : 'Tensorflow'
        text : 'open-source software library for machine intelligence'
    latex :
        icon : 'sticky-note-o'
        href : 'https://en.wikibooks.org/wiki/LaTeX'
        link : 'LaTeX introduction'
    linux :
        icon : 'linux'
        href : 'http://ryanstutorials.net/linuxtutorial/'
        link : 'Linux tutorial'


ABOUT_LINKS =
    legal :
        icon : 'cc-icon-section'
        link : 'Terms of Service, Pricing, Copyright and Privacy policies'
        href : '/policies/index.html'
    developers :
        icon : 'keyboard-o'
        text : <span>
                Core fulltime developers: John Jeng,{' '}
                <a target='_blank' href='http://harald.schil.ly/'>Harald Schilly</a>,{' '}
                <a target="_blank" href='https://twitter.com/haldroid?lang=en'>Hal Snyder</a>,{' '}
                <a target='_blank' href='http://wstein.org'>William Stein</a>
               </span>
    #funding :
    #    <span>
    #        <SiteName/> currently funded by paying customers, private investment, and <a target='_blank'  href="https://cloud.google.com/developers/startups/">the Google startup program</a>
    #    </span>
    #launched :
    #    <span>
    #        <SiteName/> launched (as "SageMathCloud") April 2013 with support from the National Science Foundation and
    #        <a target='_blank' href='https://research.google.com/university/relations/appengine/index.html'> the Google
    #        Education Grant program</a>
    #    </span>
    incorporated :
        icon : 'gavel'
        text : 'SageMath, Inc. (a Delaware C Corporation) was incorporated Feb 2, 2015'


LinkList = rclass
    displayName : 'HelpPage-LinkList'

    propTypes :
        title : rtypes.string.isRequired
        icon  : rtypes.string.isRequired
        links : rtypes.object.isRequired
        width : rtypes.number

    getDefaultProps: ->
        width : 6

    render_links: ->
        {commercial} = require('./customize')
        for name, data of @props.links
            if data.commercial and not commercial
                continue
            style = misc.copy(li_style)
            if data.bold
                style.fontWeight = 'bold'
            <div key={name} style={style} className={if data.className? then data.className}>
                <Icon name={data.icon} fixedWidth />{' '}
                { <a target={if data.href.indexOf('#') != 0 then '_blank'} href={data.href}>
                   {data.link}
                </a> if data.href}
                {<span style={color:COLORS.GRAY_D}>
                   {<span> &mdash; </span> if data.href }
                   {data.text}
                </span> if data.text}
            </div>

    render: ->
        <Col md={@props.width} sm={12}>
            <h3> <Icon name={@props.icon} /> {@props.title}</h3>
            {@render_links()}
        </Col>

HelpPageGettingStartedSection = rclass
    displayName : 'Help-HelpPageGettingStartedSection'

    get_panel_header: (icon, header) ->
        <div><Icon name={icon} fixedWidth /> {header}</div>

    insert_sample_function: ->
        '$J_\\alpha(x) = \\sum\\limits_{m=0}^\\infty \\frac{(-1)^m}{m! \\, \\Gamma(m + \\alpha + 1)}{\\left({\\frac{x}{2}}\\right)}^{2 m + \\alpha}$'

    componentDidMount: ->
        @update_mathjax()

    componentDidUpdate: ->
        @update_mathjax()

    update_mathjax: ->
        $(ReactDOM.findDOMNode(@)).mathjax()

    render: ->
        BASE_URL = require('./misc_page').BASE_URL
        <div>
            <h3 id='help-page-getting-started'><Icon name='cubes' /> Getting started with <SiteName/></h3>

            <Accordion>
                <Panel header={@get_panel_header('user', 'Change your name, email address, or password')} eventKey='2'>
                    <p>
                        <a target='_blank' href='https://www.youtube.com/watch?v=A9zltIsU2cM'><Icon name='youtube-play' /> video</a>
                    </p>
                    <p>
                        Log into <a target='_blank' href={BASE_URL}>{BASE_URL}</a>,
                        then click in the upper right corner on your email address by
                        the <Icon name='cog' /> icon.
                        Change your first or last name in the settings tab that appears, then click save.
                    </p>
                    <p>
                        To change your password, click the "Change password" link, enter your old password,
                        then enter a new password.
                    </p>

                    <p>
                        To change the email account that is linked to your <SiteName/> account, click
                        on the "change" link next to your email address, type in the password (to your <SiteName/>
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

                <Panel header={@get_panel_header('line-chart', <span>Watch a March 2015 talk about all of the main features of <SiteName/></span>)} eventKey='4'>
                    William Stein (lead developer of <SiteName/>) gave the following one-hour talk in March 2015 at
                    the <a target='_blank' href='http://escience.washington.edu/'>UW eScience Institute</a>:
                    <p>
                        <a target='_blank' href='https://www.youtube.com/watch?v=_ff2HdME8MI'><Icon name='youtube-play' /> video</a>
                    </p>
                </Panel>

                <Panel header={@get_panel_header('pencil-square-o', <span>How to work with LaTeX</span>)} eventKey='5'>
                    <ul>
                        <li><a target='_blank' href='https://www.youtube.com/watch?v=IaachWg4IEQ'><Icon name='youtube-play' /> video1</a></li>
                        <li><a target='_blank' href='https://www.youtube.com/watch?v=cXhnX3UtizI'><Icon name='youtube-play' /> video2</a></li>
                        <li><a target='_blank' href='https://www.youtube.com/playlist?list=PLnC5h3PY-znxc090kGv7W4FpbotlWsrm0'>
                        <Icon name='youtube-play' /> Introduction to LaTeX by Vincent Knight </a></li>
                    </ul>

                    <p>
                        <a target='_blank' href='http://www.latex-project.org/'>LaTeX</a> is a system for creating
                        professional quality documents, with excellent support for typesetting mathematical formulas
                        like {@insert_sample_function()}.
                        There are two main ways to use LaTeX in <SiteName/>:
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
                            <a target='_blank' href='http://doc.sagemath.org/html/en/tutorial/sagetex.html'> use
                            SageTex</a> (which should "just work"), make any of those programs re-run, and customize the
                            latex build command (e.g. using <a href="https://www.ctan.org/pkg/latexmk/" target="_blank">latexmk</a> with some extras:
                            <code>latexmk -pdf -bibtex -pdflatex='pdflatex --interact=nonstopmode --synctex=1 %O %S' '&lt;filename.tex&gt;'</code>).
                            If necessary, you can do extremely sophisticated processing of tex files
                            in a Terminal (<Icon name='plus-circle' /> New &rarr; Terminal), too.
                        </li>
                    </ol>

                </Panel>

                <Panel header={@get_panel_header('area-chart', 'Use R in SageMath worksheets')} eventKey='6'>
                    <div>
                        <a target='_blank' href='https://www.youtube.com/watch?v=JtVuX4yb70A'><Icon name='youtube-play' /> video</a>
                    </div>
                    <div>
                        In a project, click "<Icon name='plus-circle' /> New" then the
                        "Sage" button.  In the worksheet that appears, type <pre>%default_mode r</pre>
                        then press shift+enter to evaluate it.
                        For the rest of the worksheet, type normal R commands, followed by shift+enter.
                        Plotting should just work as usual in R.
                        See <a target='_blank' href='https://github.com/sagemath/cloud-examples/tree/master/r'>these
                        example worksheets</a>.
                    </div>
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
                        To support the collaborative nature of <SiteName/>,
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
                                <span style={fontFamily:'monospace'}> {BASE_URL}/[project_id]/port/jupyter</span> (you
                                will possibly have to refresh your browser if this takes too long the first time).
                                Any collaborator on your project can securely use the Jupyter notebook server by visiting
                                this link, but nobody else can.
                            </li>
                        </ul>
                    </div>
                </Panel>

            </Accordion>
        </div>

exports.HelpPage = HelpPage = rclass
    displayName : 'HelpPage'

    render: ->
        banner_style =
            backgroundColor : 'white'
            padding         : '15px'
            border          : "1px solid #{COLORS.GRAY}"
            borderRadius    : '5px'
            margin          : '20px 0'
            width           : '100%'
            fontSize        : '115%'
            textAlign       : 'center'
            marginBottom    : '30px'

        {SmcWikiUrl} = require('./customize')
        <Row style={padding:'10px', margin:'0px', overflow:'auto'}>
            <Col sm=10 smOffset=1 md=8 mdOffset=2 xs=12>
                <h3 style={textAlign: 'center', marginBottom: '30px'}>
                <img src="#{APP_LOGO}" style={width:'33%', height:'auto'} />
                <br/>
                <SiteDescription/>
                </h3>

                <div style={banner_style}>
                    <Icon name='medkit'/><Space/><Space/>
                    <strong>In case of any questions or problems, <em>do not hesitate</em> to create a <ShowSupportLink />.</strong>
                    <br/>
                    We want to know if anything is broken!
                </div>

                <Row>
                    <LinkList title='Help & Support' icon='support' links={SUPPORT_LINKS} />
                    <LinkList title='Connect' icon='plug' links={CONNECT_LINKS} />
                </Row>
                <Row style={marginTop:'20px'}>
                    <LinkList title='Available Software' icon='question-circle' links={THIRD_PARTY} />
                    <HelpPageUsageSection />
                </Row>
                <Row>
                    {<LinkList title='About' icon='info-circle' links={ABOUT_LINKS} width={12} /> if require('./customize').commercial}
                    {# <HelpPageGettingStartedSection /> }
                </Row>
            </Col>
            <Col sm=1 md=2 xsHidden></Col>
            <Col xs=12 sm=12 md=12>
                <Footer/>
            </Col>
        </Row>

exports._test =
    HelpPageSupportSection : <LinkList title='Help & Support' icon='support' links={SUPPORT_LINKS} />
    ConnectSection : <LinkList title='Connect' icon='plug' links={CONNECT_LINKS} />
    SUPPORT_LINKS : SUPPORT_LINKS
    CONNECT_LINKS : CONNECT_LINKS

