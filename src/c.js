/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Some convenient command-line shortcuts.  If you're working on the command line, do

    ~/cocalc/src$ node -i -e "$(< c.js)"

or just require('./c.js').

The functions below in some cases return things, and in some cases set global variables!  Read docs.

COPYRIGHT : (c) 2021 SageMath, Inc.
LICENSE   : AGPLv3
*/ process.env.COCALC_ROOT = require("path").resolve(__dirname);
console.log(process.env.COCALC_ROOT);
console.log(`Logging debug info to the file "${process.env.LOGS}/log"`);
process.env.PGUSER = process.env.PGUSER ?? "smc";
process.env.PGHOST =
  process.env.PGHOST ?? require("./packages/backend/dist/data").pghost;
global.misc = require("./packages/util/dist/misc");
global.done = misc.done;
global.done1 = misc.done1;
global.done2 = misc.done2;
global.password_hash = require("./packages/hub/dist/auth").password_hash;

let db = undefined;
function get_db(cb) {
  if (db != null) {
    if (typeof cb === "function") {
      cb(undefined, db);
    } // HACK -- might not really be initialized yet!
    return db;
  } else {
    db = require("./packages/database/dist").db({ debug: true });
    db.connect({ cb });
    return db;
  }
}
// get a connection to the db
global.db = get_db();

console.log("db -- database");

// make the global variable p be the project with given id and the global variable s be the compute server
global.proj = global.project = (id) => {
  return require("./packages/hub/dist/servers/project-control")(id);
};
console.log(
  "project('project_id') -- gives back object to control the porject"
);

global.delete_account = (email) =>
  get_db(function (err) {
    if (err) {
      done(`FAIL -- ${err}`);
      return;
    }
    db.mark_account_deleted({
      email_address: email,
      cb(err) {
        if (err) {
          done(`FAIL -- ${err}`);
        } else {
          done("SUCCESS!");
        }
      },
    });
  });

console.log("delete_account('email@foo.bar')  -- marks an account deleted");

global.active_students = function (cb) {
  if (cb == null) {
    cb = done();
  }
  get_db(function (err) {
    if (err) {
      cb(`FAIL -- ${err}`);
      return;
    }
    db.get_active_student_stats({
      cb(err, stats) {
        if (err) {
          console.log("FAILED");
          cb(err);
        } else {
          console.log(stats);
          cb();
        }
      },
    });
  });
};

console.log(
  "active_students() -- stats about student course projects during the last 30 days"
);

global.save = function (obj, filename) {
  if (filename.slice(filename.length - 5) !== ".json") {
    filename += ".json";
  }
  fs.writeFileSync(filename, JSON.stringify(obj));
};

global.load = function (filename) {
  if (filename.slice(filename.length - 5) !== ".json") {
    filename += ".json";
  }
  return JSON.parse(fs.readFileSync(filename));
};

global.stripe = (account_id) =>
  get_db((err, db) => db.stripe_update_customer({ account_id, cb: done() }));
console.log("stripe [account_id] -- update stripe info about user");
