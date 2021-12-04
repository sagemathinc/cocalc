import register from "../register";

register({
  path: "account/api",
  title: "API Keys",
  icon: "key",
  desc: "Add or remove an API keys for accessing all of your projects via the API.",
  Component: () => {
    return <div>TODO: api</div>;
  },
});
