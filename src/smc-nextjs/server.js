const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const basePath = require("./lib/basePath")();

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    // Be sure to pass `true` as the second argument to `url.parse`.
    // This tells it to parse the query portion of the URL.
    const parsedUrl = parse(req.url, true);
    const { pathname, query } = parsedUrl;
    const path = basePath ? pathname.slice(basePath.length) : pathname;

    if (path === "" || path === "/") {
      // Workaround a weird bug where if next.js has an index.jsx
      // then the back button breaks everywhere.  Hopefully this
      // can somehow go away, but for now this works.
      app.render(req, res, "/home", query);
    } else {
      handle(req, res, parsedUrl);
    }
  }).listen(3000, () => {
    if (process.env.COCALC_PROJECT_ID && basePath) {
      // Running from within a cocalc project.
      console.log(`\n> Ready on https://cocalc.com${basePath}\n`);
    } else {
      console.log(
        `\n> Ready on http://localhost:3000${basePath ? basePath : ""}\n`
      );
    }
  });
});
