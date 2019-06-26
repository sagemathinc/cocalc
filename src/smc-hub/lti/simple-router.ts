import * as express from "express";

export function SimpleRouter(): express.Router {
  const router = express.Router();
  router.get("/api/lti*", (req, res) => {
    res.send("You've hit the lti");
  });

  return router;
}
