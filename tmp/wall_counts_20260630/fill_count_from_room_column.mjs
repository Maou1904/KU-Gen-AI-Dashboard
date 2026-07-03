import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [workbookPath, outputDir] = process.argv.slice(2);
if (!workbookPath || !outputDir) {
  throw new Error("Usage: fill_count_from_room_column.mjs <input.xlsx> <output-dir>");
}

await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const doorSheet = workbook.worksheets.getItem("จนประตู");
const usedRange = doorSheet.getUsedRange();
const values = usedRange.values.map((row) => [...row]);

let currentFloor = null;
let currentGroupStart = null;
const floorTotals = new Map();

for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
  const row = values[rowIndex];
  const floorCell = row[0];
  const codeCell = row[1];
  const roomCell = row[2];
  const markerCell = String(row[3] ?? "").trim();

  if (floorCell != null && floorCell !== "" && markerCell !== "รวม") {
    currentFloor = String(floorCell).trim();
  }

  if (codeCell != null && codeCell !== "") {
    currentGroupStart = rowIndex;
  }

  if (roomCell != null && String(roomCell).trim() !== "") {
    row[4] = 1;
    if (currentFloor) {
      floorTotals.set(currentFloor, (floorTotals.get(currentFloor) ?? 0) + 1);
    }
    continue;
  }

  if (markerCell === "รวม") {
    let total = 0;
    if (currentGroupStart != null) {
      for (let scanIndex = currentGroupStart; scanIndex < rowIndex; scanIndex += 1) {
        total += Number(values[scanIndex]?.[4] ?? 0);
      }
    }
    row[4] = total > 0 ? total : null;
    continue;
  }

  row[4] = null;
}

usedRange.values = values;
doorSheet.getRange(`E2:E${values.length}`).format.numberFormat = "0";
doorSheet.getRange(`E2:E${values.length}`).format.horizontalAlignment = "Center";

const topCheck = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: "A1:F35",
  maxChars: 5000,
});
console.log("TOP_CHECK");
console.log(topCheck.ndjson);

const midCheck = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: "A206:F223",
  maxChars: 5000,
});
console.log("MID_CHECK");
console.log(midCheck.ndjson);

const lateCheck = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: "A472:F493",
  maxChars: 5000,
});
console.log("LATE_CHECK");
console.log(lateCheck.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
  maxChars: 2000,
});
console.log("FORMULA_ERRORS");
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "จนประตู",
  autoCrop: "all",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "จนประตู.png"),
  new Uint8Array(await preview.arrayBuffer()),
);

const outputPath = path.join(outputDir, "ผนัง-อัปเดตจำนวนบานตามห้อง.xlsx");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(
  JSON.stringify(
    {
      outputPath,
      floorTotals: [...floorTotals.entries()].map(([floor, total]) => ({ floor, total })),
      grandTotal: [...floorTotals.values()].reduce((sum, value) => sum + value, 0),
    },
    null,
    2,
  ),
);
