import * as express from "express";

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

export function init_LTI_router(): express.Router {
  const router = express.Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  router.get("/", function(_, res) {
    res.send("lti root");
  });

  // https://www.imsglobal.org/spec/security/v1p0/#openid_connect_launch_flow
  // 5.1.1
  router.route("/login").all((_, res) => {
    res.send("Login via lti");

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
    // begin_auth_flow(token.state, auth_params)
    const query_string = querystring.stringify(auth_params);
    res.redirect(iss_data.auth_url + "?" + query_string);

  });

  // Tool Launch URL
  router.post("/launch", (_, res) => {
    res.send("Got a POST request at launch-lti");
  });

  router.post("/deep-link-launches", (_, res) => {
    res.send("Got a post request at deep-link-launches");
  });

  return router;
}
