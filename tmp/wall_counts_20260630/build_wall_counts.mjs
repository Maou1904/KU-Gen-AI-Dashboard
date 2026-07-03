import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [textPath, workbookPath, outputDir] = process.argv.slice(2);
if (!textPath || !workbookPath || !outputDir) {
  throw new Error("Usage: build_wall_counts.mjs <text.txt> <input.xlsx> <output-dir>");
}

function detectLeafCountFromText(source, width) {
  const compact = source.replace(/\s+/g, "");

  if (/บานเปิดค/.test(compact) || /บานเลื.*ค/.test(compact)) {
    return 2;
  }

  if (/บานเปิดเด/.test(compact) || /บานเลื.*เด/.test(compact) || /บานม/.test(compact)) {
    return 1;
  }

  if (width == null) return null;
  return width >= 1500 ? 2 : 1;
}

function parseTextRecords(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let current = null;

  const finalizeCurrent = () => {
    if (!current) return;

    const codeMatch = current.source.match(/\b((?:AD|D)[A-Za-z0-9.]*)\s+(\d{3,4})x(\d{3,4})\b/);
    const dimensionMatch = current.source.match(/\b(\d{3,4})x(\d{3,4})\b/);
    if (!codeMatch && !dimensionMatch) {
      current = null;
      return;
    }

    const doorCode = codeMatch?.[1] ?? null;
    const width = Number((codeMatch ?? dimensionMatch)[codeMatch ? 2 : 1]);
    const height = Number((codeMatch ?? dimensionMatch)[codeMatch ? 3 : 2]);
    const leafCount = detectLeafCountFromText(current.source, width);

    records.push({
      doorId: current.doorId,
      doorCode,
      width,
      height,
      leafCount,
      source: current.source,
    });
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const recordMatch = line.match(/^((?:T-)?[A-Z0-9]+(?:-[A-Z0-9]+)+)\b/);
    if (recordMatch) {
      finalizeCurrent();
      current = {
        doorId: recordMatch[1],
        source: line,
      };
      continue;
    }

    if (current) {
      current.source += ` ${line}`;
    }
  }

  finalizeCurrent();

  return records;
}

