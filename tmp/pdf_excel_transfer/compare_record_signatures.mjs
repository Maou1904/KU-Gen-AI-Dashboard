import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [textPath, workbookPath] = process.argv.slice(2);
if (!textPath || !workbookPath) {
  throw new Error("Usage: compare_record_signatures.mjs <text.txt> <workbook.xlsx>");
}

const DOOR_START_RE = /^\s*((?:T-)?[A-Z0-9]+(?:-[A-Z0-9]+)+)\b/;
const FLOOR_RE = /^\s*ระดับชั/;

function normalizeRecordSignature(doorId, doorCode, equipment) {
  return `${doorId}||${doorCode ?? ""}||${equipment ?? ""}`;
}

function parseTextRecords(text) {
  const lines = text.split(/\r?\n/);
  const records = [];
  let current = null;

  for (const line of lines) {
    if (FLOOR_RE.test(line)) {
      if (current) {
        records.push(current);
        current = null;
      }
      continue;
    }

    const startMatch = line.match(DOOR_START_RE);
    if (startMatch) {
      if (current) records.push(current);
      current = {
        doorId: startMatch[1],
        text: line.trim(),
      };
      continue;
    }

    if (current && line.trim()) {
      current.text += ` ${line.trim()}`;
    }
  }

  if (current) records.push(current);

  return records.map((record) => {
    const doorCodeMatch = record.text.match(/-?((?:AD|D)[A-Za-z0-9.]*)\b/);
    const doorCode = doorCodeMatch?.[1] ?? null;
    const equipmentMatch = record.text.match(/-(\d+)\s*$/);
    const equipment = equipmentMatch ? Number(equipmentMatch[1]) : null;
    return {
      doorId: record.doorId,
      doorCode,
      equipment,
      source: record.text,
    };
  });
}

function parseWorkbookRecords(rows) {
  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const doorId = String(row?.[2] ?? "").trim();
    if (!doorId) continue;
    records.push({
      doorId,
      doorCode: row?.[1] == null ? null : String(row[1]).trim(),
      equipment: row?.[3] == null || row?.[3] === "" ? null : Number(row[3]),
      source: row,
    });
  }
  return records;
}

function countSignatures(records) {
  const counts = new Map();
  for (const record of records) {
    const signature = normalizeRecordSignature(record.doorId, record.doorCode, record.equipment);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return counts;
}

const text = await fs.readFile(textPath, "utf8");
const textRecords = parseTextRecords(text);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const rows = workbook.worksheets.items[0].getUsedRange().values;
const workbookRecords = parseWorkbookRecords(rows);

const textCounts = countSignatures(textRecords);
const workbookCounts = countSignatures(workbookRecords);

const allSignatures = new Set([...textCounts.keys(), ...workbookCounts.keys()]);
const diffs = [];

for (const signature of allSignatures) {
  const textCount = textCounts.get(signature) ?? 0;
  const workbookCount = workbookCounts.get(signature) ?? 0;
  if (textCount !== workbookCount) {
    const [doorId, doorCode, equipment] = signature.split("||");
    diffs.push({
      doorId,
      doorCode,
      equipment: equipment === "" ? null : Number(equipment),
      textCount,
      workbookCount,
      textSamples: textRecords.filter((record) => normalizeRecordSignature(record.doorId, record.doorCode, record.equipment) === signature).slice(0, 2),
      workbookSamples: workbookRecords.filter((record) => normalizeRecordSignature(record.doorId, record.doorCode, record.equipment) === signature).slice(0, 2),
    });
  }
}

console.log(JSON.stringify({
  textRecordCount: textRecords.length,
  workbookRecordCount: workbookRecords.length,
  diffCount: diffs.length,
  diffs,
}, null, 2));
