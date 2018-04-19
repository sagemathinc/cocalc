/*
This is a rewrite of what we're using from smc-util/misc...
*/

export function path_split(path: string): { head: string; tail: string } {
    const v = path.split("/");
    return { head: v.slice(0, -1).join("/"), tail: v[v.length - 1] };
}

const filename_extension_re = /(?:\.([^.]+))?$/;
export function filename_extension(filename: string): string {
    const match = filename_extension_re.exec(filename);
    if (!match) {
        return "";
    }
    const ext = match[1];
    return ext ? ext : "";
}

// If input name foo.bar, returns object {name:'foo', ext:'bar'}.
// If there is no . in input name, returns {name:name, ext:''}
export function separate_file_extension(
    name: string
): { name: string; ext: string } {
    const ext : string = filename_extension(name);
    if (ext !== "") {
        name = name.slice(0, name.length - ext.length - 1); // remove the ext and the .
    }
    return { name, ext };
}

// Like Python splitlines.
export function splitlines(s : string) : string[] {
    const r = s.match(/[^\r\n]+/g);
    return r ? r : [];
}

