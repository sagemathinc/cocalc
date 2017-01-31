fs        = require('fs')
temp      = require('temp')
child_process = require('child_process')

async     = require('async')
winston   = require('winston')

message   = require('smc-util/message')
misc_node = require('smc-util-node/misc_node')
misc      = require('smc-util/misc')

common    = require('./common')

###############################################
# Read and write individual files
###############################################

# Read a file located in the given project.  This will result in an
# error if the readFile function fails, e.g., if the file doesn't
# exist or the project is not open.  We then send the resulting file
# over the socket as a blob message.
#
# Directories get sent as a ".tar.bz2" file.
# TODO: should support -- 'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'. and mesg.archive option!!!
#
exports.read_file_from_project = (socket, mesg) ->
    #dbg = (m) -> winston.debug("read_file_from_project(path='#{mesg.path}'): #{m}")
    #dbg()
    data    = undefined
    path    = misc_node.abspath(mesg.path)
    is_dir  = undefined
    id      = undefined
    archive = undefined
    stats   = undefined
    async.series([
        (cb) ->
            #dbg("Determine whether the path '#{path}' is a directory or file.")
            fs.stat path, (err, _stats) ->
                if err
                    cb(err)
                else
                    stats = _stats
                    is_dir = stats.isDirectory()
                    cb()
        (cb) ->
            # make sure the file isn't too large
            cb(common.check_file_size(stats.size))
        (cb) ->
            if is_dir
                if mesg.archive != 'tar.bz2'
                    cb("The only supported directory archive format is tar.bz2")
                    return
                target  = temp.path(suffix:'.' + mesg.archive)
                #dbg("'#{path}' is a directory, so archive it to '#{target}', change path, and read that file")
                archive = mesg.archive
                if path[path.length-1] == '/'  # common nuisance with paths to directories
                    path = path.slice(0,path.length-1)
                split = misc.path_split(path)
                path = target
                # same patterns also in project.coffee (TODO)
                args = ["--exclude=.sagemathcloud*", '--exclude=.forever', '--exclude=.node*', '--exclude=.npm', '--exclude=.sage', '-jcf', target, split.tail]
                #dbg("tar #{args.join(' ')}")
                child_process.execFile 'tar', args, {cwd:split.head}, (err, stdout, stderr) ->
                    if err
                        winston.debug("Issue creating tarball: #{err}, #{stdout}, #{stderr}")
                        cb(err)
                    else
                        cb()
            else
                #dbg("It is a file.")
                cb()

        (cb) ->
            #dbg("Read the file into memory.")
            fs.readFile path, (err, _data) ->
                data = _data
                cb(err)

        (cb) ->
            id = misc_node.uuidsha1(data)
            #dbg("sha1 hash = '#{id}'")
            cb()
        (cb) ->
            #dbg("send the file as a blob back to the hub.")
            socket.write_mesg 'json', message.file_read_from_project(id:mesg.id, data_uuid:id, archive:archive)
            socket.write_mesg 'blob', {uuid:id, blob:data}
            cb()
    ], (err) ->
        if err and err != 'file already known'
            socket.write_mesg('json', message.error(id:mesg.id, error:err))
        if is_dir
            fs.exists path, (exists) ->
                if exists
                    #dbg("It was a directory, so remove the temporary archive '#{path}'.")
                    fs.unlink(path)
    )

exports.write_file_to_project = (socket, mesg) ->
    #dbg = (m) -> winston.debug("write_file_to_project(path='#{mesg.path}'): #{m}")
    #dbg()

    data_uuid = mesg.data_uuid
    path = misc_node.abspath(mesg.path)

    # Listen for the blob containing the actual content that we will write.
    write_file = (type, value) ->
        if type == 'blob' and value.uuid == data_uuid
            socket.removeListener('mesg', write_file)
            async.series([
                (cb) ->
                    misc_node.ensure_containing_directory_exists(path, cb)
                (cb) ->
                    #dbg('writing the file')
                    fs.writeFile(path, value.blob, cb)
            ], (err) ->
                if err
                    #dbg("error writing file -- #{err}")
                    socket.write_mesg 'json', message.error(id:mesg.id, error:err)
                else
                    #dbg("wrote file '#{path}' fine")
                    socket.write_mesg 'json', message.file_written_to_project(id:mesg.id)
            )
    socket.on('mesg', write_file)

