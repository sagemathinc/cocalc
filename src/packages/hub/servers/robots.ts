import { get_server_settings } from "@cocalc/database/postgres/settings/server-settings";

export default function getHandler() {
  return async (_req, res) => {
    const settings = await get_server_settings(); // don't worry -- this is cached.
    res.header("Content-Type", "text/plain");
    res.header("Cache-Control", "public, max-age=3600, must-revalidate");
    if (!settings.landing_pages) {
      // Default: -- disable everything except /share.
      res.write(`User-agent: *
               Allow: /share
               Disallow: /
               `);
    } else {
      // If landing pages are enabled, which should only be cocalc.com (and maybe some test sites temporarily),
      // then we only disallow some obvious bad routes.  This allows the share server, landing pages, etc.
      // If we need to switch to a whitelist, see app/next.ts for what to allow...
      res.write(`User-agent: *
               Disallow: /static/
               Disallow: /projects/
               Disallow: /*/raw/
               Disallow: /*/port/
               Disallow: /*/server/
               Disallow: /haproxy
               `);
    }
    res.end();
  };
}
