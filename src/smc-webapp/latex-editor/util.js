import { path_split, separate_file_extension } from "smc-util/misc";

export function parse_path(path) {
    let x = path_split(path);
    let dir = x.head;
    let y = separate_file_extension(x.tail);
    return { directory: x.head, base: y.name, filename: x.tail };
}

export function pdf_path(path) {
    return path.slice(0, path.length - 3) + "pdf";
}
