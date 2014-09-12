####################################################
#
# Client device features and capabilities.
#
####################################################

if not window.WebSocket?  # websocket support -- mark of a modern browser.
    $(".salvus_client_browser_warning").draggable().find(".fa-times").click () ->
        $(".salvus_client_browser_warning").hide()
    $(".salvus_client_browser_warning").show()

isMobile = exports.isMobile =
    Android    : () -> if navigator.userAgent.match(/Android/i) then true else false
    BlackBerry : () -> if navigator.userAgent.match(/BlackBerry/i) then true else false
    iOS        : () -> if navigator.userAgent.match(/iPhone|iPad|iPod/i) then true else false
    Windows    : () -> if navigator.userAgent.match(/IEMobile/i) then true else false
    any        : () -> if (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Windows()) then true else false

if not $.browser?
    $.browser = {}

$.browser.chrome = /chrom(e|ium)/.test(navigator.userAgent.toLowerCase());

exports.IS_MOBILE = exports.isMobile.any()

if $.browser.chrome
    $(".salvus-chrome-only").show()

$.browser.firefox = navigator.userAgent.toLowerCase().indexOf('firefox') > 0    