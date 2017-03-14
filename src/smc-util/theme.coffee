# Theme file for CoCalc
# This is used mainly in the front-end, but some aspects are also used on the back-end
# Note: it is not possible to "require" assets, like the logos. They're in webapp's misc_page defined.

exports.DEFAULT_SITE_NAME = 'CoCalc'
exports.APP_TAGLINE = 'Collaborative Calculations in the Cloud'
exports.DEFAULT_DOMAIN_NAME = 'https://cocalc.com'

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

COLORS.TOP_BAR =
    BG          : COLORS.GRAY_L
    HOVER       : COLORS.GRAY_LL
    ACTIVE      : 'white'
    TEXT        : COLORS.GRAY_D
    TEXT_ACTIVE : COLORS.GRAY_D

COLORS.LANDING =
    TOP_BAR_BG  : COLORS.BLUE_D


exports.COLORS = COLORS