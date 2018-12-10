###
Theme configuration file for CoCalc

Copyright 2017, SageMath, Inc. -- ALL RIGHTS RESERVED

This file is not part of the open-source licensed release, because it contains information
specific to the company "SageMath, Inc." and the product "CoCalc".
Upon deployment, please replace this file with a suitable replacement (i.e. come up with your own name, etc.)

This is used mainly in the front-end, but some aspects are also used on the back-end
Note: it is not possible to "require" assets, like the logos -- they're defined in webapp/misc_page.
###

exports.SITE_NAME            = 'Open CoCalc'
exports.COMPANY_NAME         = undefined
exports.COMPANY_EMAIL        = undefined
exports.APP_TAGLINE          = 'Open-source CoCalc'
exports.DNS                  = 'localhost' # your DNS entry, e.g. "host.com"
exports.DOMAIN_NAME          = 'https://' + exports.DNS
exports.DISCUSSION_GROUP     = undefined
exports.WIKI_URL             = undefined
exports.DOC_URL              = 'https://doc.cocalc.com/'
exports.BLOG_URL             = undefined
exports.LIVE_DEMO_REQUEST    = undefined
exports.HELP_EMAIL           = undefined
exports.TWITTER_HANDLE       = undefined   # string, without the @
exports.BILLING_EMAIL        = undefined
exports.BILLING_ADDRESS      = '''
                               Billing Address
                               '''
exports.BILLING_TAXID        = null
exports.COPYRIGHT_AGENT_HTML = '''
                               Nobody. Please enter copyright agent.
                               '''

# this is used in smc-hub/email.coffee and hub.coffee to specify the template and ASM groups for sendgrid
exports.SENDGRID_TEMPLATE_ID    = null
# asm_group: 699 is for invites https://app.sendgrid.com/suppressions/advanced_suppression_manager
exports.SENDGRID_ASM_INVITES    = null
exports.SENDGRID_ASM_NEWSLETTER = null

# This is the applications color scheme
COLORS =
    BLUE_DDD : '#0E2B59'
    BLUE_DD  : '#2A5AA6'
    BLUE_D   : '#4474c0'  # use this for the logo background, etc.
    BLUE     : '#6690D2'
    BLUE_L   : '#80afff'
    BLUE_LL  : '#94B3E5'
    BRWN     : '#593E05'
    YELL_D   : '#bf7b00'
    YELL_L   : '#fbb635'
    GRAY_DDD : '#dddddd'
    GRAY_DD  : '#303030'
    GRAY_D   : '#434343'
    GRAY     : '#808080'
    GRAY_L   : '#c0c0c0'
    GRAY_L0  : '#e0e0e0'
    GRAY_LL  : '#eeeeee'
    GRAY_LLL : '#f5f5f5'
    # bootstrap 3 colors
    BS_BLUE_BGRND : "rgb(66, 139, 202)"
    BS_GREEN      : '#5CB85C'
    BS_GREEN_D    : '#449d44'
    BS_GREEN_DD   : '#398439'
    BS_RED        : '#dc3545'

# The definitions below add semantic meaning by using the colors

# navigation bar at the top
COLORS.TOP_BAR =
    BG          : COLORS.GRAY_LL
    HOVER       : COLORS.GRAY_LLL
    ACTIVE      : 'white'
    TEXT        : COLORS.GRAY
    TEXT_ACTIVE : COLORS.GRAY_D
    X           : COLORS.GRAY
    X_HOVER     : COLORS.GRAY_L
    SIGN_IN_BG  : COLORS.YELL_L

# landing page
COLORS.LANDING =
    LOGIN_BAR_BG  : COLORS.BLUE_D


exports.COLORS = COLORS
