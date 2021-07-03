const { parse } = require("url");
const next = require("next");
const dev = process.env.NODE_ENV !== "production";

async function init() {
  const app = next({ dev, dir: __dirname });
  const handle = app.getRequestHandler();
  await app.prepare();
  return (req, res) => {
    handle(req, res, parse(req.url, true));
  };
}

module.exports = init;
