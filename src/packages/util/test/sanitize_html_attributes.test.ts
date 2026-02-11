import { sanitize_html_attributes } from "../misc";

describe("sanitize_html_attributes", () => {
  // Mock jQuery: $(node) returns an object with removeAttr
  const $ = (node: { attributes?: { name: string; value: string }[] }) => ({
    removeAttr: (name: string) => {
      if (node.attributes) {
        const idx = node.attributes.findIndex((a) => a.name === name);
        if (idx !== -1) {
          node.attributes.splice(idx, 1);
        }
      }
    },
  });

  test("removes standard onload attribute", () => {
    const node = {
      attributes: [
        { name: "onload", value: "alert(1)" },
        { name: "class", value: "test" },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0].name).toBe("class");
  });

  test("removes ONLOAD attribute (case insensitivity)", () => {
    const node = {
      attributes: [
        { name: "ONLOAD", value: "alert(1)" },
        { name: "class", value: "test" },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0].name).toBe("class");
  });

  test("removes javascript: href", () => {
    const node = {
      attributes: [{ name: "href", value: "javascript:alert(1)" }],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });

  test("keeps data:image/png src (legitimate image)", () => {
    const node = {
      attributes: [
        {
          name: "src",
          value:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0].name).toBe("src");
  });

  test("removes data:text/html src (invalid src type)", () => {
    const node = {
      attributes: [
        { name: "src", value: "data:text/html,<script>alert(1)</script>" },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });

  test("removes data:image/png href (data URI only allowed on src)", () => {
    const node = {
      attributes: [
        {
          name: "href",
          value:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });

  test("removes JaVaScRiPt: href (case insensitivity)", () => {
    const node = {
      attributes: [{ name: "href", value: "JaVaScRiPt:alert(1)" }],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });

  test("removes javascript: with whitespace", () => {
    const node = {
      attributes: [{ name: "href", value: " javascript:alert(1)" }],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });

  test("removes javascript: with control characters", () => {
    const node = {
      attributes: [{ name: "href", value: "java\tscript:alert(1)" }],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });

  test("removes vbscript: href", () => {
    const node = {
      attributes: [{ name: "href", value: "vbscript:msgbox(1)" }],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });

  test("keeps safe href values", () => {
    const node = {
      attributes: [{ name: "href", value: "https://example.com" }],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0].name).toBe("href");
  });

  test("removes all consecutive unsafe attributes (live-collection regression)", () => {
    // This is the XSS scenario: consecutive on* attributes where removing
    // the first one would shift indices and skip the second in a live
    // NamedNodeMap if iterated without snapshotting.
    const node = {
      attributes: [
        { name: "onload", value: "alert(1)" },
        { name: "onerror", value: "alert(2)" },
        { name: "class", value: "test" },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(1);
    expect(node.attributes[0].name).toBe("class");
  });

  test("removes many unsafe attributes interleaved with safe ones", () => {
    const node = {
      attributes: [
        { name: "onload", value: "x" },
        { name: "class", value: "ok" },
        { name: "onerror", value: "x" },
        { name: "id", value: "ok" },
        { name: "onclick", value: "x" },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(2);
    expect(node.attributes.map((a) => a.name)).toEqual(["class", "id"]);
  });

  test("removes data: href (XSS vector)", () => {
    const node = {
      attributes: [
        { name: "href", value: "data:text/html,<script>alert(1)</script>" },
      ],
    };
    sanitize_html_attributes($, node);
    expect(node.attributes).toHaveLength(0);
  });
});
