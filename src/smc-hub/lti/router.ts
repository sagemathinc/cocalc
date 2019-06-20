import * as jwt from "jsonwebtoken";
import * as fs from "fs";
import * as express from "express";
import * as uuid from "uuid";
import { inspect } from "util";
import * as querystring from "querystring";
import * as jwksClient from "jwks-rsa";

// use 'utf8' to get string instead of byte array
const privateKEY = fs.readFileSync("./private.key", "utf8");

// Copied from the provider tool config details
// TODO: Store instances in Database
const base_url = "https://moodletest.cocalc.com/";
const CLIENT_ID = "Ho3mDRdDHybcG5U";
const WELL_KNOWN_JWKS_URL = base_url + "mod/lti/certs.php";
const OAUTH2_ACCESS_TOKEN_URL = base_url + "mod/lti/token.php";
const OIDC_AUTH_URL = base_url + "mod/lti/auth.php";

const jwkClient = jwksClient({
  jwksUri: WELL_KNOWN_JWKS_URL
});

function getKey(header, callback) {
  jwkClient.getSigningKey(header.kid, function(err, key) {
    var signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

var last_state = "";

export function create_lti_router((opts: {
  database: Database;
  path: string;
  logger?: Logger;
  base_url?: string;
}) {
  let dbg;
  const base_url: string = opts.base_url != null ? opts.base_url : "";

  if ((global as any).window != null) {
    (global as any).window["app_base_url"] = base_url;
  }

  if (opts.logger != null) {
    const logger = opts.logger;
    dbg = (...args) => logger.debug("share_router: ", ...args);
  } else {
    dbg = (..._args) => {};
  }

  dbg("base_url = ", base_url);
  dbg("path = ", opts.path);

  router = express.Router();

  router.use(express.json()); // for parsing application/json
  router.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

  // GIVE TO PLATFORM
  // Tool Login URL
  // /Login – Receives the third party login request from a platform and sends the authentication request to the platform
  router.get("/login-lti", (req, res) => {
    console.log("login-lti post get");
    res.send(`Got a GET request at login-lti ${inspect(req.query)}`);
  });

  // https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
  // 5.1.1
  router.post("/login-lti", (req, res) => {
    const token = req.body;

    // TODO: Check issuer against known issuers add by the user
    // Error if unknown

    const nonce = uuid.v4();
    const state = uuid.v4();
    last_state = state;

    console.log("==============\nGiven token:", inspect(token));

    // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
    const auth_params = {
      scope: "openid", // OIDC Scope.
      response_type: "id_token", // OIDC response is always an id token.
      client_id: CLIENT_ID,
      redirect_uri:
        "https://floating-cove-52371.herokurouter.com/deep_link_launches",
      login_hint: token.login_hint,
      state: state,
      response_mode: "form_post", // OIDC response is always a form post.
      nonce: nonce,
      prompt: "none", // Don't prompt user on redirect.

      lti_message_hint: token.lti_message_hint,
      id_token_hint: token.lti_message_hint
    };

    const query_string = querystring.stringify(auth_params);

    res.redirect(OIDC_AUTH_URL + "?" + query_string);
  });

  // Tool Launch URL
  router.post("/launch-lti", (req, res) => {
    console.log(req);
    res.send("Got a POST request at launch-lti");
  });

  // Deep Linking Launch URL
  router.post("/launch-lti", (req, res) => {
    console.log(
      `Got a POST request at deep_link_launches with body: ${inspect(req.body)}`
    );
    if (req.body.state !== last_state) {
      console.warn(
        "ERROR LAST STATE != received state. Possible attack in progress"
      );
      console.log(" -- Last state was " + last_state);
      console.log(" -- But received " + req.body.state);
    } else if (req.body.error) {
      console.error(`Recieved error ${req.body.error}`);
    } else {
      console.log("Matching state " + last_state);
    }
    const options = { algorithms: ["RS256"] };

    // Todo: Use await for this callback...
    jwt.verify(req.body.id_token, getKey, options, function(err, token) {
      if (err) {
        res.send("Error parsing jwt:" + err);
        return;
      }
      const nonce = uuid.v4();

      console.log("==============\nGot token:", inspect(token));
      var redirect_url;
      if (
        !token[
          "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
        ]
      ) {
        res.redirect(
          decoded["https://purl.imsglobal.org/spec/lti/claim/target_link_uri"]
        );
        return;
      }
      // Deep link selection
      redirect_url =
        token[
          "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"
        ].deep_link_return_url;

      // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
      const jwt_data = {
        iss: CLIENT_ID,
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
      console.log("==============\n Sending JWT:", deep_link_response_token);

      const formatted_token = { JWT: deep_link_response_token };
      const query_string = querystring.stringify(formatted_token);
      res.redirect(redirect_url + "&" + query_string);
    });
  });
}
