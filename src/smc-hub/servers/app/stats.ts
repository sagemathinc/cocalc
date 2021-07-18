import { Router } from "express";
import { callback2 } from "smc-util/async-utils";
import { database_is_working } from "smc-hub/hub_register";
import { database } from "../database";

export default function init(router: Router) {
  // Return global status information about CoCalc
  router.get("/stats", async (_req, res) => {
    if (!database_is_working()) {
      res.json({ error: "not connected to database" });
      return;
    }
    res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    try {
      const stats = await callback2(database.get_stats, {
        update: false, // never update in hub b/c too slow. instead, run $ hub --update_stats via a cronjob every minute
        ttl: 30,
      });
      res.header("Content-Type", "application/json");
      res.send(JSON.stringify(stats, null, 1));
    } catch (err) {
      res.status(500).send(`internal error: ${err}`);
    }
  });
}