function buildQueueMap(records) {
  const map = new Map();
  for (const record of records) {
    if (!record.doorCode) continue;
    const key = `${record.doorCode}||${record.doorId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(record);
  }
  return map;
}

function buildNoCodeQueueMap(records) {
  const map = new Map();
  for (const record of records) {
    if (record.doorCode) continue;
    if (!map.has(record.doorId)) map.set(record.doorId, []);
    map.get(record.doorId).push(record);
  }
  return map;
}

function makeSummaryRows(floorTotals) {
  const rows = [["ชั้น", "จำนวนบานรวม"]];
  for (const { floor, totalLeaves } of floorTotals) {
    rows.push([floor, totalLeaves]);
  }
  rows.push(["รวมทั้งหมด", floorTotals.reduce((sum, row) => sum + row.totalLeaves, 0)]);
  return rows;
}

await fs.mkdir(outputDir, { recursive: true });

const text = await fs.readFile(textPath, "utf8");
const textRecords = parseTextRecords(text);

const queueMap = buildQueueMap(textRecords);
const noCodeQueueMap = buildNoCodeQueueMap(textRecords);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const doorSheet = workbook.worksheets.getItem("จนประตู");
const used = doorSheet.getUsedRange();
const values = used.values.map((row) => [...row]);

let currentCode = null;
let currentFloor = null;
let groupStartRow = null;
const unmatchedRows = [];
const floorTotalsMap = new Map();
let filledDoorRows = 0;

for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
  const row = values[rowIndex];
  const floorCell = row[0];
  const codeCell = row[1];
  const doorIdCell = row[2];
  const markerCell = row[3];

  if (floorCell != null && floorCell !== "" && markerCell !== "รวม") {
    currentFloor = String(floorCell).trim();
  }

  if (codeCell != null && codeCell !== "") {
    currentCode = String(codeCell).trim();
    if (doorIdCell) {
      groupStartRow = rowIndex + 1;
    }
  }

  if (doorIdCell != null && doorIdCell !== "") {
    const doorId = String(doorIdCell).trim();
    const lookupKey = `${currentCode ?? ""}||${doorId}`;
    const queue = queueMap.get(lookupKey) ?? [];
    const record = queue.shift() ?? (noCodeQueueMap.get(doorId)?.shift() ?? null);

    if (!record) {
      unmatchedRows.push({ excelRow: rowIndex + 1, floor: currentFloor, doorCode: currentCode, doorId });
      row[4] = null;
      continue;
    }

    row[4] = record.leafCount;
    filledDoorRows += 1;
    floorTotalsMap.set(currentFloor, (floorTotalsMap.get(currentFloor) ?? 0) + Number(record.leafCount ?? 0));
    continue;
  }

  if (String(markerCell ?? "").trim() === "รวม") {
    if (groupStartRow != null && rowIndex >= groupStartRow) {
      let total = 0;
      for (let scanIndex = groupStartRow - 1; scanIndex < rowIndex; scanIndex += 1) {
        total += Number(values[scanIndex]?.[4] ?? 0);
      }
      row[4] = total;
    }
    groupStartRow = rowIndex + 2;
  }
}

if (unmatchedRows.length > 0) {
  throw new Error(`Unable to match ${unmatchedRows.length} workbook rows to text records: ${JSON.stringify(unmatchedRows.slice(0, 10))}`);
}

const unusedRecords = [];
for (const [key, queue] of queueMap.entries()) {
  if (queue.length === 0) continue;
  unusedRecords.push({ key, remaining: queue.length, sample: queue[0] });
}
for (const [key, queue] of noCodeQueueMap.entries()) {
  if (queue.length === 0) continue;
  unusedRecords.push({ key: `NO_CODE||${key}`, remaining: queue.length, sample: queue[0] });
}

if (unusedRecords.length > 0) {
  throw new Error(`Unused text records remain: ${JSON.stringify(unusedRecords.slice(0, 10))}`);
}

used.values = values;

doorSheet.getRange(`E2:E${values.length}`).format = {
  horizontalAlignment: "Center",
};
doorSheet.getRange(`E2:E${values.length}`).format.numberFormat = "0";

const floorTotals = [...floorTotalsMap.entries()].map(([floor, totalLeaves]) => ({
  floor,
  totalLeaves,
}));

const sortOrder = new Map(
  floorTotals.map((row, index) => [row.floor, index]),
);
floorTotals.sort((a, b) => (sortOrder.get(a.floor) ?? 0) - (sortOrder.get(b.floor) ?? 0));

let summarySheet = workbook.worksheets.items.find((sheet) => sheet.name === "สรุปบานประตู");
if (!summarySheet) {
  summarySheet = workbook.worksheets.add("สรุปบานประตู");
}

summarySheet.getUsedRange()?.clear({ applyTo: "all" });
summarySheet.showGridLines = false;

summarySheet.getRange("A1:B1").merge();
summarySheet.getRange("A1").values = [["สรุปจำนวนบานประตู"]];
summarySheet.getRange("A1").format = {
  font: { bold: true, color: "#FFFFFF" },
  fill: "#1F4E78",
  horizontalAlignment: "Center",
  verticalAlignment: "Center",
};
summarySheet.getRange("A1:B1").format.rowHeight = 26;

const summaryRows = makeSummaryRows(floorTotals);
summarySheet.getRangeByIndexes(2, 0, summaryRows.length, 2).values = summaryRows;
summarySheet.getRange("A3:B3").format = {
  font: { bold: true, color: "#FFFFFF" },
  fill: "#4F81BD",
  horizontalAlignment: "Center",
};
summarySheet.getRange(`A3:B${summaryRows.length + 2}`).format.borders = {
  preset: "all",
  style: "thin",
  color: "#D9E2F3",
};
summarySheet.getRange(`B4:B${summaryRows.length + 2}`).format.numberFormat = "0";
summarySheet.getRange(`A4:A${summaryRows.length + 2}`).format.horizontalAlignment = "Left";
summarySheet.getRange(`B4:B${summaryRows.length + 2}`).format.horizontalAlignment = "Right";
summarySheet.getRange("A:B").format.autofitColumns();
summarySheet.freezePanes.freezeRows(3);

const inspection = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: "A1:F35",
  maxChars: 5000,
});
console.log("DOOR_SHEET_CHECK");
console.log(inspection.ndjson);

const summaryInspection = await workbook.inspect({
  kind: "region",
  sheetId: "สรุปบานประตู",
  range: `A1:B${summaryRows.length + 2}`,
  maxChars: 5000,
});
console.log("SUMMARY_SHEET_CHECK");
console.log(summaryInspection.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "formula error scan",
  maxChars: 2000,
});
console.log("FORMULA_ERRORS");
console.log(formulaErrors.ndjson);

for (const sheet of workbook.worksheets.items) {
  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDir, `${sheet.name.replace(/[<>:"/\\|?*]/g, "_")}.png`),
    new Uint8Array(await preview.arrayBuffer()),
  );
}

const outputPath = path.join(outputDir, "ผนัง-นับบานประตูแล้ว.xlsx");
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(
  JSON.stringify(
    {
      outputPath,
      textRecordCount: textRecords.length,
      filledDoorRows,
      floorTotals,
    },
    null,
    2,
  ),
);
