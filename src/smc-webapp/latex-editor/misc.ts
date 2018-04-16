/*
This is a rewrite of what we're using from smc-util/misc... 
*/

export function path_split(path: string): { head: string; tail: string } {
    const v = path.split("/");
    return { head: v.slice(0, -1).join("/"), tail: v[v.length - 1] };
}

const filename_extension_re = /(?:\.([^.]+))?$/;
export function filename_extension(filename: string): string {
    filename = path_split(filename).tail;
    const ext = filename_extension_re.exec(filename)[1];
    if (ext != null) {
        return ext;
    } else {
        return "";
    }
}

// If input name foo.bar, returns object {name:'foo', ext:'bar'}.
// If there is no . in input name, returns {name:name, ext:''}
export function separate_file_extension(
    name: string
): { name: string; ext: string } {
    const ext = filename_extension(name);
    if (ext !== "") {
        name = name.slice(0, name.length - ext.length - 1); // remove the ext and the .
    }
    return { name, ext };
}
