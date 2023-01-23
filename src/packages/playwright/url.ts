import { readFileSync } from "fs";

export const URL = readFileSync("./.url").toString();
