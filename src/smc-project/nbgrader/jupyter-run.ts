export async function jupyter_run_notebook(
  client,
  logger,
  opts: any
): Promise<string> {
  logger.debug("jupyter_run_notebook", opts);
  client = client;
  return opts.ipynb;
}
