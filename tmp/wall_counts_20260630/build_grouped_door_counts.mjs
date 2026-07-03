import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [textPath, workbookPath, outputDir] = process.argv.slice(2);
if (!textPath || !workbookPath || !outputDir) {
  throw new Error("Usage: build_grouped_door_counts.mjs <text.txt> <input.xlsx> <output-dir>");
}

function normalizeFloorLabel(rawLine) {
  const compact = rawLine.replace(/\s+/g, "");
  if (!compact.startsWith("ระดับ")) return null;
  if (compact.includes("ดาดฟ")) return "ดาดฟ้า";

  const match = compact.match(/^ระดับชั้น([A-Z0-9]+(?:[AB])?)/i);
  if (match) {
    return match[1].toUpperCase();
  }

  return null;
}

function parseTextRecords(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let currentFloor = null;
  let current = null;

  const finalizeCurrent = () => {
    if (!current) return;

    const codeMatch = current.source.match(/\b((?:AD|D)[A-Za-z0-9.]*)\s+\d{3,4}x\d{3,4}\b/);
    const dimensionMatch = current.source.match(/\b\d{3,4}x\d{3,4}\b/);
    if (!dimensionMatch) {
      current = null;
      return;
    }

    records.push({
      floor: current.floor,
      doorId: current.doorId,
      doorCode: codeMatch?.[1] ?? null,
      source: current.source,
      count: 1,
    });
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const floor = normalizeFloorLabel(line);
    if (floor) {
      finalizeCurrent();
      currentFloor = floor;
      continue;
    }

    const recordMatch = line.match(/^((?:T-)?[A-Z0-9]+(?:-[A-Z0-9]+)+)\b/);
    if (recordMatch) {
      finalizeCurrent();
      current = {
        floor: currentFloor,
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
  const keyed = new Map();
  const noCode = new Map();

  for (const record of records) {
    if (record.doorCode) {
      const key = `${record.doorCode}||${record.doorId}`;
      if (!keyed.has(key)) keyed.set(key, []);
      keyed.get(key).push(record);
      continue;
    }

    if (!noCode.has(record.doorId)) noCode.set(record.doorId, []);
    noCode.get(record.doorId).push(record);
  }

  return { keyed, noCode };
}

function makeSummaryRows(floorTotals) {
  const rows = [["ชั้น", "จำนวนบานรวม"]];
  for (const row of floorTotals) {
    rows.push([row.floor, row.total]);
  }
  rows.push(["รวมทั้งหมด", floorTotals.reduce((sum, row) => sum + row.total, 0)]);
  return rows;
}

await fs.mkdir(outputDir, { recursive: true });

const text = await fs.readFile(textPath, "utf8");
const textRecords = parseTextRecords(text);
const { keyed, noCode } = buildQueueMap(textRecords);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const doorSheet = workbook.worksheets.getItem("จนประตู");
const usedRange = doorSheet.getUsedRange();
const values = usedRange.values.map((row) => [...row]);

let currentFloor = null;
let currentCode = null;
let groupStartIndex = null;
const floorTotalsMap = new Map();
const unmatchedRows = [];

for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
  const row = values[rowIndex];
  const floorCell = row[0];
  const codeCell = row[1];
  const doorIdCell = row[2];
  const markerCell = String(row[3] ?? "").trim();

  if (floorCell != null && floorCell !== "" && markerCell !== "รวม") {
    currentFloor = String(floorCell).trim();
  }

  if (codeCell != null && codeCell !== "") {
    currentCode = String(codeCell).trim();
    groupStartIndex = rowIndex;
  }

  if (doorIdCell != null && doorIdCell !== "") {
    const doorId = String(doorIdCell).trim();
    const queue = keyed.get(`${currentCode ?? ""}||${doorId}`) ?? [];
    const record = queue.shift() ?? (noCode.get(doorId)?.shift() ?? null);

    if (!record) {
      unmatchedRows.push({
        excelRow: rowIndex + 1,
        floor: currentFloor,
        doorCode: currentCode,
        doorId,
      });
      row[4] = null;
      continue;
    }

    row[4] = 1;
    floorTotalsMap.set(currentFloor, (floorTotalsMap.get(currentFloor) ?? 0) + 1);
    continue;
  }

  if (markerCell === "รวม") {
    if (groupStartIndex != null) {
      let total = 0;
      for (let scanIndex = groupStartIndex; scanIndex < rowIndex; scanIndex += 1) {
        total += Number(values[scanIndex]?.[4] ?? 0);
      }
      row[4] = total;
    }
  }
}

if (unmatchedRows.length > 0) {
  throw new Error(`Unable to match ${unmatchedRows.length} workbook rows: ${JSON.stringify(unmatchedRows.slice(0, 12))}`);
}

const unused = [];
for (const [key, queue] of keyed.entries()) {
  if (queue.length > 0) unused.push({ key, remaining: queue.length });
}
for (const [key, queue] of noCode.entries()) {
  if (queue.length > 0) unused.push({ key: `NO_CODE||${key}`, remaining: queue.length });
}
if (unused.length > 0) {
  throw new Error(`Unused text records remain: ${JSON.stringify(unused.slice(0, 12))}`);
}

usedRange.values = values;

doorSheet.getRange(`E2:E${values.length}`).format.numberFormat = "0";
doorSheet.getRange(`E2:E${values.length}`).format.horizontalAlignment = "Center";

const floorOrder = [];
for (const record of textRecords) {
  if (!record.floor) continue;
  if (!floorOrder.includes(record.floor)) floorOrder.push(record.floor);
}
const floorTotals = floorOrder
  .filter((floor) => floorTotalsMap.has(floor))
  .map((floor) => ({ floor, total: floorTotalsMap.get(floor) ?? 0 }));

let summarySheet = workbook.worksheets.items.find((sheet) => sheet.name === "สรุปบานประตู");
if (!summarySheet) {
  summarySheet = workbook.worksheets.add("สรุปบานประตู");
} else {
  summarySheet.getUsedRange()?.clear({ applyTo: "all" });
}

summarySheet.showGridLines = false;
summarySheet.getRange("A1:B1").merge();
summarySheet.getRange("A1").values = [["สรุปจำนวนบานประตู"]];
summarySheet.getRange("A1").format = {
  fill: "#1F4E78",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "Center",
  verticalAlignment: "Center",
};
summarySheet.getRange("A1:B1").format.rowHeight = 24;

const summaryRows = makeSummaryRows(floorTotals);
summarySheet.getRangeByIndexes(2, 0, summaryRows.length, 2).values = summaryRows;
summarySheet.getRange("A3:B3").format = {
  fill: "#4F81BD",
  font: { bold: true, color: "#FFFFFF" },
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

const topCheck = await workbook.inspect({
  kind: "region",
  sheetId: "จนประตู",
  range: "A1:F28",
  maxChars: 5000,
});
console.log("TOP_CHECK");
console.log(topCheck.ndjson);

const summaryCheck = await workbook.inspect({
  kind: "region",
  sheetId: "สรุปบานประตู",
  range: `A1:B${summaryRows.length + 2}`,
  maxChars: 5000,
});
console.log("SUMMARY_CHECK");
console.log(summaryCheck.ndjson);

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
  summary: "final formula error scan",
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

const workspaceOutput = path.join(outputDir, "ผนัง-จัดจำนวนประตูแล้ว.xlsx");
const exported = await SpreadsheetFile.exportXlsx(workbook);
await exported.save(workspaceOutput);

console.log(
  JSON.stringify(
    {
      workspaceOutput,
      textRecordCount: textRecords.length,
      floorTotals,
      grandTotal: floorTotals.reduce((sum, row) => sum + row.total, 0),
    },
    null,
    2,
  ),
);
