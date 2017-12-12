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