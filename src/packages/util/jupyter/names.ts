import { meta_file, original_path } from "@cocalc/util/misc";

export const JUPYTER_POSTFIX = "jupyter2";
export const JUPYTER_SYNCDB_EXTENSIONS = `sage-${JUPYTER_POSTFIX}`;

export function isJupyterPath(path: string) {
  return path.endsWith(JUPYTER_SYNCDB_EXTENSIONS);
}

// a.ipynb or .a.ipynb.sage-jupyter2  --> .a.ipynb.sage-jupyter2
export function syncdbPath(path: string) {
  if (path.endsWith(JUPYTER_POSTFIX)) {
    return path;
  }
  if (!path.endsWith(".ipynb")) {
    throw Error(`must end with .ipynb but it is "${ipynbPath}"`);
  }
  return meta_file(path, JUPYTER_POSTFIX);
}

// a.ipynb or .a.ipynb.sage-jupyter2 --> a.ipynb
export function ipynbPath(path: string) {
  if (path.endsWith(".ipynb")) {
    return path;
  }
  return original_path(path);
}
