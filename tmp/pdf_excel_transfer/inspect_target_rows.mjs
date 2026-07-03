import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [workbookPath, ...doorIds] = process.argv.slice(2);
if (!workbookPath || doorIds.length === 0) {
  throw new Error("Usage: inspect_target_rows.mjs <workbook.xlsx> <doorId...>");
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const rows = workbook.worksheets.items[0].getUsedRange().values;
const targets = new Set(doorIds);

for (let i = 0; i < rows.length; i += 1) {
  const row = rows[i];
  const doorId = String(row?.[2] ?? "").trim();
  if (targets.has(doorId)) {
    console.log(JSON.stringify({ excelRow: i + 1, values: row }));
  }
}
