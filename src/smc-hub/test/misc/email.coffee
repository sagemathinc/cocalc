require('ts-node').register()

expect  = require('expect')

email = require('../../email')

describe 'test email blocking -- ', ->
    it 'tries one that works', ->
        expect(email.is_banned('a@b.c')).toBe(false)

    it 'tries one that fails', ->
        expect(email.is_banned('a@qq.com')).toBe(true)

    it 'tries one that fails', ->
        expect(email.is_banned('XX@QQ.com')).toBe(true)

    it 'tries one that fails', ->
        expect(email.is_banned('a@qq.com')).toBe(true)

describe 'email body escaping', ->
    it 'removes anchors', ->
        html = 'test <a href="http://bad.com">good</a> foo'
        clean = 'test good foo'
        expect(email.escape_email_body(html)).toBe(clean)
    it 'keeps some tags as they are', ->
        html = '<h1>h1</h1><div>div<b>b</b></div><ul><li>li</li></ul>'
        expect(email.escape_email_body(html)).toBe(html)
    it 'fixes bad html', ->
        bad = '<div>div</p><p>p<li>'
        fixed = '<div>div<p></p><p>p<li></li></p></div>'
        expect(email.escape_email_body(bad)).toBe(fixed)

describe 'create_email_body', ->
    subject = 'subject'
    message = '<div>invite <b>message</ul>'
    recipient = 'foo@bar.com'
    proj_title = 'project-title'
    link2proj= 'https://foo.bar/uuid/'

    it 'contains instructions what to do', ->

        body = email.create_email_body(subject, message, recipient, proj_title, link2proj, false)
        expect(body).toInclude('<div>invite <b>message</b></div>') #sanitized
        expect(body).toInclude("<code>#{recipient}</code>")
        expect(body).toInclude("href=\'#{link2proj}\'")
        expect(body).toInclude("using <i>exactly</i> your email address")
        expect(body).toInclude(proj_title)

    it 'blocks URLs in the message', ->
        message = 'please goto <a href="http://bad.com">good.com</a> thank you'
        err = ''
        try
            email.create_email_body(subject, message, recipient, proj_title, link2proj, false)
        catch err0
            err = err0
        expect(err.message).toInclude('not allowed')


    it 'allow URLs in the message if told so', ->
        message = 'please goto <a href="http://bad.com">good.com</a> thank you'
        err = 'no-error'
        try
            email.create_email_body(subject, message, recipient, proj_title, link2proj, true)
        catch err0
            err = err0
        expect(err).toBe('no-error')
