import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, outputDir] = process.argv.slice(2);
if (!inputPath || !outputDir) {
  throw new Error("Usage: rebuild_jon_pratu_with_summaries.mjs <input.xlsx> <output-dir>");
}

await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));
const sheet = workbook.worksheets.getItem("จนประตู");
const used = sheet.getUsedRange();
const sourceRows = used.values.map((row) => [...row]);

const header = sourceRows[0].slice(0, 6);
const records = [];
let currentFloor = null;
let currentCode = null;

for (let i = 1; i < sourceRows.length; i += 1) {
  const row = sourceRows[i];
  const floorCell = row[0];
  const codeCell = row[1];
  const roomCell = row[2];
  const equipmentCell = row[3];
  const noteCell = row[5] ?? null;

  if (roomCell != null && String(roomCell).trim() !== "") {
    if (floorCell != null && String(floorCell).trim() !== "") {
      currentFloor = String(floorCell).trim();
    }
    if (codeCell != null && String(codeCell).trim() !== "") {
      currentCode = String(codeCell).trim();
    }

    records.push({
      floor: currentFloor,
      code: currentCode,
      room: String(roomCell).trim(),
      equipment: equipmentCell ?? null,
      note: noteCell,
    });
  }
}

const floorGroups = [];
const floorMap = new Map();

for (const record of records) {
  if (!floorMap.has(record.floor)) {
    const floorGroup = { floor: record.floor, codes: [], codeMap: new Map() };
    floorMap.set(record.floor, floorGroup);
    floorGroups.push(floorGroup);
  }

  const floorGroup = floorMap.get(record.floor);
  if (!floorGroup.codeMap.has(record.code)) {
    const codeGroup = { code: record.code, records: [] };
    floorGroup.codeMap.set(record.code, codeGroup);
    floorGroup.codes.push(codeGroup);
  }

  floorGroup.codeMap.get(record.code).records.push(record);
}

const outputRows = [header];
const codeSummaryRows = [];
const floorSummaryRows = [];
const floorTotals = [];

for (const floorGroup of floorGroups) {
  let floorTotal = 0;
  let firstDetailOfFloor = true;

  for (const codeGroup of floorGroup.codes) {
    for (let idx = 0; idx < codeGroup.records.length; idx += 1) {
      const record = codeGroup.records[idx];
      outputRows.push([
        firstDetailOfFloor ? floorGroup.floor : null,
        idx === 0 ? codeGroup.code : null,
        record.room,
        record.equipment,
        1,
        record.note ?? null,
      ]);
      firstDetailOfFloor = false;
      floorTotal += 1;
    }

    outputRows.push([null, null, null, "รวม", codeGroup.records.length, null]);
    codeSummaryRows.push(outputRows.length);
  }

  outputRows.push([null, null, null, "รวมชั้น", floorTotal, null]);
  floorSummaryRows.push(outputRows.length);
  floorTotals.push({ floor: floorGroup.floor, total: floorTotal });
}

const targetRange = sheet.getRange(`A1:F${Math.max(sourceRows.length, outputRows.length)}`);
targetRange.clear({ applyTo: "contents" });
sheet.getRange(`A1:F${outputRows.length}`).values = outputRows;

// Clear trailing leftover rows if the old sheet was longer than the rebuilt one.
if (sourceRows.length > outputRows.length) {
  sheet.getRange(`A${outputRows.length + 1}:F${sourceRows.length}`).clear({ applyTo: "contents" });
}

// Borders for the whole rebuilt table.
sheet.getRange(`A1:F${outputRows.length}`).format.borders = {
  preset: "all",
  style: "thin",
  color: "#000000",
};

// Number formatting and alignment.
sheet.getRange(`E2:E${outputRows.length}`).format.numberFormat = "0";
sheet.getRange(`E2:E${outputRows.length}`).format.horizontalAlignment = "Center";
sheet.getRange(`D2:D${outputRows.length}`).format.horizontalAlignment = "Center";

// Style summary rows.
for (const rowNumber of codeSummaryRows) {
  sheet.getRange(`D${rowNumber}:E${rowNumber}`).format = {
    fill: "#E2F0D9",
    font: { bold: true },
    horizontalAlignment: "Center",
  };
  sheet.getRange(`A${rowNumber}:F${rowNumber}`).format.borders = {
    top: { style: "thin", color: "#000000" },
    bottom: { style: "medium", color: "#000000" },
    left: { style: "thin", color: "#000000" },
    right: { style: "thin", color: "#000000" },
    insideVertical: { style: "thin", color: "#000000" },
  };
}

for (const rowNumber of floorSummaryRows) {
  sheet.getRange(`D${rowNumber}:E${rowNumber}`).format = {
    fill: "#C6E0B4",
    font: { bold: true },
    horizontalAlignment: "Center",
  };
  sheet.getRange(`A${rowNumber}:F${rowNumber}`).format.borders = {
    top: { style: "medium", color: "#000000" },
    bottom: { style: "medium", color: "#000000" },
    left: { style: "thin", color: "#000000" },
    right: { style: "thin", color: "#000000" },
    insideVertical: { style: "thin", color: "#000000" },
  };
}

const checkTop = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: "A1:F32",
  maxChars: 5000,
});
console.log("CHECK_TOP");
console.log(checkTop.ndjson);

const checkMiddle = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: "A200:F235",
  maxChars: 5000,
});
console.log("CHECK_MIDDLE");
console.log(checkMiddle.ndjson);

const checkBottom = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: `A${Math.max(2, outputRows.length - 25)}:F${outputRows.length}`,
  maxChars: 5000,
});
console.log("CHECK_BOTTOM");
console.log(checkBottom.ndjson);

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

const outputPath = path.join(outputDir, "ผนัง-จัดกลุ่มรวมโค้ดและชั้น.xlsx");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(
  JSON.stringify(
    {
      outputPath,
      rowCount: outputRows.length,
      floorTotals,
      grandTotal: floorTotals.reduce((sum, row) => sum + row.total, 0),
    },
    null,
    2,
  ),
);
