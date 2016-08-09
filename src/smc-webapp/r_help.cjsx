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


{React, ReactDOM, redux, Redux, rtypes, rclass} = require('./smc-react')

{Well, Col, Row, Accordion, Panel, ProgressBar} = require('react-bootstrap')

{Icon, Loading, Space, TimeAgo, UNIT, SAGE_LOGO_COLOR, Footer} = require('./r_misc')

{HelpEmailLink, SiteName, SiteDescription, PolicyPricingPageUrl} = require('./customize')

{ShowSupportLink} = require('./support')

{RECENT_TIMES, RECENT_TIMES_KEY} = require('smc-util/schema')

#{SMC_ICON_URL} = require('./misc_page')
SMC_ICON_URL = require('salvus-icon.svg')


# CSS
li_style =
    lineHeight : 'inherit'
    marginTop  : '0.7ex'

HelpPageUsageSection = rclass
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
            active_projects     : rtypes.number # deprecated
            last_hour_projects  : rtypes.number # deprecated
            last_day_projects   : rtypes.number # deprecated
            last_week_projects  : rtypes.number # deprecated
            last_month_projects : rtypes.number # deprecated

    displayName : 'HelpPage-HelpPageUsageSection'

    getDefaultProps : ->
       loading : true

    number_of_clients : ->
        if @props.hub_servers.length == 0
            0
        else
            (x['clients'] for x in @props.hub_servers).reduce((s,t) -> s+t)

    render_signed_in_stats : ->
        if @props.loading
            <li style={li_style}> Live server stats <Loading /> </li>
        else
            n = @number_of_clients()
            <ProgressBar now={Math.max(n / 6 , 45 / 8) } label={"#{n} connected users"} />

    render_active_projects_stats: ->
        n = @props.projects_edited?[RECENT_TIMES_KEY.active] ? @props.active_projects
        <ProgressBar now={Math.max(n / 3, 60 / 2)} label={"#{n} projects being edited"} />

    render_recent_usage_stats : ->
        if not @props.loading
            <li style={li_style}>
                Users modified
                <strong> {@props.projects_edited?[RECENT_TIMES_KEY.last_hour]  ? @props.last_hour_projects} projects</strong> in the last hour,
                <strong> {@props.projects_edited?[RECENT_TIMES_KEY.last_day]   ? @props.last_day_projects} projects</strong> in the last day,
                <strong> {@props.projects_edited?[RECENT_TIMES_KEY.last_week]  ? @props.last_week_projects} projects</strong> in the last week and
                <strong> {@props.projects_edited?[RECENT_TIMES_KEY.last_month] ? @props.last_month_projects} projects</strong> in the last month
            </li>

    render_historical_usage : ->
        <li key='usage_data' style={li_style}>
            <a target='_blank' href='https://cloud.sagemath.com/7561f68d-3d97-4530-b97e-68af2fb4ed13/raw/stats.html'>
                <Icon name='line-chart' fixedWidth />Historical usage statistics
            </a> &mdash; number of projects and users over time
        </li>

    render_historical_metrics : ->
        <li key='usage_metrics' style={li_style}>
            <a target='_blank' href='https://cloud.sagemath.com/b97f6266-fe6f-4b40-bd88-9798994a04d1/raw/metrics/metrics.html'>
                <Icon name='area-chart' fixedWidth />Historical system metrics
            </a> &mdash; CPU usage, running projects and software instances, etc
        </li>

    render_when_updated : ->
        if @props.time
            <span style={fontSize: '9pt', marginLeft: '20px', color: '#666'}>
                updated <TimeAgo date={new Date(@props.time)} />
            </span>

    render : ->
        <div>
            <h3>
                <Icon name='dashboard' /> System usage
                {@render_when_updated()}
            </h3>
            <ul>
                {@render_signed_in_stats()}
                {@render_active_projects_stats()}
                {@render_recent_usage_stats()}
                {@render_historical_usage()}
                {@render_historical_metrics()}
            </ul>
        </div>


