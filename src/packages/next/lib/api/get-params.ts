import type { Request } from "express";

export default function getParams(req: Request, params: string[]) {
  const x: any = {};
  if (req?.method == "POST") {
    for (const param of params) {
      x[param] = req.body?.[param];
    }
  } else {
    for (const param of params) {
      x[param] = req.query?.[param];
    }
  }
  return x;
}
