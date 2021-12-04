import register from "../register";

register({
  path: "account/ssh",
  title: "SSH Keys",
  icon: "key",
  desc: "Add or remove ssh keys for accessing all of your projects via ssh.",
  Component: () => {
    return <div>TODO: ssh</div>;
  },
});