SUPPORT_LINKS =
    pricing :
        icon : 'money'
        href : PolicyPricingPageUrl
        link : 'Pricing and subscription options'
    # commented out since link doesn't work
    #getting_started :
    #    icon : 'play'
    #    href : '#help-page-getting-started'
    #    link : <span>Getting started with <SiteName/></span>
    teaching :
        icon : 'users'
        #href : 'http://www.beezers.org/blog/bb/2015/09/grading-in-sagemathcloud/'
        #href : 'http://sagemath.blogspot.com/2014/10/sagemathcloud-course-management.html'
        href : 'https://github.com/mikecroucher/SMC_tutorial/blob/master/README.md'
        link : <span>Teaching a course with SageMathCloud</span>
    courses :
        icon : 'graduation-cap'
        href : 'https://github.com/sagemathinc/smc/wiki/Teaching'
        link :  <span>List of courses that use SageMathCloud</span>
    realtime_chat :
        icon : 'comments-o'
        href : 'https://gitter.im/sagemath/cloud'
        link : 'Realtime chat and help'
    frequently_asked_questions :
        icon : 'question-circle'
        href : 'https://github.com/sagemathinc/smc/wiki/FAQ'
        link : 'Frequently Asked Questions'
    # removed since none of us SMC devs use ask.sagemath these days
    #quick_question :
    #    icon : 'question-circle'
    #    href : 'http://ask.sagemath.org/questions/'
    #    link : 'Ask a quick question'
    github :
        icon : 'github-square'
        href : 'https://github.com/sagemathinc/smc'
        link : 'Complete source code'
        text : <span>(SageMathCloud is 100% open source)</span>
    github_issue_tracker :
        icon : 'exclamation-circle'
        href : 'https://github.com/sagemathinc/smc/issues'
        link : 'Github issue tracker'
    support_mailing_list :
        icon : 'life-ring'
        href : 'https://groups.google.com/forum/?fromgroups#!forum/sage-cloud'
        link : <span>Support mailing list</span>
    developer_mailing_list :
        icon : 'envelope-o'
        href : 'https://groups.google.com/forum/?fromgroups#!forum/sage-cloud-devel'
        link : <span>Developer mailing list</span>
    sagemath_blog :
        icon : 'rss'
        href : 'http://sagemath.blogspot.com/'
        link : <span>Blog</span>
    google_plus_smc :
        icon : 'google-plus-square'
        href : 'https://plus.google.com/117696122667171964473/posts'
        link : <span>Google+</span>
        text : 'updates'
    google_plus :
        icon : 'google-plus-square'
        href : 'https://plus.google.com/115360165819500279592/posts'
        link : 'Google+ William Stein'
        text : 'development updates'
    twitter :
        icon : 'twitter-square'
        href : 'https://twitter.com/wstein389'
        link : 'Twitter'
        text : 'the Twitter feed'
    general_sagemath :
        icon : 'superscript'
        href : 'http://www.sagemath.org/help.html'
        link : 'General SageMath help and support pages'
    chrome_app :
        icon      : 'google'
        href      : 'https://chrome.google.com/webstore/detail/the-sagemath-cloud/eocdndagganmilahaiclppjigemcinmb'
        link      : 'Install the Chrome App'
        className : 'salvus-chrome-only'
    user_survey :
        icon      : 'pencil-square'
        href      : 'https://docs.google.com/forms/d/1Odku9JuqYOVUHF4p5CXZ_Fl-7SIM3ApYexabfTV1O2o/viewform?usp=send_form'
        link      : 'SageMathCloud User Survey'

