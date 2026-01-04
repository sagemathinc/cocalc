/*
Expose the Next.js api/v2 handlers through a lightweight Express router so the
hub can run without Next.js for lightweight control-plane deployments. This
loads compiled api/v2 modules directly and installs a resolver for the
Next-style "lib/*" alias used throughout those handlers.
*/

import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { existsSync, readdirSync, statSync } from "fs";
import { delimiter, join, sep } from "path";
import * as Module from "module";
import { getLogger } from "@cocalc/backend/logger";

export interface ApiV2RouterOptions {
  includeDocs?: boolean;
  rootDir?: string;
}

export default function createApiV2Router(
  opts: ApiV2RouterOptions = {},
): express.Router {
  const logger = getLogger("api-v2-router");
  const router = express.Router();

  router.use(express.json({ limit: "10mb" }));
  router.use(express.urlencoded({ extended: true }));
  router.use(ensureCookies);

  const apiRoot = resolveApiRoot(opts.rootDir);
  ensureNextLibAlias(apiRoot, logger);
  const ext = pickExtension(apiRoot);
  const files = collectApiFiles(apiRoot, ext);

  for (const file of files) {
    const relative = toRelative(apiRoot, file);
    if (!opts.includeDocs && relative === `index${ext}`) {
      continue;
    }
    const routePath = toRoutePath(relative, ext);
    const handler = loadHandler(file, logger);
    if (!handler) {
      continue;
    }
    router.all(routePath, wrapHandler(handler, logger, routePath));
  }

  return router;
}

function resolveApiRoot(override?: string): string {
  if (process.env.COCALC_API_V2_ROOT) {
    return process.env.COCALC_API_V2_ROOT;
  }
  if (override) {
    return override;
  }
  return join(__dirname, "..", "pages", "api", "v2");
}

function ensureNextLibAlias(
  apiRoot: string,
  logger: ReturnType<typeof getLogger>,
) {
  const distRoot = join(apiRoot, "..", "..", "..");
  const moduleImpl = Module as unknown as {
    _initPaths?: () => void;
    _cocalcNextLibPatched?: boolean;
  };
  if (moduleImpl._cocalcNextLibPatched) {
    return;
  }
  const current = (process.env.NODE_PATH ?? "")
    .split(delimiter)
    .filter(Boolean);
  if (!current.includes(distRoot)) {
    current.unshift(distRoot);
    process.env.NODE_PATH = current.join(delimiter);
  }
  if (typeof moduleImpl._initPaths === "function") {
    moduleImpl._initPaths();
  }
  moduleImpl._cocalcNextLibPatched = true;
  logger.info("api v2 configured NODE_PATH for lib/*", { distRoot });
}

function pickExtension(apiRoot: string): ".js" | ".ts" {
  if (existsSync(join(apiRoot, "index.js"))) {
    return ".js";
  }
  return ".ts";
}

function collectApiFiles(root: string, ext: ".js" | ".ts"): string[] {
  if (!existsSync(root)) {
    throw new Error(`api v2 root not found: ${root}`);
  }
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith(".")) {
        continue;
      }
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.endsWith(ext)) {
        continue;
      }
      if (entry.endsWith(".test" + ext) || entry.endsWith(".spec" + ext)) {
        continue;
      }
      out.push(full);
    }
  }
  return out.sort();
}

function toRelative(root: string, fullPath: string): string {
  const rel = fullPath
    .slice(root.length + 1)
    .split(sep)
    .join("/");
  return rel;
}

function toRoutePath(relative: string, ext: ".js" | ".ts"): string {
  let route = relative.slice(0, -ext.length);
  if (route === "index") {
    return "/";
  }
  return "/" + route;
}

function loadHandler(
  file: string,
  logger: ReturnType<typeof getLogger>,
): ((req: Request, res: Response) => any) | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file);
    const handler = mod?.default ?? mod;
    if (typeof handler !== "function") {
      logger.warn("api v2 handler is not a function", { file });
      return null;
    }
    return handler;
  } catch (err) {
    logger.warn("api v2 handler load failed", { file, err });
    return null;
  }
}

function wrapHandler(
  handler: (req: Request, res: Response) => any,
  logger: ReturnType<typeof getLogger>,
  routePath: string,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: "api_v2_error" });
      }
      logger.warn("api v2 handler error", { routePath, err });
      next(err);
    }
  };
}

function ensureCookies(req: Request, _res: Response, next: NextFunction) {
  const reqAny = req as Request & { cookies?: Record<string, string> };
  if (reqAny.cookies) {
    next();
    return;
  }
  reqAny.cookies = parseCookieHeader(req.headers.cookie);
  next();
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      cookies[decodeURIComponent(trimmed)] = "";
      continue;
    }
    const key = decodeURIComponent(trimmed.slice(0, eq).trim());
    const value = decodeURIComponent(trimmed.slice(eq + 1).trim());
    cookies[key] = value;
  }
  return cookies;
}
