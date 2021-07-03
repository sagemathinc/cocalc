const { parse } = require("url");
const next = require("next");

async function init({ basePath, dev }) {
  if (basePath == "/") basePath = "";
  const app = next({ dev, dir: __dirname, basePath, renderOpts: { basePath } });
  const handle = app.getRequestHandler();
  await app.prepare();
  return (req, res) => {
    handle(req, res, parse(req.url, true));
  };
}

module.exports = init;
