import assert from "node:assert/strict";
import test from "node:test";
import { shouldKeepLastGoodCatalog } from "./catalog-snapshot-policy.js";

test("conserva el catálogo anterior si la actualización queda vacía", () => {
  assert.equal(shouldKeepLastGoodCatalog(1_000, 0), true);
});

test("conserva el catálogo ante una caída masiva de cobertura", () => {
  assert.equal(shouldKeepLastGoodCatalog(1_000, 150), true);
});

test("acepta una actualización con cobertura razonable", () => {
  assert.equal(shouldKeepLastGoodCatalog(1_000, 850), false);
});
