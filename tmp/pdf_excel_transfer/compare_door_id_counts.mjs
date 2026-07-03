import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [textPath, workbookPath] = process.argv.slice(2);
if (!textPath || !workbookPath) {
  throw new Error("Usage: compare_door_id_counts.mjs <text.txt> <workbook.xlsx>");
}

const text = await fs.readFile(textPath, "utf8");
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const rows = workbook.worksheets.items[0].getUsedRange().values;

const workbookCounts = new Map();
for (let i = 1; i < rows.length; i += 1) {
  const doorId = String(rows[i]?.[2] ?? "").trim();
  if (!doorId) continue;
  workbookCounts.set(doorId, (workbookCounts.get(doorId) ?? 0) + 1);
}

const textCounts = new Map();
const matches = text.match(/^\s*((?:T-)?[A-Z0-9]+(?:-[A-Z0-9]+)+)\b/gm) ?? [];
for (const rawMatch of matches) {
  const match = rawMatch.trim();
  textCounts.set(match, (textCounts.get(match) ?? 0) + 1);
}

const allIds = new Set([...workbookCounts.keys(), ...textCounts.keys()]);
const diffs = [];

for (const id of allIds) {
  const workbookCount = workbookCounts.get(id) ?? 0;
  const textCount = textCounts.get(id) ?? 0;
  if (workbookCount !== textCount) {
    diffs.push({ id, workbookCount, textCount });
  }
}

diffs.sort((left, right) => left.id.localeCompare(right.id));

console.log(
  JSON.stringify(
    {
      workbookUniqueIds: workbookCounts.size,
      textUniqueIds: textCounts.size,
      diffCount: diffs.length,
      diffs,
    },
    null,
    2,
  ),
);
