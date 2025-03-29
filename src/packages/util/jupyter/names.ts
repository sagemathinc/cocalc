import { meta_file } from "@cocalc/util/misc";

export const JUPYTER_POSTFIX = "jupyter2";
export const JUPYTER_SYNCDB_EXTENSIONS = `sage-${JUPYTER_POSTFIX}`;

// a.ipynb --> ".a.ipynb.sage-jupyter2"
export function syncdbPath(ipynbPath: string) {
  if (!ipynbPath.endsWith(".ipynb")) {
    throw Error(`ipynbPath must end with .ipynb but it is "${ipynbPath}"`);
  }
  return meta_file(ipynbPath, JUPYTER_POSTFIX);
}
