import register from "../register";

register({
  path: "account/avatar",
  title: "Avatar",
  icon: "user",
  desc: "Configure your avatar's cursor color and profile image.",
  Component: () => {
    return <div>TODO: avatar config</div>;
  },
});
