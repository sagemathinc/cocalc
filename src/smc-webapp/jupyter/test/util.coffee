expect  = require('expect')

misc = require('smc-util/misc')
util = require('../util')

immutable = require('immutable')

describe 'test getting the Jupyter server url -- ', ->
    project_id = misc.uuid()

    it 'gets server url with no base url', ->
        global.window = {}
        url = util.get_server_url(project_id)
        expect(url).toBe("/#{project_id}/raw/.smc/jupyter")

    it 'gets server url with a base url', ->
        global.window = {smc_base_url: '/the/base/url'}
        url = util.get_server_url(project_id)
        expect(url).toBe("/the/base/url/#{project_id}/raw/.smc/jupyter")

describe 'test getting a blob url -- ', ->
    project_id = misc.uuid()

    it 'gets server url with no base url', ->
        global.window = {}
        extension = 'png'
        sha1 = '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33'
        url = util.get_blob_url(project_id, extension, sha1)
        expect(url).toBe("/#{project_id}/raw/.smc/jupyter/blobs/a.png?sha1=#{sha1}")

    it 'gets server url with a base url', ->
        global.window = {smc_base_url: '/the/base/url'}
        extension = 'png'
        sha1 = '0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33'
        url = util.get_blob_url(project_id, extension, sha1)
        expect(url).toBe("/the/base/url/#{project_id}/raw/.smc/jupyter/blobs/a.png?sha1=#{sha1}")

describe 'test getting a logo url -- ', ->
    project_id = misc.uuid()

    it 'gets server url with no base url', ->
        global.window = {}
        kernel = 'python2'
        url = util.get_logo_url(project_id, kernel)
        expect(url).toBe("/#{project_id}/raw/.smc/jupyter/kernelspecs/python2/logo-64x64.png")

    it 'gets server url with a base url', ->
        global.window = {smc_base_url: '/the/base/url'}
        kernel = 'python2'
        url = util.get_logo_url(project_id, kernel)
        expect(url).toBe("/the/base/url/#{project_id}/raw/.smc/jupyter/kernelspecs/python2/logo-64x64.png")


describe 'tests computing the sorted list of cell ids -- ', ->
    it 'a first simple test with two cells', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}})
        cell_list = util.sorted_cell_list(cells)
        expect(immutable.List.isList(cell_list)).toBe(true)
        expect(cell_list.toJS()).toEqual(['xyz', 'abc'])

    it 'test with 5 cells', ->
        cells = immutable.fromJS({'abc':{pos:1}, 'xyz':{pos:-1}, 'a5':{pos:-10}, 'b7':{pos:11}, 'x':{pos:0}})
        cell_list = util.sorted_cell_list(cells)
        expect(cell_list.toJS()).toEqual(['a5', 'xyz', 'x', 'abc', 'b7'])








