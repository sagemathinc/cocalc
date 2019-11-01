/*
Manage codemirror documents.  For each path, there's one of these.
*/

import * as CodeMirror from "codemirror";

const cache: any = {};

function key(project_id: string, path: string): string {
  return `${project_id}-${path}`;
}

export function get_linked_doc(
  project_id: string,
  path: string
): CodeMirror.Doc {
  const doc = cache[key(project_id, path)];
  if (doc != undefined) {
    return doc.linkedDoc();
  } else {
    throw Error(`no such doc -- ${project_id}/${path}`);
  }
}

export function has_doc(project_id: string, path: string): boolean {
  return cache[key(project_id, path)] !== undefined;
}

export function set_doc(
  project_id: string,
  path: string,
  cm: CodeMirror.Editor
): void {
  cache[key(project_id, path)] = cm.getDoc();
}

export function get_doc(project_id: string, path: string): CodeMirror.Doc {
  const doc = cache[key(project_id, path)];
  if (doc != undefined) {
    return doc;
  } else {
    throw Error(`no such doc -- ${project_id}/${path}`);
  }
}

// Forget about given doc
export function close(project_id: string, path: string): void {
  delete cache[key(project_id, path)];
}
