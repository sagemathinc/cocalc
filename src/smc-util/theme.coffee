# Theme configuration file for CoCalc
# This is used mainly in the front-end, but some aspects are also used on the back-end
# Note: it is not possible to "require" assets, like the logos -- they're defined in webapp/misc_page.

exports.SITE_NAME     = 'CoCalc'
exports.COMPANY_NAME  = 'SageMath, Inc.'
exports.COMPANY_EMAIL = 'office@sagemath.com'
exports.APP_TAGLINE   = 'Collaborative Calculations in the Cloud'
exports.DNS           = 'cocalc.com'
exports.DOMAIN_NAME   = 'https://' + exports.DNS
exports.HELP_EMAIL    = 'help@sagemath.com'
exports.COPYRIGHT_AGENT_HTML = '''
                               William Stein (Copyright Agent)<br>
                               c/o SageMath, Inc.<br>
                               1212 East Barclay Court<br>
                               Seattle, WA 98122<br>
                               <a href='mailto:copyright@sagemath.com' target='_blank'>copyright@sagemath.com</a>
                               <br>
                               206-419-0925 (telephone)
                               '''

# this is used in smc-hub/email.coffee and hub.coffee to specify the template and ASM groups for sendgrid
exports.SENDGRID_TEMPLATE_ID    = '0375d02c-945f-4415-a611-7dc3411e2a78'
# asm_group: 699 is for invites https://app.sendgrid.com/suppressions/advanced_suppression_manager
exports.SENDGRID_ASM_INVITES    = 699
exports.SENDGRID_ASM_NEWSLETTER = 698

# This is the applications color scheme
COLORS =
    BLUE_D : '#4474c0'
    BLUE_L : '#80afff'
    YELL_D : '#bf7b00'
    YELL_L : '#fbb635'
    GRAY_D : '#434343'
    GRAY   : '#c0c0c0'
    GRAY_L : '#eeeeee'
    GRAY_LL: '#f5f5f5'
    BS_BLUE_BGRND : "rgb(66, 139, 202)"

# The definitions below add semantic meaning by using the colors

COLORS.TOP_BAR =
    BG          : COLORS.GRAY_L
    HOVER       : COLORS.GRAY_LL
    ACTIVE      : 'white'
    TEXT        : COLORS.GRAY_D
    TEXT_ACTIVE : COLORS.GRAY_D
    X           : COLORS.GRAY_D
    X_HOVER     : COLORS.GRAY

COLORS.LANDING =
    TOP_BAR_BG  : COLORS.BLUE_D


exports.COLORS = COLORS
