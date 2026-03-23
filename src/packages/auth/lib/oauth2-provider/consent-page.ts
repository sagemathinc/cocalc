/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Server-rendered consent page for the OAuth2 authorization flow.

import { OAUTH2_SCOPES } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ConsentPageOptions {
  clientName: string;
  clientDescription: string;
  clientMode: string;
  requestedScopes: string[];
  queryParams: Record<string, string>;
  deviceName: string;
  basePath: string;
  consentNonce: string;
}

export function renderConsentPage(opts: ConsentPageOptions): string {
  const {
    clientName,
    clientDescription,
    clientMode,
    requestedScopes,
    queryParams,
    deviceName,
    basePath,
    consentNonce,
  } = opts;

  const scopeListHtml = requestedScopes
    .map((s) => {
      let description: string;
      if (s in OAUTH2_SCOPES) {
        description = OAUTH2_SCOPES[s as keyof typeof OAUTH2_SCOPES];
      } else if (s.startsWith("api:project:")) {
        description = `Access project ${s.slice("api:project:".length)}`;
      } else {
        description = s;
      }
      return `<li><strong>${escapeHtml(s)}</strong> — ${escapeHtml(description)}</li>`;
    })
    .join("\n");

  const hiddenFields = [
    // CSRF protection: consent nonce tied to this user + client
    `<input type="hidden" name="consent_nonce" value="${escapeHtml(consentNonce)}" />`,
    ...Object.entries(queryParams)
      .filter(([k]) => k !== "device_name")
      .map(
        ([k, v]) =>
          `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`,
      ),
  ].join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize ${escapeHtml(clientName)} — CoCalc</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
           background: #f5f5f5; display: flex; justify-content: center; align-items: center;
           min-height: 100vh; padding: 20px; }
    .card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 480px; width: 100%; padding: 32px; }
    h1 { font-size: 20px; margin-bottom: 8px; }
    .app-name { color: #1a73e8; }
    .description { color: #666; margin-bottom: 20px; font-size: 14px; }
    .section-label { font-weight: 600; font-size: 14px; margin-bottom: 8px; color: #333; }
    ul { list-style: none; margin-bottom: 24px; }
    li { padding: 6px 0; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    li:last-child { border-bottom: none; }
    li strong { color: #333; }
    .mode-tag { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 4px;
                font-weight: 600; margin-left: 8px; }
    .mode-web { background: #e6f0ff; color: #1a73e8; }
    .mode-native { background: #e6ffe6; color: #2e7d32; }
    .device-name { margin-bottom: 20px; }
    .device-name label { font-weight: 600; font-size: 14px; color: #333; display: block; margin-bottom: 4px; }
    .device-name input { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;
                         font-size: 14px; font-family: monospace; }
    .buttons { display: flex; gap: 12px; }
    button { flex: 1; padding: 10px; border-radius: 6px; font-size: 15px; cursor: pointer;
             border: 1px solid #ddd; font-weight: 500; }
    .btn-authorize { background: #1a73e8; color: #fff; border-color: #1a73e8; }
    .btn-authorize:hover { background: #1557b0; }
    .btn-deny { background: #fff; color: #333; }
    .btn-deny:hover { background: #f5f5f5; }
    .footer { margin-top: 20px; text-align: center; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <h1>
      <span class="app-name">${escapeHtml(clientName)}</span>
      wants to access your CoCalc account
    </h1>
    <p class="description">
      ${clientDescription ? escapeHtml(clientDescription) : "This application is requesting access to your account."}
      <span class="mode-tag mode-${clientMode}">${clientMode}</span>
    </p>

    <div class="section-label">This will allow the application to:</div>
    <ul>${scopeListHtml}</ul>

    <form method="POST" action="${basePath}/oauth/authorize">
      ${hiddenFields}
      <div class="device-name">
        <label for="device_name">Session name</label>
        <input type="text" id="device_name" name="device_name"
               value="${escapeHtml(deviceName)}"
               placeholder="e.g. my-laptop" />
      </div>
      <div class="buttons">
        <button type="submit" class="btn-authorize" style="flex:1;">Authorize</button>
        <button type="submit" name="deny" value="1" class="btn-deny" style="flex:1;">Deny</button>
      </div>
    </form>

    <div class="footer">
      You are authorizing access to your CoCalc account. You can revoke this at any time.
    </div>
  </div>
</body>
</html>`;
}
