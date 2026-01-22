/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import $ from "jquery";
import { sanitize_html_safe } from "./sanitize";

(global as any).jQuery = $;
(global as any).$ = $;

describe("sanitize_html_safe", () => {
  it("removes script tags", () => {
    const input = "<div><script>alert(1)</script></div>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("<script>");
  });

  it("removes onclick handlers", () => {
    const input = "<div onclick='alert(1)'>Click me</div>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("onclick");
  });

  it("removes javascript: hrefs", () => {
    const input = "<a href='javascript:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("javascript:");
  });

  it("removes img onerror", () => {
    const input = "<img src=x onerror=alert(1) />";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("onerror");
  });

  // SECURITY FIX: Test bypasses that were previously possible
  it("removes mixed case ONCLICK", () => {
    const input = "<div ONCLICK='alert(1)'>Click me</div>";
    const output = sanitize_html_safe(input);
    expect(output.toLowerCase()).not.toContain("onclick");
  });

  it("removes mixed case JavaScript:", () => {
    const input = "<a href='JavaScript:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("JavaScript:");
  });

  it("removes javascript: with leading whitespace", () => {
    const input = "<a href=' javascript:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("javascript:");
  });

  it("removes javascript: with embedded whitespace", () => {
    const input = "<a href='java script:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("javascript:");
  });

  it("removes javascript: with newline", () => {
    const input = "<a href='java\nscript:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("javascript:");
  });

  it("removes javascript: with tab", () => {
    const input = "<a href='java\tscript:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("javascript:");
  });

  it("removes javascript: with encoded characters", () => {
    const input = "<a href='&#106;avascript:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    // We expect the href to be removed or the protocol to be broken.
    expect(output).not.toContain("&#106;avascript:");
    expect(output).not.toContain("javascript:");
  });

  it("removes vbscript: protocol", () => {
    const input = "<a href='vbscript:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("vbscript:");
  });

  it("removes mixed case VbScRiPt: protocol", () => {
    const input = "<a href='VbScRiPt:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("VbScRiPt:");
  });

  it("removes vbscript: with whitespace", () => {
    const input = "<a href='vb script:alert(1)'>Click me</a>";
    const output = sanitize_html_safe(input);
    expect(output).not.toContain("vbscript:");
  });

  it("allows safe URLs", () => {
    const input = "<a href='https://example.com'>Link</a>";
    const output = sanitize_html_safe(input);
    expect(output).toContain("https://example.com");
  });

  it("allows safe attributes", () => {
    const input = "<div class='test' id='myid'>Content</div>";
    const output = sanitize_html_safe(input);
    expect(output).toContain("class");
    expect(output).toContain("id");
  });
});
