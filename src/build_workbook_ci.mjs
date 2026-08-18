import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { readJson } from "./lib.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "job-monitor");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "Job_Monitor.xlsx");
const companies = await readJson(path.join(ROOT, "companies.json"), []);
const jobs = await readJson(path.join(ROOT, "data", "jobs.json"), []);
const runs = await readJson(path.join(ROOT, "data", "runs.json"), []);
const config = await readJson(path.join(ROOT, "config.json"), {});

const workbook = new ExcelJS.Workbook();
workbook.creator = "Career Job Monitor";
workbook.created = new Date();
workbook.modified = new Date();

const colors = {
  title: "FF2563EB",
  header: "FF16324F",
  white: "FFFFFFFF",
  pale: "FFEAF2FF",
  stripe: "FFD9EEF7",
  border: "FFCBD5E1",
  textMuted: "FF64748B",
  green: "FFDDF5E5"
};

function prepareSheet(name, title, headers, widths) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }]
  });
  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: colors.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.title } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;

  const headerRow = sheet.getRow(2);
  headerRow.values = headers;
  headerRow.height = 25;
  headerRow.eachCell(cell => {
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: colors.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.header } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = { bottom: { style: "thin", color: { argb: colors.border } } };
  });
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: headers.length } };
  return sheet;
}

function styleDataRows(sheet, startRow, endRow, wrapColumns = []) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.alignment = { vertical: "top" };
    if ((rowNumber - startRow) % 2 === 0) {
      row.eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.stripe } }; });
    }
    row.eachCell(cell => {
      cell.font = { name: "Aptos", size: 10 };
      cell.border = { bottom: { style: "hair", color: { argb: colors.border } } };
    });
    for (const column of wrapColumns) row.getCell(column).alignment = { vertical: "top", wrapText: true };
  }
}

const companiesSheet = prepareSheet(
  "Companies",
  "Career Page Monitor — Company Registry",
  ["Company ID", "Company Name", "Customized Career URL", "Active", "Scan Interval (minutes)"],
  [14, 42, 95, 11, 22]
);
for (const company of companies) {
  const row = companiesSheet.addRow([company.id, company.company, company.career_url, true, config.interval_minutes || 30]);
  row.getCell(3).value = { text: company.career_url, hyperlink: company.career_url };
}
styleDataRows(companiesSheet, 3, companiesSheet.rowCount, [3]);

const jobsSheet = prepareSheet(
  "New Jobs",
  "New Matching Jobs Only (0–3 Years, Sponsorship Eligible)",
  ["Discovered At", "Company ID", "Company", "Role", "Location", "Experience Check", "Posted", "Job ID", "Job URL", "Source URL", "Match Reason", "Description Snippet"],
  [21, 13, 32, 42, 28, 28, 18, 18, 55, 55, 38, 65]
);
if (jobs.length) {
  for (const job of jobs) {
    const row = jobsSheet.addRow([
      new Date(job.discovered_at), job.company_id, job.company, job.role, job.location, job.experience,
      job.posted, String(job.job_id || ""), job.job_url, job.source_url, job.match_reason, job.description_snippet
    ]);
    row.getCell(1).numFmt = "yyyy-mm-dd hh:mm";
    row.getCell(8).numFmt = "@";
    if (job.job_url) row.getCell(9).value = { text: job.job_url, hyperlink: job.job_url };
    if (job.source_url) row.getCell(10).value = { text: job.source_url, hyperlink: job.source_url };
  }
  styleDataRows(jobsSheet, 3, jobsSheet.rowCount, [4, 5, 6, 9, 10, 11, 12]);
} else {
  jobsSheet.mergeCells("A3:L3");
  const empty = jobsSheet.getCell("A3");
  empty.value = "No new matching jobs yet";
  empty.font = { name: "Aptos", italic: true, color: { argb: colors.textMuted } };
  empty.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.pale } };
  empty.alignment = { horizontal: "center" };
}

const runsSheet = prepareSheet(
  "Run Log",
  "Monitor Run Log",
  ["Run At", "Mode", "Companies Checked", "Candidates Seen", "New Jobs Added", "Errors", "Duration (seconds)"],
  [21, 16, 20, 20, 20, 14, 20]
);
for (const run of runs) {
  const row = runsSheet.addRow([
    new Date(run.run_at), run.mode, run.companies_checked, run.candidates_seen,
    run.new_jobs_added, run.errors, run.duration_seconds
  ]);
  row.getCell(1).numFmt = "yyyy-mm-dd hh:mm";
  if (Number(run.new_jobs_added) > 0) {
    row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.green } };
    row.getCell(5).font = { name: "Aptos", size: 10, bold: true, color: { argb: "FF166534" } };
  }
}
if (runs.length) styleDataRows(runsSheet, 3, runsSheet.rowCount);

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await workbook.xlsx.writeFile(OUTPUT_FILE);

if (process.argv.includes("--verify")) {
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(OUTPUT_FILE);
  const expectedSheets = ["Companies", "New Jobs", "Run Log"];
  for (const name of expectedSheets) {
    if (!check.getWorksheet(name)) throw new Error(`Missing worksheet: ${name}`);
  }
  if (check.getWorksheet("Companies").rowCount !== companies.length + 2) throw new Error("Company row count mismatch");
  if (jobs.length && check.getWorksheet("New Jobs").rowCount !== jobs.length + 2) throw new Error("Job row count mismatch");
  if (runs.length && check.getWorksheet("Run Log").rowCount !== runs.length + 2) throw new Error("Run row count mismatch");
  console.log(JSON.stringify({
    workbook: OUTPUT_FILE,
    sheets: expectedSheets,
    companies: companies.length,
    jobs: jobs.length,
    runs: runs.length
  }));
}

console.log(OUTPUT_FILE);
