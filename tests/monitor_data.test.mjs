import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import companies from "../companies.json" with { type: "json" };
import { filteredDashboard, unfilteredDashboard } from "../src/dashboard.mjs";
import { workbookSheets } from "../src/workbook_data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const definitions = await workbookSheets(root);
assert.deepEqual(definitions.map(item => item.name), ["Apply Now", "New Jobs", "All Extracted Jobs", "Decision Audit", "Source Health", "Run Log", "Companies"]);
assert.equal(definitions.find(item => item.name === "Source Health").rows.length, companies.length);
assert.equal(new Set(companies.map(item => item.id)).size, companies.length);
assert.equal(definitions.find(item => item.name === "Companies").rows.every((row, index) => row[2] === companies[index].career_url), true);
for (const name of ["Apply Now", "New Jobs", "All Extracted Jobs", "Decision Audit"]) {
  const definition = definitions.find(item => item.name === name);
  for (const header of ["Required Years", "Preferred Years", "Sponsorship", "Student Enrollment", "Decision", "Exclusion Reasons", "Apply URL"]) assert.ok(definition.headers.includes(header), `${name} missing ${header}`);
}

const assertNewestFirst = (name, dateColumn = 0) => {
  const values = definitions.find(item => item.name === name).rows.map(row => row[dateColumn]).filter(value => value instanceof Date).map(value => value.getTime());
  assert.deepEqual(values, [...values].sort((a, b) => b - a), `${name} is not newest first`);
};
assertNewestFirst("Apply Now");
assertNewestFirst("New Jobs");
assertNewestFirst("All Extracted Jobs");
assertNewestFirst("Decision Audit");
assertNewestFirst("Run Log");

const mockRecords = [
  { key: "old", first_seen_at: "2026-08-17T00:00:00Z", company: "Old Co", title: "Software Engineer", job_url: "https://example.com/old", accepted: true, active_status: "Active", decision: "Included" },
  { key: "new", first_seen_at: "2026-08-18T00:00:00Z", company: "New Co", title: "AI Engineer", job_url: "https://example.com/new", accepted: true, active_status: "Active", decision: "Included" }
];
for (const markdown of [filteredDashboard("2026-08-18T01:00:00Z", mockRecords, []), unfilteredDashboard("2026-08-18T01:00:00Z", mockRecords)]) {
  assert.ok(markdown.indexOf("New Co") < markdown.indexOf("Old Co"), "Markdown dashboard is not newest first");
  assert.ok(markdown.includes("LATEST_JOBS.md") && markdown.includes("ALL_EXTRACTED_JOBS.md"), "Dashboard navigation links missing");
}
console.log("Workbook data contract tests passed.");
