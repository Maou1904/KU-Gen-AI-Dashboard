import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath] = process.argv.slice(2);
if (!inputPath) {
  throw new Error("Usage: analyze_door_count_patterns.mjs <input.xlsx>");
}

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const rows = workbook.worksheets.getItem("จนประตู").getUsedRange().values;

const patterns = new Map();

for (let i = 1; i < rows.length; i += 1) {
  const [, code, doorId, , leafCount] = rows[i];
  if (!doorId || leafCount == null || leafCount === "") continue;
  const key = String(code ?? "");
  const count = Number(leafCount);
  if (!patterns.has(key)) patterns.set(key, new Set());
  patterns.get(key).add(count);
}

for (const [code, counts] of [...patterns.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  console.log(JSON.stringify({ code, counts: [...counts].sort((a, b) => a - b) }));
}
