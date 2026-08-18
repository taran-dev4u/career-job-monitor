import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { readJson } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "job-monitor");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "Job_Monitor.xlsx");
const companies = await readJson(path.join(ROOT, "companies.json"), []);
const jobs = await readJson(path.join(ROOT, "data", "jobs.json"), []);
const runs = await readJson(path.join(ROOT, "data", "runs.json"), []);
const config = await readJson(path.join(ROOT, "config.json"), {});

const workbook = Workbook.create();
const companiesSheet = workbook.worksheets.add("Companies");
const jobsSheet = workbook.worksheets.add("New Jobs");
const runsSheet = workbook.worksheets.add("Run Log");

const navy = "#16324F";
const blue = "#2563EB";
const pale = "#EAF2FF";
const green = "#DDF5E5";
const gray = "#64748B";
const headerFormat = { fill: navy, font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center" };
const titleFormat = { fill: blue, font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };

function styleSheet(sheet, titleRange, headerRange, dataRange, widths) {
  sheet.showGridLines = false;
  sheet.getRange(titleRange).format = titleFormat;
  sheet.getRange(titleRange).format.rowHeight = 30;
  sheet.getRange(headerRange).format = headerFormat;
  sheet.getRange(headerRange).format.rowHeight = 25;
  if (dataRange) {
    sheet.getRange(dataRange).format.verticalAlignment = "top";
    sheet.getRange(dataRange).format.borders = { preset: "inside", style: "thin", color: "#E2E8F0" };
  }
  widths.forEach(([range, width]) => { sheet.getRange(range).format.columnWidth = width; });
  sheet.freezePanes.freezeRows(3);
}

companiesSheet.mergeCells("A1:E1");
companiesSheet.getRange("A1:E1").values = [["Career Page Monitor — Company Registry"]];
companiesSheet.getRange("A2:E2").values = [["Company ID", "Company Name", "Customized Career URL", "Active", "Scan Interval (minutes)"]];
companiesSheet.getRange(`A3:E${Math.max(3, companies.length + 2)}`).values = companies.map(company => [
  company.id, company.company, company.career_url, true, config.interval_minutes || 30
]);
styleSheet(companiesSheet, "A1:E1", "A2:E2", `A3:E${companies.length + 2}`, [["A:A", 14], ["B:B", 42], ["C:C", 95], ["D:D", 11], ["E:E", 22]]);
companiesSheet.getRange(`C3:C${companies.length + 2}`).format.wrapText = true;
companiesSheet.getRange(`A2:E${companies.length + 2}`).format.borders = { preset: "outside", style: "thin", color: "#CBD5E1" };
companiesSheet.tables.add(`A2:E${companies.length + 2}`, true, "CompaniesTable").style = "TableStyleMedium2";

jobsSheet.mergeCells("A1:L1");
jobsSheet.getRange("A1:L1").values = [["New Matching Jobs Only (0–3 Years)"]];
jobsSheet.getRange("A2:L2").values = [["Discovered At", "Company ID", "Company", "Role", "Location", "Experience Check", "Posted", "Job ID", "Job URL", "Source URL", "Match Reason", "Description Snippet"]];
if (jobs.length) {
  jobsSheet.getRange(`A3:L${jobs.length + 2}`).values = jobs.map(job => [
    new Date(job.discovered_at), job.company_id, job.company, job.role, job.location, job.experience,
    job.posted, job.job_id ? `\u200B${job.job_id}` : "", job.job_url, job.source_url, job.match_reason, job.description_snippet
  ]);
  jobsSheet.getRange(`A3:A${jobs.length + 2}`).format.numberFormat = "yyyy-mm-dd hh:mm";
  jobsSheet.getRange(`H3:H${jobs.length + 2}`).format.numberFormat = "@";
  jobsSheet.getRange(`A3:L${jobs.length + 2}`).format.wrapText = true;
  jobsSheet.tables.add(`A2:L${jobs.length + 2}`, true, "NewJobsTable").style = "TableStyleMedium2";
} else {
  jobsSheet.getRange("A3:L3").values = [["No new matching jobs yet", "", "", "", "", "", "", "", "", "", "", ""]];
  jobsSheet.mergeCells("A3:L3");
  jobsSheet.getRange("A3:L3").format = { fill: pale, font: { italic: true, color: gray }, horizontalAlignment: "center" };
}
styleSheet(jobsSheet, "A1:L1", "A2:L2", jobs.length ? `A3:L${jobs.length + 2}` : null, [
  ["A:A", 21], ["B:B", 13], ["C:C", 32], ["D:D", 42], ["E:E", 28], ["F:F", 28],
  ["G:G", 18], ["H:H", 17], ["I:J", 55], ["K:K", 35], ["L:L", 65]
]);

runsSheet.mergeCells("A1:G1");
runsSheet.getRange("A1:G1").values = [["Monitor Run Log"]];
runsSheet.getRange("A2:G2").values = [["Run At", "Mode", "Companies Checked", "Candidates Seen", "New Jobs Added", "Errors", "Duration (seconds)"]];
if (runs.length) {
  runsSheet.getRange(`A3:G${runs.length + 2}`).values = runs.map(run => [
    new Date(run.run_at), run.mode, run.companies_checked, run.candidates_seen, run.new_jobs_added, run.errors, run.duration_seconds
  ]);
  runsSheet.getRange(`A3:A${runs.length + 2}`).format.numberFormat = "yyyy-mm-dd hh:mm";
  runsSheet.getRange(`B3:B${runs.length + 2}`).conditionalFormats.add("containsText", { text: "baseline", format: { fill: pale, font: { color: blue } } });
  runsSheet.getRange(`E3:E${runs.length + 2}`).conditionalFormats.add("cellIs", { operator: "greaterThan", formula: 0, format: { fill: green, font: { bold: true, color: "#166534" } } });
  runsSheet.tables.add(`A2:G${runs.length + 2}`, true, "RunLogTable").style = "TableStyleMedium2";
}
styleSheet(runsSheet, "A1:G1", "A2:G2", runs.length ? `A3:G${runs.length + 2}` : null, [
  ["A:A", 21], ["B:B", 16], ["C:F", 20], ["G:G", 20]
]);

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_FILE);

if (process.argv.includes("--verify")) {
  const jobsEnd = Math.max(3, jobs.length + 2);
  const checks = {
    companies: (await workbook.inspect({ kind: "table", range: `Companies!A1:E${companies.length + 2}`, include: "values,formulas", tableMaxRows: 25, tableMaxCols: 6 })).ndjson,
    jobs: (await workbook.inspect({ kind: "table", range: `New Jobs!A1:L${jobsEnd}`, include: "values,formulas", tableMaxRows: 8, tableMaxCols: 12 })).ndjson,
    runs: (await workbook.inspect({ kind: "table", range: `Run Log!A1:G${Math.max(3, runs.length + 2)}`, include: "values,formulas", tableMaxRows: 8, tableMaxCols: 8 })).ndjson,
    errors: (await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "formula error scan" })).ndjson
  };
  console.log(JSON.stringify(checks, null, 2));
  for (const [sheetName, fileName] of [["Companies", "companies.png"], ["New Jobs", "new-jobs.png"], ["Run Log", "run-log.png"]]) {
    const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
    await fs.writeFile(path.join(OUTPUT_DIR, fileName), new Uint8Array(await preview.arrayBuffer()));
  }
}

console.log(OUTPUT_FILE);
