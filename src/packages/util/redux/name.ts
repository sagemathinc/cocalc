// Canonical name to use for Redux store associated to a given project/path.
// TODO: this code is also in many editors -- make them all just use this.
export function redux_name(project_id: string, path: string): string {
  return `editor-${project_id}-${path}`;
}

export function project_redux_name(project_id: string, name?: string): string {
  let s = `project-${project_id}`;
  if (name != null) {
    s += `-${name}`;
  }
  return s;
}
