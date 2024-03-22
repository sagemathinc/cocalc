// Make various components use consistent file for configuring the proxy.
// WARNING: these two paths are also hard coded at
//
//    https://github.com/sagemathinc/cocalc-compute-docker/blob/main/src/cocalc/supervisor/conf.d/proxy.conf
//
// so you can't just change them here and expect things to not break!

export const PROXY_AUTH_TOKEN_FILE = "/cocalc/conf/auth_token";
export const PROXY_CONFIG = "/cocalc/conf/proxy.json";
