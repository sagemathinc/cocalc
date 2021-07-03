const { parse } = require("url");
const next = require("next");

async function init() {
  const app = next({ dev: false, dir: __dirname });
  const handle = app.getRequestHandler();
  await app.prepare();
  return (req, res) => {
    handle(req, res, parse(req.url, true));
  };
}

module.exports = init;
