import { register } from "./tables";

register({
  name: "licenses",
  title: "Licenses",
  icon: "key",
  query: {
    site_licenses: [
      {
        id: null,
        title: null,
        description: null,
        info: null,
        expires: null,
        activates: null,
        created: null,
        last_used: null,
        managers: null,
        restricted: null,
        upgrades: null,
        quota: null,
        run_limit: null,
        apply_limit: null,
      },
    ],
  },
});
