#!/usr/bin/env node

/*
Periodically update the stats in the database.
*/

const postgres = require("@cocalc/database");

const ttl = parseInt(process.env.STATS_TTL_S ?? "300");
const db = postgres.db({ ensure_exists: false });

function update() {
  console.log("updating stats...");
  db.get_stats({
    update: true,
    ttl,
    cb(err, stats) {
      if (err) {
        throw Error(`failed to update stats -- ${err}`);
      } else {
        console.log("updated stats", stats);
      }
      setTimeout(update, ttl * 1000);
    },
  });
}

update();
