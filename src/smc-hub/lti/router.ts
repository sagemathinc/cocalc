import * as express from "express";
import * as uuid from "uuid";
import * as querystring from "querystring";
import * as jwt from "jsonwebtoken";
import * as jwksClient from "jwks-rsa";
import * as path from "path";

import {
  compute_global_user_id,
  compute_global_context_id,
  unchecked_parse_launch_url,
  login_redirect_url,
  assignment_url
} from "./helpers";
import * as OP from "./db-operations";

import { UUID } from "./generic-types";
import { PostgreSQL } from "../postgres/types";
import {
  LoginInitiationFromPlatform,
  AuthResponseBody,
  PlatformResponse
} from "./types";

import * as auth_manager from "./auth-manager";

const SMC_ROOT: string = process.env.SMC_ROOT as any;
const STATIC_PATH = path.join(SMC_ROOT, "static");
const JWT_OPTIONS = { algorithm: "RS256" };

export function init_LTI_router(opts: {
  base_url: string;
  database: PostgreSQL;
}): express.Router {
  const router = express.Router();
  const launch_head = `https://cocalc.com/${opts.base_url}/api/lti/launch`
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.route("/").all(function(_, res) {
    res.sendFile(path.join(STATIC_PATH, "lti.html"), { maxAge: 0 });
  });

  // https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
  // 5.1.1
  router.route("/login").all((req, res) => {
    const state = uuid.v4();
    const nonce = uuid.v4();
    const token: LoginInitiationFromPlatform = req.body;
    const issuer = OP.get_iss_data(opts.database, token.iss);

    auth_manager.begin_auth_flow(state, { iss_data: issuer });
    res.redirect(
      login_redirect_url({
        base_url: issuer.auth_url,
        our_id: issuer.client_id,
        token,
        state,
        nonce
      })
    );
  });

  // Tool Launch URL
  router.route("/launch*").all((req: { body: AuthResponseBody }, res) => {
    console.log("\nLTI: Launch\n");
    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }
    const state = req.body.state;
    const id_token = req.body.id_token;
    const flow_details = auth_manager.get_auth_flow(state);

    jwt.verify(
      id_token,
      getKey(flow_details.iss_data.jwk_url),
      JWT_OPTIONS,
      function(err: string, token: PlatformResponse) {
        if (err) {
          res.send("Error parsing jwt:" + err);
        }
        if (token == undefined) {
          res.send("Token was undefined in /launch");
        }
        // TODO: Add loading step

        const global_user_id = compute_global_user_id(token);
        const global_context_id = compute_global_context_id(token);
        const params = unchecked_parse_launch_url(token, launch_head);
        console.log("LAUNCH GOT PARAMS:", params);
        if (params.item_type == "assignment") {
          const assignment_id = params.id as UUID;

          let user = OP.get_user(opts.database, global_user_id);
          if (user == undefined) {
            user = OP.create_user(opts.database, global_user_id);
          }

          let context = OP.get_context(opts.database, global_context_id);
          if (context == undefined) {
            context = OP.create_context(
              opts.database,
              global_context_id,
              token["https://purl.imsglobal.org/spec/lti/claim/context"]
            );
          }

          const has_assignment = OP.get_copy_status({
            _db: opts.database,
            assignment: assignment_id,
            student: user.id,
            context: context.id
          });

          if (!has_assignment) {
            OP.clone_assignment(assignment_id);
          }

          res.send(
            `${{
              user,
              context,
              has_assignment
            }} ------- `
          );
        } else {
          res.send("Unknown Item type...");
        }
      }
    );
  });

  router.route("/deep-link-select").all((req, res) => {
    console.log(`\n
      Deep link Select:
      ${JSON.stringify(req.body)}
    `);
    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }

    const token = jwt.decode(req.body.id_token, JWT_OPTIONS);
    if (token == undefined) {
      res.send("Token was undefined in /deep-link-select");
    }
    try {
      const user_id = OP.get_user(opts.database, token);
      const context_id = OP.get_context(
        opts.database,
        compute_global_context_id(token)
      );
      const query_string = querystring.stringify({
        id_token: req.body.id_token,
        nonce: req.body.state,
        return_path: "lti/return-deep-link/",
        user_id,
        context_id
      });
      res.redirect("../lti?" + query_string);
    } catch (err) {
      console.log(err);
    }
  });

  router.post("/return-deep-link", (req, res) => {
    console.log("\nreturn-deep-link\n");
    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }
    const details = auth_manager.get_auth_flow(req.body.state);

    jwt.verify(
      req.body.id_token,
      getKey(details.iss_data.jwk_url),
      JWT_OPTIONS,
      function(err: string, token: PlatformResponse) {
        if (err) {
          res.send("Error parsing jwt:" + err);
        }
        const {
          assignment_name,
          project_id,
          selected_paths,
          excluded_paths
        } = req.body;

        // *******************************
        // COPIED from Above
        // *******************************
        const global_user_id = compute_global_user_id(token);
        const global_context_id = compute_global_context_id(token);

        let user = OP.get_user(opts.database, global_user_id);
        if (user == undefined) {
          user = OP.create_user(opts.database, global_user_id);
        }

        let context = OP.get_context(opts.database, global_context_id);
        if (context == undefined) {
          context = OP.create_context(
            opts.database,
            global_context_id,
            token["https://purl.imsglobal.org/spec/lti/claim/context"]
          );
        }
        // End COPY *******************************

        const assignment = OP.create_assignment({
          _db: opts.database,
          context: context.id,
          source_project: project_id,
          author: user.id,
          selected_paths,
          excluded_paths,
          name: assignment_name
        });
        // `/launch` receives this url as target
        let url = assignment_url(
          launch_head,
          assignment.id
        );

        // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
        const nonce = uuid.v4();
        const iss_data = OP.get_iss_data(opts.database, token.iss);
        const iss = iss_data.client_id;

        // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
        const jwt_data = {
          iss: iss,
          aud: [token.iss],
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60 * 60,
          nonce: nonce,
          header: {
            typ: "JWT",
            alg: "RS256"
          },
          "https://purl.imsglobal.org/spec/lti/claim/message_type":
            "LtiDeepLinkingResponse",
          "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
          "https://purl.imsglobal.org/spec/lti/claim/deployment_id":
            token["https://purl.imsglobal.org/spec/lti/claim/deployment_id"],
          "https://purl.imsglobal.org/spec/lti-dl/claim/data":
            token[
              "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
            ],
          "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [
            {
              type: "ltiResourceLink", // TODO: What types are available?
              title: `${assignment_name}`,
              url: `${url}`
            }
          ] // Array of returned items (possibly empty)
        };

        const deep_link_response_token = jwt.sign(
          jwt_data,
          auth_manager.get_private_key(),
          JWT_OPTIONS
        );

        const formatted_token = { JWT: deep_link_response_token };
        const query_string = querystring.stringify(formatted_token);
        const redirect_url =
          token[
            "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
          ].deep_link_return_url;

        res.redirect(redirect_url + "&" + query_string);
      }
    );
  });

  return router;
}

function getKey(uri) {
  const jwkClient = jwksClient({
    jwksUri: uri
  });

  return (header, callback) => {
    jwkClient.getSigningKey(header.kid, function(_, key) {
      var signingKey = (key as any).publicKey || (key as any).rsaPublicKey;
      callback(null, signingKey);
    });
  };
}
