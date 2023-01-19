import { register } from "./tables";

register({
  name: "patches",
  title: "Patches",
  icon: "exchange",
  query: {
    crm_patches: [
      {
        string_id: null,
        time: null,
        patch: null,
        user_id: null,
      },
    ],
  },
});
