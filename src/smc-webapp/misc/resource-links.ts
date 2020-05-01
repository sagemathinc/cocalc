// resource links, pointing to some assets we're hosting (formerly on a CDN)
// see webapp-lib/resources/ for *how* they're hosted

// this encodes <link href="..." crossOrigin="..." etc. />
// in react, you can use it as <link  {...link_info} />
interface ResourceLink {
  href: string;
  integrity?: string;
  rel?: "stylesheet";
  crossOrigin?: "anonymous";
}

const RES = "res";

// prefix must be a full URL, e.g. https://cocalc.com/ or https://cocalc.foo.bar/subdir/
export function resource_links(prefix: string): ResourceLink[] {
  if (prefix.slice(-1) != "/") prefix = prefix + "/";
  return [
    { href: `${prefix}${RES}/bootstrap/bootstrap.min.css`, rel: "stylesheet" },
    {
      href: `${prefix}${RES}/codemirror/lib/codemirror.css`,
      rel: "stylesheet",
    },
    { href: `${prefix}${RES}/katex/katex.min.css`, rel: "stylesheet" },
  ];
}

export function resource_links_string(prefix: string): string {
  return resource_links(prefix).map(({ href, rel, integrity, crossOrigin }) => {
    const data: string[] = [];
    data.push(`href="${href}"`);
    if (rel) data.push(`rel="${rel}"`);
    if (integrity) data.push(`integrity="${integrity}"`);
    if (crossOrigin) data.push(`crossOrigin="${crossOrigin}"`);
    return `<link ${data.join(" ")} />`;
  }).join(' ');
}
