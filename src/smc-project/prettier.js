/*
Use Prettier to reformat the syncstring.

This very nicely use the in-memory node module to prettyify code, by simply modifying the syncstring
on the backend.  This avoids having to send the whole file back and forth, worrying about multiple users
and their cursors, file state etc.  -- it just merges in the prettification at a point in time.
Also, by doing this on the backend we don't add 5MB (!) to the webpack frontend bundle, to install
something that is not supported on the frontend anyway.
*/

const prettier = require("prettier");
const body_parser = require("body-parser");
const express = require("express");

exports.prettier_router = function(client, log) {
    router = express.Router();
    router.use(body_parser.json());
    router.use(body_parser.urlencoded({ extended: true }));

    router.post("/.smc/prettier", function(req, res) {
        let { path } = req.body;

        if (path == null) {
            res.send({ error: "missing path" });
            return;
        }

        let { options } = req.body;

        if (options) {
            options = JSON.parse(options);
        }

        // What we do is edit the syncstring with the given path to be "prettier" if possible...
        let syncstring = client.sync_string({ path, reference_only: true });
        if (syncstring == null) {
            /* file not opened yet -- nothing to do. */
            res.json({ status: "ok", phase: "loading" });
            return;
        }

        let pretty;
        try {
            pretty = prettier.format(syncstring.get_doc().to_str(), options);
        } catch (err) {
            log.debug(err);
            res.json({ status: "error", phase: "format", error: err });
            return;
        }
        syncstring.from_str(pretty);
        syncstring._save(() => res.json({ status: "ok" }));

        syncstring.on("error", err =>
            res.json({ status: "error", phase: "syncstring", error: err })
        );
    });

    return router;
};
