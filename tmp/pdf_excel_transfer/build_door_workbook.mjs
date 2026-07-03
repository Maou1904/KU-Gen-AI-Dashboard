import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const FLOOR_MARKER = "\u0e23\u0e30\u0e14\u0e31\u0e1a\u0e0a\u0e31\u0e49\u0e19";
const ROOF_PREFIX = "\u0e14\u0e32\u0e14\u0e1f";
const ROOF_LABEL = "\u0e14\u0e32\u0e14\u0e1f\u0e49\u0e32";

const DOOR_ID_RE = /^\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)\b/;
const SIZE_RE = /\b\d{3,4}x\d{3,4}\b/;
const DOOR_CODE_RE = /^(?:AD|D)[A-Za-z0-9.]*$/;
const CODE_SORT_RE = /^(AD|D)(\d+)([A-Z]?)(?:\.(\d+))?(?:f(\d+))?$/;
const CODE_FALLBACK_RE = /^(AD|D)(\d+)(.*)$/;

function naturalTokenize(value) {
  return String(value)
    .match(/\d+|\D+/g)
    .map((part) => (/\d/.test(part) ? Number(part) : part));
}

function compareNatural(a, b) {
  const left = naturalTokenize(a);
  const right = naturalTokenize(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    if (typeof left[index] === "number" && typeof right[index] === "number") {
      return left[index] - right[index];
    }
    return String(left[index]).localeCompare(String(right[index]));
  }
  return 0;
}

function buildCodeSortKey(code) {
  if (!code) {
    return [9, 999, "", 9, 999, 9, 999, ""];
  }

  const normalized = code;
  const detailed = normalized.match(CODE_SORT_RE);
  if (detailed) {
    const [, prefix, numberPart, letterPart = "", dotPart, firePart] = detailed;
    return [
      prefix === "D" ? 0 : 1,
      Number(numberPart),
      letterPart,
      dotPart === undefined ? 0 : 1,
      Number(dotPart ?? 0),
      firePart === undefined ? 0 : 1,
      Number(firePart ?? 0),
      normalized,
    ];
  }

  const fallback = normalized.match(CODE_FALLBACK_RE);
  if (fallback) {
    const [, prefix, numberPart, suffix] = fallback;
    return [prefix === "D" ? 0 : 1, Number(numberPart), suffix, 9, 999, 9, 999, normalized];
  }

  return [8, 999, normalized, 9, 999, 9, 999, normalized];
}

function compareCodeKeys(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === b) continue;
    if (typeof a === "number" && typeof b === "number") {
      return a - b;
    }
    return String(a).localeCompare(String(b));
  }
  return 0;
}

function parseDoorRows(pdfText) {
  const lines = pdfText.split(/\r?\n/);
  const floorOrder = [];
  const records = [];
  let currentFloor = null;
  let recordIndex = 0;

  for (const rawLine of lines) {
    if (rawLine.includes(FLOOR_MARKER)) {
      const tail = rawLine.split(FLOOR_MARKER)[1]?.trim() ?? "";
      if (tail.startsWith(ROOF_PREFIX)) {
        currentFloor = ROOF_LABEL;
      } else if (tail) {
        currentFloor = tail.split(/\s+/)[0];
      }
      if (currentFloor && !floorOrder.includes(currentFloor)) {
        floorOrder.push(currentFloor);
      }
      continue;
    }

    const doorIdMatch = rawLine.match(DOOR_ID_RE);
    if (!currentFloor || !doorIdMatch) {
      continue;
    }

    const rawWindow = rawLine.slice(0, 800);
    const sizeMatch = rawWindow.match(SIZE_RE);
    if (!sizeMatch || sizeMatch.index === undefined) {
      continue;
    }

    const afterSize = rawWindow.slice(sizeMatch.index + sizeMatch[0].length);
    const marginMatch = afterSize.match(/\s{80,}\S/);
    const tableLine = marginMatch
      ? rawWindow.slice(0, sizeMatch.index + sizeMatch[0].length + marginMatch.index)
      : rawWindow;

    const doorId = doorIdMatch[1];
    const leftSide = tableLine.slice(0, sizeMatch.index).trimEnd();
    const tokens = leftSide.trim().split(/\s+/).filter(Boolean);
    const maybeCode = tokens.length >= 2 ? tokens[tokens.length - 1] : "";
    const doorCode = DOOR_CODE_RE.test(maybeCode) ? maybeCode : "";
    const trailingNumberTokens = tableLine
      .slice(sizeMatch.index + sizeMatch[0].length)
      .match(/\b\d+\b/g);
    const equipment = trailingNumberTokens?.at(-1) ?? "";

    records.push({
      floor: currentFloor,
      doorId,
      doorCode,
      equipment,
      originalIndex: recordIndex,
    });
    recordIndex += 1;
  }

  return { floorOrder, records };
}

