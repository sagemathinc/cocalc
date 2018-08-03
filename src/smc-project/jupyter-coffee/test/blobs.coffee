expect  = require('expect')

misc_node = require('smc-util-node/misc_node')

{blob_store} = require('../jupyter-blobs')

describe 'very basic tests of the blob store -- ', ->
    it 'gets a list of blobs (which should be empty)', ->
        expect(blob_store.keys()).toEqual([])

    # got via
    # require('./jupyter').kernel(name:'sage-7.4', verbose:false).execute_code(code:'point((0,0), axes=False, figsize=1)', all:true, cb:(e,m)->console.log(m[2].content.data))
    blob = 'iVBORw0KGgoAAAANSUhEUgAAAFkAAAA4CAYAAACWo1RQAAAABHNCSVQICAgIfAhkiAAAAAlwSFlz\nAAAPYQAAD2EBqD+naQAAAQVJREFUeJzt2iEOwjAcRvEPwuSSSY4AbmbciFNxil0DhYNj4CeGmAAc\nCF7T8H7JkrXqn5emqqt5nufop9alB/gHRgYYGWBkgJEBRgYYGWBkgJEBRgYYGWBkgJEBRgYYGWBk\ngJEBRgYYGWBkgJEBRgYYGWBkwKb0AN+435PTafk/HpOuKzvPp1a1vCCapuRwSC6XZd33yfmcNE3Z\nuT5RTeTbLdnv3/eu12S3KzPPN6q5k7fbpG2f67Zd9mpQTeSuS8YxGYblG0fvZL2o5iTXzMgAIwOM\nDDAywMgAIwOMDDAywMgAIwOMDDAywMgAIwOMDDAywMgAIwOMDDAywMgAIwOMDDAy4AEJciLL9Myg\nZwAAAABJRU5ErkJggg==\n'
    buffer = new Buffer(blob, 'base64')
    sha1 = misc_node.sha1(buffer)

    it 'saves a blob', ->
        expect(blob_store.save(blob, 'image/png')).toBe(sha1)
        expect(blob_store.keys()).toEqual([sha1])

    it 'reads a blob', ->
        expect(blob_store.get(sha1)).toEqual(buffer)

    it 'saves that blob again to increase ref account', ->
        expect(blob_store.save(blob, 'image/png')).toBe(sha1)

    it 'removes that blob once', ->
        blob_store.free(sha1)
        # but it is still there!
        expect(blob_store.keys()).toEqual([sha1])

    it 'removes that blob once more', ->
        blob_store.free(sha1)
        # GONE
        expect(blob_store.keys()).toEqual([])

    it 'removes that blob once more (not an error)', ->
        blob_store.free(sha1)
