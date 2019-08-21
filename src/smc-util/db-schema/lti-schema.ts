import { create } from "./types";

export const platforms = create({
  fields: {
    guid: {
      type: "string",
      desc: "global UID of the platform"
    }
  },
  rules: {
    desc: "",
    primary_key: "guid",
    user_query: {
      get: {
        fields: {},
        pg_where: ["some string"]
      }
    }
  }
});