function buildOutputRows(floorOrder, records) {
  const byFloor = new Map();
  for (const floor of floorOrder) {
    byFloor.set(floor, []);
  }
  for (const record of records) {
    if (!byFloor.has(record.floor)) {
      byFloor.set(record.floor, []);
      floorOrder.push(record.floor);
    }
    byFloor.get(record.floor).push(record);
  }

  const outputRows = [];
  for (const floor of floorOrder) {
    const sorted = [...(byFloor.get(floor) ?? [])].sort((left, right) => {
      const codeCompare = compareCodeKeys(buildCodeSortKey(left.doorCode), buildCodeSortKey(right.doorCode));
      if (codeCompare !== 0) return codeCompare;

      const doorIdCompare = compareNatural(left.doorId, right.doorId);
      if (doorIdCompare !== 0) return doorIdCompare;

      return left.originalIndex - right.originalIndex;
    });

    let firstDataRow = true;
    let previousCode = null;
    for (const item of sorted) {
      if (!firstDataRow && item.doorCode !== previousCode) {
        outputRows.push({ kind: "blank" });
      }

      outputRows.push({
        kind: "data",
        values: [
          firstDataRow ? floor : null,
          item.doorCode || null,
          item.doorId,
          item.equipment ? Number(item.equipment) : null,
          null,
          null,
          null,
          null,
          null,
        ],
      });

      firstDataRow = false;
      previousCode = item.doorCode;
    }

    outputRows.push({ kind: "separator" });
  }

  return outputRows;
}

async function main() {
  const [xlsxPath, pdfTextPath, outputPath] = process.argv.slice(2);
  if (!xlsxPath || !pdfTextPath || !outputPath) {
    throw new Error("Usage: build_door_workbook.mjs <input.xlsx> <pdf_text.txt> <output.xlsx>");
  }

  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(xlsxPath));
  const sheet = workbook.worksheets.items[0];
  const pdfText = await fs.readFile(pdfTextPath, "utf8");

  const { floorOrder, records } = parseDoorRows(pdfText);
  const outputRows = buildOutputRows(floorOrder, records);

  const dataTemplate = sheet.getRange("A2:I2");
  const blankTemplate = sheet.getRange("A5:I5");
  const separatorTemplate = sheet.getRange("A25:I25");

  sheet.getRange("A2:I1200").clear({ applyTo: "contents" });

  let rowNumber = 2;
  for (const row of outputRows) {
    const destination = sheet.getRange(`A${rowNumber}:I${rowNumber}`);
    if (row.kind === "data") {
      destination.copyFrom(dataTemplate, "formats");
      destination.writeValues([row.values]);
    } else if (row.kind === "blank") {
      destination.copyFrom(blankTemplate, "formats");
      destination.writeValues([[null, null, null, null, null, null, null, null, null]]);
    } else {
      destination.copyFrom(separatorTemplate, "formats");
      destination.writeValues([[null, null, null, null, null, null, null, null, null]]);
    }
    rowNumber += 1;
  }

  const clearStart = rowNumber;
  if (clearStart <= 1200) {
    sheet.getRange(`A${clearStart}:I1200`).clear({ applyTo: "contents" });
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const exported = await workbook.export({ format: "xlsx" });
  await fs.writeFile(outputPath, new Uint8Array(await exported.arrayBuffer()));

  const summary = {
    floors: floorOrder,
    recordCount: records.length,
    outputRowCount: outputRows.length + 1,
    outputPath,
  };
  console.log(JSON.stringify(summary, null, 2));
}

await main();
