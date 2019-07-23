export function handle_share_css(_req: any, res: any): void {
  res.type("text/css");
  res.send(`\
.cocalc-jupyter-anchor-link {
  visibility : hidden
};\
`);
}
