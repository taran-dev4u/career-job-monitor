import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { workbookSheets } from "./workbook_data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, "outputs", "job-monitor");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "Job_Monitor.xlsx");
const definitions = await workbookSheets(ROOT);
const workbook = new ExcelJS.Workbook();
workbook.creator = "Career Job Monitor";
workbook.created = new Date();
workbook.modified = new Date();
const colors = { title: "FF2563EB", header: "FF16324F", white: "FFFFFFFF", stripe: "FFEAF4FB", border: "FFCBD5E1", empty: "FFF1F5F9", green: "FFDCFCE7", red: "FFFEE2E2", amber: "FFFEF3C7", blue: "FFDBEAFE" };

for (const definition of definitions) {
  const sheet = workbook.addWorksheet(definition.name, { views: [{ state: "frozen", ySplit: 2, showGridLines: false }] });
  sheet.mergeCells(1, 1, 1, definition.headers.length);
  const title = sheet.getCell(1, 1);
  title.value = definition.title;
  title.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: colors.white } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.title } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;
  const headers = sheet.getRow(2);
  headers.values = definition.headers;
  headers.height = 28;
  headers.eachCell(cell => { cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: colors.white } }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.header } }; cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true }; });
  definition.widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  if (!definition.rows.length) {
    sheet.mergeCells(3, 1, 3, definition.headers.length);
    const empty = sheet.getCell(3, 1);
    empty.value = definition.name === "Source Health" ? "No company health data has been recorded yet" : "No records yet";
    empty.font = { name: "Aptos", italic: true, color: { argb: "FF64748B" } };
    empty.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.empty } };
    empty.alignment = { horizontal: "center" };
  } else {
    sheet.addTable({ name: definition.table, ref: "A2", headerRow: true, totalsRow: false, style: { theme: "TableStyleMedium2", showRowStripes: false }, columns: definition.headers.map(name => ({ name })), rows: definition.rows });
    definition.rows.forEach((values, index) => {
      const row = sheet.getRow(index + 3);
      row.alignment = { vertical: "top" };
      if ((row.number - 3) % 2 === 0) row.eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colors.stripe } }; });
      row.eachCell((cell, column) => {
        cell.font = { name: "Aptos", size: 10 };
        cell.border = { bottom: { style: "hair", color: { argb: colors.border } } };
        const header = definition.headers[column - 1];
        if (/At$|Verified|Last Candidate|Last Healthy/.test(header) && cell.value instanceof Date) cell.numFmt = "yyyy-mm-dd hh:mm";
        if (/URL$/.test(header) && typeof cell.value === "string" && /^https?:/.test(cell.value)) cell.value = { text: cell.value, hyperlink: cell.value, tooltip: cell.value };
        if (["Description Snippet", "Experience Evidence", "Sponsorship Evidence", "Exclusion Reasons", "Diagnostic"].includes(header) || /URL$/.test(header)) cell.alignment = { vertical: "top", wrapText: true };
      });
      const statusColumn = definition.headers.indexOf("Status") + 1;
      if (statusColumn) {
        const cell = row.getCell(statusColumn);
        const fill = cell.value === "Healthy" ? colors.green : cell.value === "Confirmed Empty" ? colors.blue : cell.value === "Degraded" ? colors.amber : cell.value === "Broken" ? colors.red : colors.empty;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
        cell.font = { name: "Aptos", size: 10, bold: true };
      }
      const decisionColumn = definition.headers.indexOf("Decision") + 1;
      if (decisionColumn) {
        const cell = row.getCell(decisionColumn);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cell.value === "Included" || cell.value === "Legacy Included" ? colors.green : cell.value === "Rejected" ? colors.red : colors.amber } };
      }
    });
  }
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: definition.headers.length } };
}

await fs.mkdir(OUTPUT_DIR, { recursive: true });
await workbook.xlsx.writeFile(OUTPUT_FILE);

if (process.argv.includes("--verify")) {
  const check = new ExcelJS.Workbook();
  await check.xlsx.readFile(OUTPUT_FILE);
  const expected = definitions.map(item => item.name);
  for (const definition of definitions) {
    const sheet = check.getWorksheet(definition.name);
    if (!sheet) throw new Error(`Missing worksheet: ${definition.name}`);
    if (definition.rows.length && sheet.rowCount !== definition.rows.length + 2) throw new Error(`${definition.name} row count mismatch: ${sheet.rowCount}`);
    const expectedLinks = definition.rows.reduce((count, row) => count + row.filter((value, index) => /URL$/.test(definition.headers[index]) && typeof value === "string" && /^https?:/.test(value)).length, 0);
    let actualLinks = 0;
    sheet.eachRow(row => row.eachCell(cell => { if (cell.hyperlink || cell.value?.hyperlink) actualLinks += 1; }));
    if (expectedLinks && actualLinks !== expectedLinks) throw new Error(`${definition.name} hyperlink count mismatch: ${actualLinks}/${expectedLinks}`);
    sheet.eachRow(row => row.eachCell(cell => { if (typeof cell.value === "string" && /#REF!|#DIV\/0!|#VALUE!|#NAME\?|#N\/A/.test(cell.value)) throw new Error(`Formula error text in ${definition.name}!${cell.address}`); }));
  }
  console.log(JSON.stringify({ workbook: OUTPUT_FILE, sheets: expected, rows: Object.fromEntries(definitions.map(item => [item.name, item.rows.length])) }));
}
console.log(OUTPUT_FILE);
