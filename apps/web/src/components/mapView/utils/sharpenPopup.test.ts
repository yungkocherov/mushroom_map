/**
 * Regression tests for sharpenPopup TR_RE regex.
 *
 * Эта regex парсит MapLibre `transform: translate(<anchor>) translate(Xpx, Ypx)`
 * где <anchor> может быть с % или без — bare `0` пишется без процента
 * (см. maplibre-gl/src/ui/popup.ts).
 *
 * История: regex был `(-?[\d.]+)%` — % обязателен. На анкорах top-left/
 * bottom-left/top-right где одна координата = bare `0`, parse валился и
 * inline left/top от прошлого вызова накапливались с новым transform.
 * Попап улетал на (X+old_left, Y+old_top) — баг был визуально заметен
 * на user_spots с anchor=top.
 *
 * Фикс: разрешить `%?` (опциональный %). Эти тесты — guard от
 * регрессии этого фикса.
 */
import { describe, it, expect } from "vitest";
import { TR_RE } from "./sharpenPopup";

describe("TR_RE — popup anchor parsing", () => {
  // ──────────────────────────────────────────────────────────────────
  // anchor сочетания где обе координаты в %
  // ──────────────────────────────────────────────────────────────────

  it.each([
    ["bottom anchor",        "translate(-50%,-100%) translate(100px,200px)"],
    ["bottom-right anchor",  "translate(-100%,-100%) translate(100px,200px)"],
    ["top anchor",           "translate(-50%,0) translate(100px,200px)"],
    ["right anchor",         "translate(-100%,-50%) translate(100px,200px)"],
    ["center anchor",        "translate(-50%,-50%) translate(100px,200px)"],
    ["left anchor",          "translate(0,-50%) translate(100px,200px)"],
  ])("matches %s", (_label, transform) => {
    const m = transform.match(TR_RE);
    expect(m).not.toBeNull();
  });

  // ──────────────────────────────────────────────────────────────────
  // anchor сочетания с bare `0` (без %) — это конкретный регрешн
  // ──────────────────────────────────────────────────────────────────

  it("matches top-left anchor (0, 0 — оба bare)", () => {
    const m = "translate(0,0) translate(100px,200px)".match(TR_RE);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("0");
    expect(m![2]).toBe("");   // нет % в первой координате
    expect(m![3]).toBe("0");
    expect(m![4]).toBe("");   // нет % во второй
    expect(m![5]).toBe("100");
    expect(m![6]).toBe("200");
  });

  it("matches bottom-left anchor (0, -100% — смешанные)", () => {
    const m = "translate(0,-100%) translate(50px,75px)".match(TR_RE);
    expect(m).not.toBeNull();
    expect(m![2]).toBe("");   // bare 0
    expect(m![4]).toBe("%");  // -100%
  });

  it("matches top-right anchor (-100%, 0 — обратное)", () => {
    const m = "translate(-100%,0) translate(50px,75px)".match(TR_RE);
    expect(m).not.toBeNull();
    expect(m![2]).toBe("%");
    expect(m![4]).toBe("");
  });

  // ──────────────────────────────────────────────────────────────────
  // edge cases
  // ──────────────────────────────────────────────────────────────────

  it("handles fractional pixel values (subpixel rendering)", () => {
    const m = "translate(-50%,-100%) translate(100.5px,200.25px)".match(TR_RE);
    expect(m).not.toBeNull();
    expect(m![5]).toBe("100.5");
    expect(m![6]).toBe("200.25");
  });

  it("handles whitespace between coords", () => {
    const m = "translate(-50%, -100%) translate(100px, 200px)".match(TR_RE);
    expect(m).not.toBeNull();
  });

  it("returns null on missing px-translate (just anchor)", () => {
    expect("translate(-50%, -100%)".match(TR_RE)).toBeNull();
  });

  it("returns null on garbage", () => {
    expect("not a transform".match(TR_RE)).toBeNull();
    expect("rotate(45deg)".match(TR_RE)).toBeNull();
  });
});
