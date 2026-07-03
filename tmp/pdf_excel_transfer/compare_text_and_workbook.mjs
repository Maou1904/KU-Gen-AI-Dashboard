import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const FLOOR_MARKER = "ระดับชั";
const DOOR_ID_RE = /^\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)\b/;
const FLOOR_RE = /^ระดับชั.*?\s+([A-Z0-9ก-๙]+)\s*$/u;

function normalizeFloor(raw) {
  const cleaned = raw.replace(/\s+/g, "");
  if (cleaned.includes("ดาดฟ")) return "ดาดฟ้า";
  return cleaned;
}

function parseTextRecords(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let currentFloor = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith(FLOOR_MARKER)) {
      const match = rawLine.match(FLOOR_RE);
      if (match) {
        currentFloor = normalizeFloor(match[1]);
      }
      continue;
    }

    const doorMatch = line.match(DOOR_ID_RE);
    if (!currentFloor || !doorMatch) continue;

    const tokens = line.split(/\s+/);
    const doorId = doorMatch[1];
    const afterDoor = tokens.slice(1);
    const codeIndex = afterDoor.findIndex((token) => /^(?:AD|D)[A-Za-z0-9.]*$/.test(token));
    if (codeIndex < 0) continue;
    const doorCode = afterDoor[codeIndex];
    const equipmentMatch = [...line.matchAll(/-(\d+)(?:\s|$)/g)].at(-1);
    const equipment = equipmentMatch ? Number(equipmentMatch[1]) : null;

    records.push({
      floor: currentFloor,
      doorId,
      doorCode,
      equipment,
    });
  }

  return records;
}

function parseWorkbookRecords(values) {
  const records = [];
  let currentFloor = null;

  for (const row of values.slice(1)) {
    const [floorCell, doorCode, doorId, equipment] = row;
    if (floorCell) currentFloor = String(floorCell);
    if (!currentFloor || !doorId) continue;
    if (!doorCode && equipment == null) continue;

    records.push({
      floor: currentFloor,
      doorId: String(doorId),
      doorCode: doorCode == null ? null : String(doorCode),
      equipment: equipment == null ? null : Number(equipment),
    });
  }

  return records;
}

function keyFor(record) {
  return `${record.floor}||${record.doorId}||${record.doorCode ?? ""}||${record.equipment ?? ""}`;
}

function doorKey(record) {
  return `${record.floor}||${record.doorId}`;
}

async function main() {
  const [textPath, workbookPath] = process.argv.slice(2);
  if (!textPath || !workbookPath) {
    throw new Error("Usage: compare_text_and_workbook.mjs <text.txt> <workbook.xlsx>");
  }

  const text = await fs.readFile(textPath, "utf8");
  const textRecords = parseTextRecords(text);

  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
  const sheet = workbook.worksheets.items[0];
  const used = sheet.getUsedRange();
  const values = used.values;
  const workbookRecords = parseWorkbookRecords(values);

  const textByFull = new Set(textRecords.map(keyFor));
  const workbookByFull = new Set(workbookRecords.map(keyFor));

  const missingInWorkbook = textRecords.filter((record) => !workbookByFull.has(keyFor(record)));
  const extraInWorkbook = workbookRecords.filter((record) => !textByFull.has(keyFor(record)));

  const textDoorMap = new Map(textRecords.map((record) => [doorKey(record), record]));
  const workbookDoorMap = new Map(workbookRecords.map((record) => [doorKey(record), record]));

  const mismatches = [];
  for (const [door, textRecord] of textDoorMap.entries()) {
    const workbookRecord = workbookDoorMap.get(door);
    if (!workbookRecord) continue;
    if (
      textRecord.doorCode !== workbookRecord.doorCode ||
      textRecord.equipment !== workbookRecord.equipment
    ) {
      mismatches.push({
        door,
        text: textRecord,
        workbook: workbookRecord,
      });
    }
  }

  const summary = {
    textRecordCount: textRecords.length,
    workbookRecordCount: workbookRecords.length,
    missingInWorkbookCount: missingInWorkbook.length,
    extraInWorkbookCount: extraInWorkbook.length,
    mismatchCount: mismatches.length,
    missingInWorkbook: missingInWorkbook.slice(0, 80),
    extraInWorkbook: extraInWorkbook.slice(0, 80),
    mismatches: mismatches.slice(0, 80),
  };

  console.log(JSON.stringify(summary, null, 2));
}

await main();
