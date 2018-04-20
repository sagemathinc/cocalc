import { path_split, separate_file_extension } from "./misc";

export function parse_path(
    path: string
): { directory: string; base: string; filename: string } {
    let x = path_split(path);
    let dir = x.head;
    let y = separate_file_extension(x.tail);
    return { directory: x.head, base: y.name, filename: x.tail };
}

export function pdf_path(path: string): string {
    return path.slice(0, path.length - 3) + "pdf";
}

/* Declare that window has an extra app_base_url string param. */

declare global {
    interface Window { app_base_url: string; }
}

export function raw_url(project_id:string, path:string) : string {
    return `${window.app_base_url}/${project_id}/raw/${path}`;
}
