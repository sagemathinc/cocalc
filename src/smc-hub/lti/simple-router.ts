import * as express from "express";

export function init_LTI_router(): express.Router {
  const router = express.Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.get("/", function(_, res) {
    res.send("lti root");
  });

  // https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
  // 5.1.1
  router.route("/login").all((_, res) => {
    res.send("Login via lti");
  });

  // Tool Launch URL
  router.post("/launch", (_, res) => {
    res.send("Got a POST request at launch-lti");
  });

  router.post("/deep-link-launches", (_, res) => {
    res.send("Got a post request at deep-link-launches");
  });

  return router;
}
