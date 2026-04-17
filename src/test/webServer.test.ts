import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeUploadFileName } from "../web/webServer";

test("sanitizeUploadFileName strips paths and unsafe characters", () => {
  assert.equal(
    sanitizeUploadFileName("../Boat Manual 2026?.pdf"),
    "Boat-Manual-2026-.pdf",
  );
  assert.equal(
    sanitizeUploadFileName("nested/path/checklist"),
    "checklist.pdf",
  );
});
