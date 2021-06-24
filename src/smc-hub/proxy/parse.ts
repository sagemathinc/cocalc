type ProxyType = "port" | "raw" | "server";

export function parseReq(
  url: string, // with base_path removed
  remember_me?: string // only impacts the key that is returned
): {
  key: string; // used for caching
  type: ProxyType;
  project_id: string; // the uuid of the target project containing the service being proxied
  port_desc: string; // description of port; "" for raw, or a number or "jupyter"
  internal_url: string; // url at target of thing we are proxying to
} {
  // If base_path is / and we remove it, then there's no slash, but if
  // base_path is /foo and we remove it, then there is a slash.  Thus we
  // strip any leading slashes to keep things uniform.
  while (url.startsWith("/")) {
    url = url.slice(1);
  }
  const v = url.split("/");
  const project_id = v[0];
  if (v[1] != "port" && v[1] != "raw" && v[1] != "server") {
    throw Error("invalid type");
  }
  const type: ProxyType = v[1];
  let internal_url;
  let port_desc: string;
  if (type == "raw") {
    port_desc = "";
    internal_url = v.slice(2).join("/");
  } else if (type === "port") {
    port_desc = v[2];
    internal_url = v.slice(3).join("/");
  } else if (type === "server") {
    port_desc = v[2];
    internal_url = v.slice(3).join("/");
  } else {
    throw Error(`unknown type "${type}"`);
  }
  let key: string = (remember_me ?? "") + project_id + type + port_desc;
  return { key, type, project_id, port_desc, internal_url };
}
