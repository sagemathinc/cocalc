type ProxyType = "port" | "raw" | "server" | "files" | "proxy";

const TYPE_SEGMENTS = new Set(["port", "raw", "server", "files", "proxy"]);

export function parseReq(
  url: string, // with base_path removed (url does start with /)
  remember_me?: string, // only impacts the key that is returned
  api_key?: string, // only impacts key
): {
  key: string; // used for caching
  type: ProxyType;
  project_id: string; // the uuid of the target project containing the service being proxied
  port_desc: string; // description of port; "" for raw, or a number or "jupyter"
  internal_url: string | undefined; // url at target of thing we are proxying to; this is ONLY set in case type == 'server'.
} {
  if (url[0] != "/") {
    throw Error(`invalid url -- it should start with / but is "${url}"`);
  }
  const v = url.split("/").slice(1);
  const project_id = v[0];
  if (!TYPE_SEGMENTS.has(v[1])) {
    throw Error(
      `invalid type -- "${v[1]}" must be one of '${Array.from(TYPE_SEGMENTS).join(", ")}' in url="${url}"`,
    );
  }
  const type: ProxyType = v[1] as ProxyType;
  let internal_url: string | undefined = undefined;
  let port_desc: string;
  if (type == "raw" || type == "files") {
    port_desc = "";
  } else if (type === "port") {
    port_desc = v[2];
  } else if (type === "server" || type == "proxy") {
    port_desc = v[2];
    internal_url = v.slice(3).join("/");
  } else {
    throw Error(`unknown type "${type}"`);
  }
  const key = `${remember_me}-${api_key}-${project_id}-${type}-${port_desc}-${internal_url}`;
  return { key, type, project_id, port_desc, internal_url };
}