HelpPageSupportSection = rclass
    displayName : 'HelpPage-HelpPageSupportSection'

    propTypes :
        support_links : rtypes.object

    get_support_links : ->
        for name, data of @props.support_links
            <li key={name} style={li_style} className={if data.className? then data.className}>
                <a target={if data.href.indexOf('#') != 0 then '_blank'} href={data.href}>
                    <Icon name={data.icon} fixedWidth /> {data.link}
                </a> <span style={color:'#666'}>{data.text}</span>
            </li>

    render : ->
        <div>
            <h3> <Icon name='support' /> Support</h3>
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
            <a target='_blank' href='http://wstein.org'>William Stein</a> and <a target='_blank' href='http://harald.schil.ly/'>
            Harald Schilly</a> develop and run <SiteName/>, and <a href='https://github.com/sagemathinc/smc/graphs/contributors' target='_blank'>many people  contribute code</a>
        </span>
    funding :
        <span>
            <SiteName/> currently funded by paying customers, private investment, and <a target='_blank'  href="https://cloud.google.com/developers/startups/">the Google startup program</a>
        </span>
    launched :
        <span>
            <SiteName/> launched (as "SageMathCloud") April 2013 with support from the National Science Foundation and
            <a target='_blank' href='https://research.google.com/university/relations/appengine/index.html'> the Google
            Education Grant program</a>
        </span>
    incorporated :
        'SageMath, Inc. (a Delaware C Corporation) was incorporated Feb 2, 2015'

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

    componentDidMount : ->
        @update_mathjax()

    componentDidUpdate : ->
        @update_mathjax()

    update_mathjax: ->
        $(ReactDOM.findDOMNode(@)).mathjax()

    render : ->
        <div>
            <h3 id='help-page-getting-started'><Icon name='cubes' /> Getting started with <SiteName/></h3>

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
                                especially when you start using <SiteName/> frequently.
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

                <Panel header={@get_panel_header('line-chart', 'Get a bunch of examples')} eventKey='3'>
                    <div>
                        You can browse and copy a <a target='blank' href="https://cloud.sagemath.com/projects/4a5f0542-5873-4eed-a85c-a18c706e8bcd/files/cloud-examples/">collection of examples</a>.
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

exports.HelpPage = HelpPage = rclass
    displayName : 'HelpPage'

    render : ->
        <Row>
            <Col sm=10 smOffset=1 md=8 mdOffset=2 xs=12>
                <div style={backgroundColor: 'white', padding: '15px', border: '1px solid lightgrey', borderRadius: '5px', margin:'auto', width:'100%', fontSize: '110%', textAlign: 'center'}>
                    <Icon name='medkit'/><Space/><Space/>
                    <strong>In case of any questions or problems, <em>do not hesitate</em> to create a <ShowSupportLink />.</strong>
                    <br/>
                    We want to know if anything is broken!
                    <hr/>
                    <Icon name='envelope'/><Space/><Space/> You can also send an email to <HelpEmailLink />.
                    <br/>
                    In such an email, please include the URL link to the relevant project or file.
                </div>

                <h3>
                    <div style={display: 'inline-block', \
                                backgroundImage: "url('#{SMC_ICON_URL}')", \
                                backgroundSize: 'contain', \
                                backgroundColor: SAGE_LOGO_COLOR}
                          className='img-rounded pull-right help-smc-logo' ></div>
                    <SiteName/> <SiteDescription/>
                </h3>

                <HelpPageSupportSection support_links={SUPPORT_LINKS} />

                <Redux redux={redux}>
                    <HelpPageUsageSection />
                </Redux>

                <HelpPageAboutSection />

                <HelpPageGettingStartedSection />
            </Col>
            <Col sm=1 md=2 xsHidden></Col>
            <Col xs=12 sm=12 md=12>
                <Footer/>
            </Col>
        </Row>

exports.render_help_page = () ->
    ReactDOM.render(<HelpPage />, document.getElementById('salvus-help'))
    # also setup a listener for switching to the page. (TODO: temporary until react-router...)
    require('./top_navbar').top_navbar.on "switch_to_page-salvus-help", () ->
        window.history.pushState("", "", window.smc_base_url + '/help')

exports._test =
    HelpPageSupportSection : HelpPageSupportSection
    SUPPORT_LINKS : SUPPORT_LINKS

