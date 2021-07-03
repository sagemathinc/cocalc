/*
This is just used to help with figuring out how to integrate
next.js into cocalc.
*/
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const basePath = "/10f0e544-313c-4efe-8718-2142ac97ad11/port/3000";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, basePath, renderOpts: { basePath } });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true);
    const { pathname, query } = parsedUrl;

    if (pathname === "/a") {
      app.render(req, res, "/a", query);
    } else if (pathname === "/b") {
      app.render(req, res, "/b", query);
    } else {
      handle(req, res, parsedUrl);
    }
  }).listen(3000, (err) => {
    if (err) throw err;
    console.log("> Ready on http://localhost:3000");
  });
});
