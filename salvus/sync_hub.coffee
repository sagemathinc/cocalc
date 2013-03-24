###

Code that runs on the local and global hubs that supports each sync type.

Supported Sync Types:

    * PlainText -- for text editing (compatible with PlainText and CodeMirror on the browser side)
    * SageWorksheet -- for using Sage; only compatible with SageWorksheet on the hub side.

###

diffsync = require('diffsync')

class PlainTextObj
    construct: (@string) =>
        @cursors = {}    
    to_string: () => 
        return @string        
    copy: () => 
        return new PlainTextObj(@string)
    diff: (version2) => # Compute a patch that transforms this into version2.
        return diffsync.dmp.patch_make(@string, version2.string)        
    patch: (patch) => # Apply a patch in place
        @string = diffsync.dmp.patch_apply(p, @string)[0]        
    checksum: () =>
        return @string.length        
    cursor: (user, location) =>
        @cursors[user] = location        
    