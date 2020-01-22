export function launch_binder(
  launch: string,
  filepath: string | undefined,
  urlpath: string | undefined
): void {
  // this decodes e.g. "?launch=binder/v2/gh/sagemathinc/cocalc/branch&filepath=start.ipynb"

  // config are the launch tokens, starting with v2
  const config: string[] = launch.split("/").slice(1);
  if (config[0] !== "v2") {
    // TODO show some error
    console.warn('Not a "v2" binder URL -- aborting');
    return;
  }

  switch (config[1]) {
    case "gh": // github, most common
      console.log(`binder github ${config.slice(2)}`);
      return;

    case "gist": // github gist, not sure how they look
      console.log(`binder gist ${config.slice(2)}`);
      return;

    case "gl": // gitlab
      console.log(`binder gitlab ${config.slice(2)}`);
      return;

    case "git": // pure git url, which types are supported?
      console.log(`binder git ${config.slice(2)}`);
      return;

    case "zenodo": // e.g. zenodo/10.5281/zenodo.3242074
      console.log(`binder zenodo ${config.slice(2)}`);
      return;

    default:
      console.warn(`Binder URL unknwn type' ${config[1]}' -- aborting`);
  }

  console.log(`filepath=${filepath}, urlpath=${urlpath}`);

  console.warn("STOP -- this is not yet implemented");
}
