import { describe, it, expect } from "vitest";
import { clampWidth, keyWidth, storedWidth, DEFAULT_SIDEBAR } from "../src/layout.ts";

describe("spec list width", () => {
  it("opens at 280px [companion-layout#R1.S1]", () => {
    expect(DEFAULT_SIDEBAR).toBe(280);
    expect(storedWidth()).toBe(280);   // no localStorage in tests: falls back to the default
  });

  it("clamps to 200–480 [companion-layout#R2.S2]", () => {
    expect(clampWidth(280 - 400)).toBe(200);
    expect(clampWidth(200 + 600)).toBe(480);
    expect(clampWidth(380)).toBe(380);
  });

  it("arrow keys move 10px [companion-layout#R2.S4]", () => {
    let w = 280;
    for (let i = 0; i < 3; i++) w = keyWidth(w, "ArrowRight")!;
    expect(w).toBe(310);
    expect(keyWidth(475, "ArrowRight")).toBe(480);
    expect(keyWidth(280, "Enter")).toBeNull();
  });

  it("reset returns to 280 [companion-layout#R2.S5]", () => {
    expect(clampWidth(DEFAULT_SIDEBAR)).toBe(280);
  });
});
