import * as express from "express";
import * as path from "path";

const SMC_ROOT: string = process.env.SMC_ROOT as any;
const STATIC_PATH = path.join(SMC_ROOT, "static");

export function init(): express.Router {
  const router = express.Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.get("/", function(_, res) {
    res.sendFile(path.join(STATIC_PATH, "retention-app.html"), { maxAge: 0 });
  });

  return router;
}
