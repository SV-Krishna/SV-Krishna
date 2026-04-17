import test from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity } from "../services/embeddingStore";

test("cosineSimilarity favors aligned vectors", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(cosineSimilarity([1, 1], [1, 0]) > cosineSimilarity([1, 1], [0, -1]));
});
