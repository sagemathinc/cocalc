##############################################################################
#
#    CoCalc: Collaborative Calculation in the Cloud
#
#    Copyright (C) 2018, Sagemath Inc.
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
# This is the Open-CoCalc information page
###

if global['BACKEND']  # set in ./render.coffee
    BASE_URL = require('smc-util/theme').DOMAIN_NAME
else
    # browser
    {BASE_URL} = require('./misc_page')

$ = window.$
misc = require('smc-util/misc')
{React, ReactDOM, redux, rtypes, rclass} = require('./app-framework')
{Well, Col, Row, Accordion, Panel, ProgressBar, Table} = require('react-bootstrap')
{Icon, Loading, Space, TimeAgo, UNIT, Footer} = require('./r_misc')
{HelpEmailLink, SiteName, SiteDescription, PolicyPricingPageUrl, SmcWikiUrl} = require('./customize')
{COLORS, HELP_EMAIL, WIKI_URL, TWITTER_HANDLE, LIVE_DEMO_REQUEST, SITE_NAME} = require('smc-util/theme')


ABOUT_LINKS =
    agpl3:
        icon : 'cc-icon-section'
        href : 'https://www.gnu.org/licenses/agpl-3.0.de.html'
        link : <span>
                Open CoCalc is licensed under the terms of the{' '}
                <a href="https://www.gnu.org/licenses/agpl-3.0.de.html">GNU AGPL3 license</a>.{' '}
                (see <a href="https://github.com/sagemathinc/cocalc/blob/master/LICENSE.md" target="_blank">License.md</a>)
               </span>
    trademark:
        icon : 'cc-icon-section'
        href : 'http://tsdr.uspto.gov/#caseNumber=87155974&caseType=SERIAL_NO&searchType=statusSearch'
        link : '"CoCalc" is a registered trademark.'
    docker_image:
        icon : 'window-maximize'
        href : 'https://github.com/sagemathinc/cocalc/blob/master/src/dev/docker/README.md'
        link : <span>CoCalc Docker image for offline usage</span>
    cocalc_api :
        icon : 'gears'
        href : "#{BASE_URL}/doc/api.html"
        link :  <span><SiteName/> API</span>


CONNECT_LINKS =
    share :
        bold : true
        icon : 'bullhorn'
        href : "#{BASE_URL}/share"
        link : 'Shared public files'
    support_mailing_list :
        icon : 'list-alt'
        href : 'https://groups.google.com/forum/?fromgroups#!forum/cocalc'
        link : <span>Official CoCalc mailing list</span>
    github :
        icon : 'github-square'
        href : 'https://github.com/sagemathinc/cocalc'
        link : 'GitHub'
        text : <span>
                 <a href='https://github.com/sagemathinc/cocalc/tree/master/src' target='_blank'>source code</a>,{' '}
                 <a href='https://github.com/sagemathinc/cocalc/issues?utf8=%E2%9C%93&q=is%3Aissue%20is%3Aopen%20label%3AI-bug%20sort%3Acreated-asc%20-label%3Ablocked' target='_blank'>bugs</a>
                 {' and '}
                 <a href='https://github.com/sagemathinc/cocalc/issues' target='_blank'>issues</a>
               </span>

THIRD_PARTY =
    sagemath :
        icon : 'cc-icon-sagemath'
        href : 'http://www.sagemath.org/'
        link : 'SageMath'
        text : <span>open-source mathematical software</span>
    r :
        icon : 'cc-icon-r'
        href : 'https://cran.r-project.org/doc/manuals/r-release/R-intro.html'
        link : 'R project'
        text : 'the #1 open-source statistics software'
    python :
        icon : 'cc-icon-python'
        href : 'http://www.scipy-lectures.org/'
        link : 'Scientific Python'
        text : <span>i.e.{' '}
                    <a href='http://statsmodels.sourceforge.net/stable/' target='_blank'>Statsmodels</a>,{' '}
                    <a href='http://pandas.pydata.org/pandas-docs/stable/' target='_blank'>Pandas</a>,{' '}
                    <a href='http://docs.sympy.org/latest/index.html' target='_blank'>SymPy</a>,{' '}
                    <a href='http://scikit-learn.org/stable/documentation.html' target='_blank'>Scikit Learn</a>,{' '}
                    <a href='http://www.nltk.org/' target='_blank'>NLTK</a> and many more
               </span>
    octave :
        icon : 'cc-icon-octave'
        href : 'https://www.gnu.org/software/octave/'
        link : 'GNU Octave'
        text : 'scientific programming language, largely compatible with MATLAB'
    latex :
        icon : 'cc-icon-tex-file'
        href : 'https://en.wikibooks.org/wiki/LaTeX'
        link : 'LaTeX'
        text : 'high-quality typesetting program'
    linux :
        icon : 'linux'
        href : 'http://ryanstutorials.net/linuxtutorial/'
        link : 'GNU/Linux'
        text : 'operating system and utility toolbox'



# List item style
li_style = exports.li_style =
    lineHeight    : 'inherit'
    marginBottom  : '10px'

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
            {<h3> <Icon name={@props.icon} /> {@props.title}</h3> if @props.title}
            {@render_links()}
        </Col>


# this can't be converted to a static page
AboutCoCalcPageHeader = rclass
    displayName : 'Page-AboutCoCalc-Header'

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

        {APP_LOGO}        = require('./art')

        <Row style={padding:'10px', margin:'0px', overflow:'auto'}>
            <h3 style={textAlign: 'center', marginBottom: '30px'}>
                <img src="#{APP_LOGO}" style={width:'33%', height:'auto'} />
                <br/>
                <SiteDescription/>
            </h3>

            <div style={banner_style}>
                <strong>Welcome to the open-souce edition of <a href="https://cocalc.com">CoCalc</a>!</strong>
                <br />
                For support, please contact your system administration team at <HelpEmailLink />.
            </div>
        </Row>


AboutCoCalcPageBody = rclass
    displayName : 'Page-AboutCoCalc-Body'

    description: ->
        <div>
            Welcome to ...
        </div>

    render: ->
        <Col xs={12} sm={12} md={12}>
            <Row>
                {@description()}
            </Row>
            <Row>
                <LinkList title='About Open CoCalc' icon='plug' links={ABOUT_LINKS} width={12} />
            </Row>
            <Row>
                <LinkList title='Connect' icon='plug' links={CONNECT_LINKS} width={12} />
            </Row>
            <Row>
                <LinkList title='Software' icon='support' links={THIRD_PARTY} width={12} />
            </Row>
        </Col>


AboutCoCalcPage = rclass
    displayName : 'Page-AboutCoCalc'

    render: ->
        <Row style={padding:'10px', margin:'0px', overflow:'auto'}>
            <AboutCoCalcPageHeader/>
            <AboutCoCalcPageBody />
            <Col xs={12} sm={12} md={12}>
                <Footer/>
            </Col>
        </Row>


exports.render_static_cocalc_about = ->
    <AboutCoCalcPageBody />


exports._test =
    ConnectSection : <LinkList title='Connect' icon='plug' links={CONNECT_LINKS} />
    ABOUT_LINKS : ABOUT_LINKS
    CONNECT_LINKS : CONNECT_LINKS

