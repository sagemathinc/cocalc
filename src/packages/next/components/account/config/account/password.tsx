import register from "../register";

register({
  path: "account/password",
  title: "Password",
  icon: "user-secret",
  desc: "Change or reset your password.",
  Component: () => {
    return <div>TODO: password</div>;
  },
});
