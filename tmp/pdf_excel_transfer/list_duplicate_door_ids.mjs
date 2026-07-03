import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [workbookPath] = process.argv.slice(2);
if (!workbookPath) {
  throw new Error("Usage: list_duplicate_door_ids.mjs <workbook.xlsx>");
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const rows = workbook.worksheets.items[0].getUsedRange().values;
const counts = new Map();

for (let i = 1; i < rows.length; i += 1) {
  const doorId = String(rows[i]?.[2] ?? "").trim();
  if (!doorId) continue;
  counts.set(doorId, (counts.get(doorId) ?? 0) + 1);
}

const duplicates = [...counts.entries()]
  .filter(([, count]) => count > 1)
  .sort((left, right) => left[0].localeCompare(right[0]));

for (const [doorId, count] of duplicates) {
  console.log(JSON.stringify({ doorId, count }));
}
