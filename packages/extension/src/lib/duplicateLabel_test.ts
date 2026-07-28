import { assertEquals } from "@std/assert";
import { duplicateSavedLabel } from "./duplicateLabel.ts";

Deno.test("duplicateSavedLabel: ready and not archived", () => {
  assertEquals(duplicateSavedLabel("ready", false), "Already in your feed");
});

Deno.test("duplicateSavedLabel: pending and not archived falls back to the 'already in your feed' label", () => {
  assertEquals(duplicateSavedLabel("pending", false), "Already in your feed");
});

Deno.test("duplicateSavedLabel: failed and not archived", () => {
  assertEquals(duplicateSavedLabel("failed", false), "This article failed — you can retry");
});

Deno.test("duplicateSavedLabel: archived takes priority over status", () => {
  assertEquals(duplicateSavedLabel("ready", true), "This article is archived");
  assertEquals(duplicateSavedLabel("failed", true), "This article is archived");
});
