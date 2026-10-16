// Run: node --experimental-strip-types --test tests/unit/test_processing_and_study.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  knowledgeProgressPercent,
  splitNdjson,
} from "../../src/lib/processing-events.ts";
import {
  groundSummary,
  parseStudySummary,
  sectionWordsFor,
  summaryToMarkdown,
  DIRECT_SUMMARY_MAX_WORDS,
  MAX_SUMMARY_WORDS,
  type StudySummary,
} from "../../src/lib/study-summary.ts";
import {
  fileExtension,
  formatFileSize,
  validateUploadFile,
  MAX_UPLOAD_BYTES,
} from "../../src/lib/upload-constraints.ts";

test("splitNdjson returns complete events and keeps the partial tail", () => {
  const { events, rest } = splitNdjson(
    '{"type":"stage","stage":"extract","status":"started"}\n{"type":"res'
  );
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { type: "stage", stage: "extract", status: "started" });
  assert.equal(rest, '{"type":"res');
});

test("splitNdjson skips blank and malformed lines", () => {
  const { events, rest } = splitNdjson('\nnot json\n{"type":"result","data":1}\n');
  assert.equal(events.length, 1);
  assert.equal(rest, "");
});

test("knowledgeProgressPercent reflects completed stages and real upload bytes", () => {
  assert.equal(knowledgeProgressPercent(new Set(), 0), 0);
  assert.equal(knowledgeProgressPercent(new Set(), 0.5), 13);
  assert.equal(knowledgeProgressPercent(new Set(["upload"]), 1), 25);
  assert.equal(knowledgeProgressPercent(new Set(["upload", "extract"]), 1), 50);
  assert.equal(knowledgeProgressPercent(new Set(["upload", "extract", "process", "ready"]), 1), 100);
});

test("upload validation mirrors the server rules", () => {
  assert.equal(fileExtension("Laporan.Final.PDF"), ".pdf");
  assert.equal(fileExtension("README"), "");
  assert.equal(validateUploadFile({ name: "a.pdf", size: 10 }), null);
  assert.match(validateUploadFile({ name: "a.exe", size: 10 }) ?? "", /Unsupported/);
  assert.match(validateUploadFile({ name: "a.pdf", size: 0 }) ?? "", /empty/);
  assert.match(validateUploadFile({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1 }) ?? "", /larger/);
  assert.equal(formatFileSize(2.4 * 1024 * 1024), "2.4 MB");
});

test("sectionWordsFor: single pass for short material, bounded sections otherwise", () => {
  assert.equal(sectionWordsFor(DIRECT_SUMMARY_MAX_WORDS), 0);
  assert.equal(sectionWordsFor(6000), 1500);
  assert.ok(sectionWordsFor(MAX_SUMMARY_WORDS) <= 2500);
  assert.throws(() => sectionWordsFor(MAX_SUMMARY_WORDS + 1), RangeError);
});

const summary: StudySummary = {
  title: "Exploratory Data Analysis",
  overview: "Overview",
  coreConcept: "EDA explores data before modelling.",
  keyConcepts: [
    { term: "Missing value", explanation: "Data that is absent." },
    { term: "Quantum entanglement", explanation: "Not in the source." },
    { term: "Z-Score", explanation: "Standardised distance." },
  ],
  keyTakeaway: "Clean data first.",
  importantPoints: ["Check outliers"],
};

test("parseStudySummary accepts JSON (also wrapped in text) and rejects invalid output", () => {
  assert.equal(parseStudySummary(`Here: ${JSON.stringify(summary)}`)?.title, summary.title);
  assert.equal(parseStudySummary("no json"), null);
  assert.equal(parseStudySummary('{"title": ""}'), null);
  const minimal = parseStudySummary('{"title":"T","coreConcept":"C"}');
  assert.deepEqual(minimal?.keyConcepts, []);
});

test("groundSummary drops concepts that do not occur in the source text", () => {
  const source = "Missing value terjadi ketika data kosong. Nilai z-score mengukur jarak.";
  const { summary: grounded, droppedConcepts } = groundSummary(summary, source);
  assert.deepEqual(
    grounded.keyConcepts.map((c) => c.term),
    ["Missing value", "Z-Score"]
  );
  assert.deepEqual(droppedConcepts, ["Quantum entanglement"]);
});

test("summaryToMarkdown includes every section", () => {
  const md = summaryToMarkdown(summary, "eda.pdf");
  assert.match(md, /^# Exploratory Data Analysis/);
  assert.match(md, /## Core concept/);
  assert.match(md, /\*\*Missing value\*\*/);
  assert.match(md, /> Clean data first\./);
  assert.match(md, /- Check outliers/);
});
