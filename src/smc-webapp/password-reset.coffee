exports.reset_password_key = ->
    url_args = window.location.href.split("#")
    # toLowerCase is important since some mail transport agents will uppercase the URL -- see https://github.com/sagemathinc/cocalc/issues/294
    if url_args.length == 2 and url_args[1].slice(0, 6).toLowerCase() == 'forgot'
        return url_args[1].slice(7, 7+36).toLowerCase()
    return undefined

