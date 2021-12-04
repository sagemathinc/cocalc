import register from "../register";

register({
  path: "account/link",
  title: "Link Account",
  icon: "external-link",
  desc: "Link your account with single sign (SSO) on providers.",
  Component: () => {
    return <div>TODO: sso linking</div>;
  },
});
