// TODO #V0 for must dos
// TODO #V1 for second round

import * as jwt from "jsonwebtoken";
//import * as fs from "fs";
import * as express from "express";
import * as uuid from "uuid";
import { inspect } from "util";
import * as querystring from "querystring";
// import * as jwksClient from "jwks-rsa";

// import { Database, Logger } from "./types";

// const privateKEY = fs.readFileSync("./private.key", "utf8");
const privateKEY = "a;ldksfjal;kj"

/*
const jwkClient = jwksClient({
  jwksUri: WELL_KNOWN_JWKS_URL
});

function getKey(header, callback) {
  jwkClient.getSigningKey(header.kid, function(err, key) {
    var signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}
*/


// TODO #V0 Remove when you write a way to save it to the database
const known_iss = {
  "https://moodletest.cocalc.com": {
    client_id: "Ho3mDRdDHybcG5U",
    token_url: "https://moodletest.cocalc.com/mod/lti/token.php",
    auth_url: "https://moodletest.cocalc.com/mod/lti/auth.php",
    jwk_url: "https://moodletest.cocalc.com/mod/lti/certs.php"
  },
  "https://canvas.instructure.com": {
    client_id: "10000000000008",
    token_url: "http://34.83.75.255/api/lti/login/oauth2/auth",
    auth_url: "http://34.83.75.255/api/lti/authorize",
    jwk_url: "http://34.83.75.255/api/lti/securit/jwks"
  }
}

function get_iss_data(iss: string): IssuerData {
  return known_iss[iss];
}

const current_auth_flows = {};

function begin_auth_flow(state: string, data) {
  current_auth_flows[state] = data;
}

export function get_auth_step(state: string) {
  return current_auth_flows[state];
}

export function init_LTI_router(): express.Router {
  const router = express.Router();
  //router.use(express.json());
  //router.use(express.urlencoded({ extended: true }));

  // https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
  // 5.1.1
  router.route("/login").all(function(req, res, _) {
    res.send(`login-lti post get ${inspect(req.body)}`);

    const token = req.body;

    const iss_data = get_iss_data(token.iss);
    const nonce = uuid.v4();
    const state = uuid.v4();

    // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
    const auth_params = {
      scope: "openid", // OIDC Scope.
      response_type: "id_token", // OIDC response is always an id token.
      client_id: iss_data.client_id,
      redirect_uri: token.target_link_uri,
      login_hint: token.login_hint,
      state: state,
      response_mode: "form_post", // OIDC response is always a form post.
      nonce: nonce,
      prompt: "none", // Don't prompt user on redirect.
      lti_message_hint: token.lti_message_hint,
      id_token_hint: token.lti_message_hint
    };
    begin_auth_flow(token.state, auth_params)
    const query_string = querystring.stringify(auth_params);
    res.redirect(iss_data.auth_url + "?" + query_string);
});

  // Tool Launch URL
  router.post("/launch", (_, res) => {
    res.send("Got a POST request at launch-lti");
  });

  // Deep Linking Selection URL
  router.post("/deep-link-launches", (req, res) => {
    res.send("Hit deep-link-launches");

    // TODO #V0 Worry about matching state
    // if (req.body.state)


    if (req.body.error) {
      res.send(`Recieved error ${req.body.error}`);
    }

    const options = { algorithms: ["RS256"] };

    // TODO #V0: Use verify for security
    jwt.decode(req.body.id_token, options, function(err, token) {
      if (err) {
        res.send("Error parsing jwt:" + err);
      }
      const nonce = uuid.v4();

      var redirect_url;
      if (
        !token[
          "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
        ]
      ) {
        res.redirect(
          token["https://purl.imsglobal.org/spec/lti/claim/target_link_uri"]
        );
        return;
      }
      // Deep link selection
      redirect_url =
        token[
          "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
        ].deep_link_return_url;

      const iss_data = get_iss_data(token.iss)

      // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
      const jwt_data = {
        iss: iss_data.client_id,
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
            title: "Cocalc redirect2 Sneaky",
            url:
              "https://cocalc.com/projects/369491f1-9b8a-431c-8cd0-150dd15f7b11/files/work/2019-06-19.sage-chat?session=default&fullscreen=kiosk"
          }
        ] // Array of returned items (possibly empty)
      };

      const deep_link_response_token = jwt.sign(jwt_data, privateKEY, {
        algorithm: "RS256"
      });

      const formatted_token = { JWT: deep_link_response_token };
      const query_string = querystring.stringify(formatted_token);
      res.redirect(redirect_url + "&" + query_string);
    });
  });
  return router;
}
