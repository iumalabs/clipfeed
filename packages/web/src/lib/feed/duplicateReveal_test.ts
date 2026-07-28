import { assertEquals } from "@std/assert";
import { ApiError } from "../api/api.ts";
import {
  classifyDuplicateState,
  type DuplicateRevealDict,
  duplicateRevealMessage,
  extractDuplicateInfo,
} from "./duplicateReveal.ts";

Deno.test("extractDuplicateInfo: returns null for a non-ApiError", () => {
  assertEquals(extractDuplicateInfo(new Error("boom")), null);
});

Deno.test("extractDuplicateInfo: returns null for a non-409 ApiError", () => {
  const err = new ApiError("unauthorized", 401, { error: "unauthorized" });
  assertEquals(extractDuplicateInfo(err), null);
});

Deno.test("extractDuplicateInfo: returns null for a 409 that isn't the duplicate shape (e.g. already-ready)", () => {
  const err = new ApiError("article is already ready", 409, {
    error: "article is already ready",
  });
  assertEquals(extractDuplicateInfo(err), null);
});

Deno.test("extractDuplicateInfo: returns null when the body has no id", () => {
  const err = new ApiError("duplicate", 409, { error: "duplicate" });
  assertEquals(extractDuplicateInfo(err), null);
});

Deno.test("extractDuplicateInfo: parses the exact-URL duplicate shape (no reason field)", () => {
  const err = new ApiError("duplicate", 409, {
    error: "duplicate",
    id: "abc123",
    status: "ready",
    archived: false,
  });
  assertEquals(extractDuplicateInfo(err), { id: "abc123", status: "ready", archived: false });
});

Deno.test("extractDuplicateInfo: parses the similar-title duplicate shape the same way", () => {
  const err = new ApiError("duplicate", 409, {
    error: "duplicate",
    id: "abc123",
    status: "failed",
    archived: true,
    reason: "similar_title",
  });
  assertEquals(extractDuplicateInfo(err), { id: "abc123", status: "failed", archived: true });
});

Deno.test("extractDuplicateInfo: defaults status/archived when the body omits them (older server)", () => {
  const err = new ApiError("duplicate", 409, { error: "duplicate", id: "abc123" });
  assertEquals(extractDuplicateInfo(err), { id: "abc123", status: "ready", archived: false });
});

Deno.test("classifyDuplicateState: ready and not archived", () => {
  assertEquals(classifyDuplicateState({ status: "ready", archived: false }), "ready");
});

Deno.test("classifyDuplicateState: pending and not archived falls back to 'ready'", () => {
  assertEquals(classifyDuplicateState({ status: "pending", archived: false }), "ready");
});

Deno.test("classifyDuplicateState: failed and not archived", () => {
  assertEquals(classifyDuplicateState({ status: "failed", archived: false }), "failed");
});

Deno.test("classifyDuplicateState: archived takes priority over status", () => {
  assertEquals(classifyDuplicateState({ status: "ready", archived: true }), "archived");
  assertEquals(classifyDuplicateState({ status: "failed", archived: true }), "archived");
});

const dict: DuplicateRevealDict = {
  duplicateRevealReadyToast: "ready-toast",
  duplicateRevealArchivedToast: "archived-toast",
  duplicateRevealFailedToast: "failed-toast",
};

Deno.test("duplicateRevealMessage: picks the matching dict string for each state", () => {
  assertEquals(duplicateRevealMessage(dict, "ready"), "ready-toast");
  assertEquals(duplicateRevealMessage(dict, "archived"), "archived-toast");
  assertEquals(duplicateRevealMessage(dict, "failed"), "failed-toast");
});
