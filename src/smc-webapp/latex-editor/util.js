const misc = require("smc-util/misc");

exports.parse_path = function(path) {
    let x = misc.path_split(path);
    let dir = x.head;
    let y = misc.separate_file_extension(x.tail);
    return { directory: x.head, base: y.name, filename: x.tail };
};
