import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { workbookSheets } from "./workbook_data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "job-monitor");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "Job_Monitor.xlsx");
const definitions = await workbookSheets(ROOT);
const workbook = Workbook.create();
const colors = { title: "#2563EB", header: "#16324F", stripe: "#EAF4FB", border: "#CBD5E1", gray: "#64748B", green: "#DCFCE7", red: "#FEE2E2", amber: "#FEF3C7", blue: "#DBEAFE" };

function columnName(index) {
  let result = "", value = index;
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26); }
  return result;
}

for (const definition of definitions) {
  const sheet = workbook.worksheets.add(definition.name);
  const endColumn = columnName(definition.headers.length);
  sheet.mergeCells(`A1:${endColumn}1`);
  sheet.getRange(`A1:${endColumn}1`).values = [[definition.title]];
  sheet.getRange(`A1:${endColumn}1`).format = { fill: colors.title, font: { bold: true, color: "#FFFFFF", size: 16 }, verticalAlignment: "center" };
  sheet.getRange(`A1:${endColumn}1`).format.rowHeight = 30;
  sheet.getRange(`A2:${endColumn}2`).values = [definition.headers];
  sheet.getRange(`A2:${endColumn}2`).format = { fill: colors.header, font: { bold: true, color: "#FFFFFF" }, verticalAlignment: "center", wrapText: true };
  sheet.getRange(`A2:${endColumn}2`).format.rowHeight = 28;
  if (definition.rows.length) {
    const endRow = definition.rows.length + 2;
    sheet.getRange(`A3:${endColumn}${endRow}`).values = definition.rows;
    sheet.getRange(`A3:${endColumn}${endRow}`).format.verticalAlignment = "top";
    sheet.getRange(`A3:${endColumn}${endRow}`).format.borders = { insideHorizontal: { style: "thin", color: colors.border } };
    for (let row = 3; row <= endRow; row += 2) sheet.getRange(`A${row}:${endColumn}${row}`).format.fill = colors.stripe;
    definition.headers.forEach((header, index) => {
      const column = columnName(index + 1);
      if (/At$|Verified|Last Candidate|Last Healthy/.test(header)) sheet.getRange(`${column}3:${column}${endRow}`).format.numberFormat = "yyyy-mm-dd hh:mm";
      if (["Description Snippet", "Experience Evidence", "Sponsorship Evidence", "Exclusion Reasons", "Diagnostic"].includes(header) || /URL$/.test(header)) sheet.getRange(`${column}3:${column}${endRow}`).format.wrapText = true;
    });
    const statusIndex = definition.headers.indexOf("Status");
    if (statusIndex >= 0) {
      const range = sheet.getRange(`${columnName(statusIndex + 1)}3:${columnName(statusIndex + 1)}${endRow}`);
      range.conditionalFormats.add("containsText", { text: "Healthy", format: { fill: colors.green, font: { bold: true } } });
      range.conditionalFormats.add("containsText", { text: "Confirmed Empty", format: { fill: colors.blue, font: { bold: true } } });
      range.conditionalFormats.add("containsText", { text: "Degraded", format: { fill: colors.amber, font: { bold: true } } });
      range.conditionalFormats.add("containsText", { text: "Broken", format: { fill: colors.red, font: { bold: true } } });
    }
    const decisionIndex = definition.headers.indexOf("Decision");
    if (decisionIndex >= 0) {
      const range = sheet.getRange(`${columnName(decisionIndex + 1)}3:${columnName(decisionIndex + 1)}${endRow}`);
      range.conditionalFormats.add("containsText", { text: "Included", format: { fill: colors.green } });
      range.conditionalFormats.add("containsText", { text: "Rejected", format: { fill: colors.red } });
      range.conditionalFormats.add("containsText", { text: "Pending", format: { fill: colors.amber } });
    }
    sheet.tables.add(`A2:${endColumn}${endRow}`, true, definition.table).style = "TableStyleMedium2";
  } else {
    sheet.mergeCells(`A3:${endColumn}3`);
    sheet.getRange(`A3:${endColumn}3`).values = [["No records yet"]];
    sheet.getRange(`A3:${endColumn}3`).format = { fill: "#F1F5F9", font: { italic: true, color: colors.gray }, horizontalAlignment: "center" };
  }
  definition.widths.forEach((width, index) => { sheet.getRange(`${columnName(index + 1)}:${columnName(index + 1)}`).format.columnWidth = width; });
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(2);
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(OUTPUT_FILE);

if (process.argv.includes("--verify")) {
  const checks = {};
  for (const definition of definitions) {
    const endColumn = columnName(definition.headers.length);
    const endRow = Math.max(3, Math.min(definition.rows.length + 2, 12));
    checks[definition.name] = (await workbook.inspect({ kind: "table", range: `'${definition.name}'!A1:${endColumn}${endRow}`, include: "values,formulas", tableMaxRows: 12, tableMaxCols: Math.min(25, definition.headers.length) })).ndjson;
    const preview = await workbook.render({ sheetName: definition.name, range: `A1:${endColumn}${endRow}`, scale: 1, format: "png" });
    await fs.writeFile(path.join(OUTPUT_DIR, `${definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`), new Uint8Array(await preview.arrayBuffer()));
  }
  checks.errors = (await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan" })).ndjson;
  console.log(JSON.stringify(checks, null, 2));
}
console.log(OUTPUT_FILE);
