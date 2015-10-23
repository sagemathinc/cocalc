expect = require('expect')

misc_node = require('../misc_node')

describe 'computing a sha1 hash: ', ->
    expect(misc_node.sha1("SageMathCloud")).toBe('31acd8ca91346abcf6a49d2b1d88333f439d57a6')




