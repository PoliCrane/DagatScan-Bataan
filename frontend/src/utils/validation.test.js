import { describe, expect, test } from "vitest";
import { isValidPhilippineMobile, isValidEmail } from "./validation";

describe("validation", () => {
  test("accepts valid PH mobile formats", () => {
    expect(isValidPhilippineMobile("09171234567")).toBe(true);
    expect(isValidPhilippineMobile("+639171234567")).toBe(true);
  });

  test("rejects invalid mobile numbers", () => {
    expect(isValidPhilippineMobile("12345")).toBe(false);
    expect(isValidPhilippineMobile("0917123456")).toBe(false);
    expect(isValidPhilippineMobile("+1 555 123 4567")).toBe(false);
  });

  test("validates email format", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
