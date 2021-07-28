#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
#########################################################################

expect  = require('expect')

misc = require('smc-util/misc')
server_urls = require('../server-urls')

describe 'test getting the Jupyter server url -- ', ->
    project_id = misc.uuid()

    it 'gets server url with no base url', ->
        global.window = {}
        url = server_urls.get_server_url(project_id)
        expect(url).toBe("/#{project_id}/raw/.smc/jupyter")

    it 'gets server url with a base url', ->
        global.window = {app_base_path: '/the/base/url'}
        url = server_urls.get_server_url(project_id)
        expect(url).toBe("/the/base/url/#{project_id}/raw/.smc/jupyter")

describe 'test getting a blob url -- ', ->
    project_id = misc.uuid()

    it 'gets server url with no base url', ->
        global.window = {}
        extension = 'png'
        sha1 = '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33'
        url = server_urls.get_blob_url(project_id, extension, sha1)
        expect(url).toBe("/#{project_id}/raw/.smc/jupyter/blobs/a.png?sha1=#{sha1}")

    it 'gets server url with a base url', ->
        global.window = {app_base_path: '/the/base/url'}
        extension = 'png'
        sha1 = '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33'
        url = server_urls.get_blob_url(project_id, extension, sha1)
        expect(url).toBe("/the/base/url/#{project_id}/raw/.smc/jupyter/blobs/a.png?sha1=#{sha1}")

describe 'test getting a logo url -- ', ->
    project_id = misc.uuid()

    it 'gets server url with no base url', ->
        global.window = {}
        kernel = 'python2'
        url = server_urls.get_logo_url(project_id, kernel)
        expect(url).toBe("/#{project_id}/raw/.smc/jupyter/kernelspecs/python2/logo-64x64.png")

    it 'gets server url with a base url', ->
        global.window = {app_base_path: '/the/base/url'}
        kernel = 'python2'
        url = server_urls.get_logo_url(project_id, kernel)
        expect(url).toBe("/the/base/url/#{project_id}/raw/.smc/jupyter/kernelspecs/python2/logo-64x64.png")

