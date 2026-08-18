import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import companies from "../companies.json" with { type: "json" };
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
console.log("Workbook data contract tests passed.");
