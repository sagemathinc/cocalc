actions = store = undefined
setup = (cb) -> (require('./setup').setup (err, x) -> actions=x; store=x?.store; cb(err))
{teardown} = require('./setup')

expect  = require('expect')

{IPynbImporter} = require('../import-from-ipynb')

describe 'test importing the most basic ipynb object -- ', ->
    importer = undefined
    ipynb = {"cells":[],"metadata":{"kernelspec":{"name":"python389"}}}

    it 'creates the importer object', ->
        importer = new IPynbImporter()

    it 'imports a simple object', ->
        importer.import(ipynb : ipynb)

    it 'confirms the kernel', ->
        expect(importer.kernel()).toBe('python389')

    it 'confirms there is one cell (one always gets added)', ->
        expect(importer.cells()).toEqual({0: { cell_type: 'code', exec_count: null, id: '0', input: '', output: null, pos: 0, type: 'cell' }})

describe 'multiline input and output that is an array --', ->
    importer = undefined

    it 'creates the importer object and imports', ->
        ipynb = {"cells":[{"cell_type":"code","execution_count":1,"metadata":{"collapsed":false},"outputs":[{"name":"stdout","output_type":"stream","text":["3\n","5\n"]}],"source":['print "3"\n','print "5"']}]}
        importer = new IPynbImporter()
        importer.import(ipynb : ipynb)

    it 'verifies input/output strings are merged', ->
        expect(importer.cells()).toEqual({ 0: { cell_type: 'code', exec_count: 1, id: '0', input: 'print "3"\nprint "5"', output: { 0: { name: 'stdout', output_type: 'stream', text: '3\n5\n' } }, pos: 0, type: 'cell' } })

describe 'test _get_new_id --', ->
    it 'use default new_id', ->
        importer = new IPynbImporter()
        importer.import()
        expect(importer._get_new_id()).toBe('1')

    it 'use custom new_id', ->
        importer = new IPynbImporter()
        importer.import
            new_id: (is_available) ->
                if is_available('0') # first time
                    return '0'
                # second time
                expect(is_available('0')).toBe(false)
                return 'cocalc'
        expect(importer._get_new_id()).toBe('cocalc')

describe 'test call process function --', ->
    it 'mutate some output', ->
        importer = new IPynbImporter()
        importer.import
            ipynb : {"cells":[{"cell_type":"code","execution_count":1,"metadata":{"collapsed":false},"outputs":[{"name":"stdout","output_type":"stream","text":["3\n","5\n"]}],"source":['print "3"\n','print "5"']}]}
            process : (content) ->
                expect(content).toEqual({ name: 'stdout', output_type: 'stream', text: '3\n5\n' })
                # Now mutate in a devious way:
                content.text = 'cocalc'
        expect(importer.cells()[0].output[0]).toEqual({ name: 'stdout', output_type: 'stream', text: 'cocalc' } )


