// @ts-ignore -- typescript thinks this isn't used
import { CustomTypes } from "slate";

declare module "slate" {
  interface CustomTypes {
    // @ts-ignore -- typescript doesn't like the type of Text; I don't know why.
    Text: {
      placeholder: string;
    };
    Range: {
      placeholder?: string;
    };
  }
}
