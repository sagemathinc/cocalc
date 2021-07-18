/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Some convenient command-line shortcuts.  If you're working on the command line, do

    require('./c')

The functions below in some cases return things, and in some cases set global variables!  Read docs.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : AGPLv3
*/
process.env.NODE_PATH = __dirname;

global.misc = require("smc-util/misc");
global.done = misc.done;
global.done1 = misc.done1;
global.done2 = misc.done2;
global.password_hash = require("smc-hub/auth").password_hash;

let db = undefined;
function get_db(cb) {
  if (db != null) {
    if (typeof cb === "function") {
      cb(undefined, db);
    } // HACK -- might not really be initialized yet!
    return db;
  } else {
    db = require("smc-hub/postgres").db({ debug: true });
    db.connect({ cb });
    return db;
  }
}
// get a connection to the db
global.db = get_db();

console.log("db -- database");

global.gcloud = function () {
  global.g = require("smc-hub/smc_gcloud.coffee").gcloud({ db: get_db() });
  console.log("setting global variable g to a gcloud interface");
};

console.log("gcloud() -- sets global variable g to gcloud instance");

global.vms = () =>
  get_db(function (err) {
    global.g = require("smc-hub/smc_gcloud.coffee").gcloud({ db });
    global.vms = global.g.vm_manager({ manage: false });
  });
console.log(
  "setting global variable g to a gcloud interface and vms to vm manager"
);

console.log(
  "vms() -- sets vms to gcloud VM manager (and g to gcloud interface)"
);

// make the global variable s be the compute server
global.compute_server = () =>
  require("smc-hub/compute-client").compute_server({
    cb(e, s) {
      global.s = s;
    },
  });
console.log("compute_server() -- sets global variable s to compute server");

// make the global variable p be the project with given id and the global variable s be the compute server
global.proj = global.project = (id) =>
  require("smc-hub/compute-client").compute_server({
    cb(e, s) {
      global.s = s;
      s.project({
        project_id: id,
        cb(e, p) {
          global.p = p;
        },
      });
    },
  });

console.log("project 'project_id' -- set p = project, s = compute server");

global.activity = function (opts = {}) {
  opts.cb = function (err, a) {
    if (err) {
      console.log("failed to initialize activity");
    } else {
      console.log("initialized activity");
      global.activity = a;
    }
  };
  require("smc-hub/storage").activity(opts);
};

console.log("activity()  -- makes activity the activity monitor object");

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

console.log("delete_account 'email@foo.bar'  -- marks an account deleted");

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
