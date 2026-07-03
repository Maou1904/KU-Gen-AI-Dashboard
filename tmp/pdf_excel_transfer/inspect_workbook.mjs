import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, previewDir] = process.argv.slice(2);
if (!inputPath || !previewDir) {
  throw new Error("Usage: inspect_workbook.mjs <input.xlsx> <preview-dir>");
}

await fs.mkdir(previewDir, { recursive: true });
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,drawing",
  maxChars: 12000,
  tableMaxRows: 20,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});
console.log("OVERVIEW");
console.log(overview.ndjson);

const sheets = workbook.worksheets.items;
for (let i = 0; i < sheets.length; i += 1) {
  const sheet = sheets[i];
  const used = sheet.getUsedRange();
  const address = used?.address ?? "A1";
  console.log(`SHEET ${i + 1}: ${sheet.name} USED ${address}`);

  const region = await workbook.inspect({
    kind: "region",
    sheetId: sheet.name,
    range: address,
    maxChars: 16000,
    tableMaxRows: 100,
    tableMaxCols: 30,
    tableMaxCellChars: 200,
  });
  console.log(region.ndjson);

  const formulas = await workbook.inspect({
    kind: "formula",
    sheetId: sheet.name,
    range: address,
    maxChars: 6000,
    options: { maxResults: 200 },
  });
  console.log("FORMULAS");
  console.log(formulas.ndjson);

  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  const safeName = `${String(i + 1).padStart(2, "0")}-${sheet.name.replace(/[<>:"/\\|?*]/g, "_")}.png`;
  await fs.writeFile(path.join(previewDir, safeName), new Uint8Array(await preview.arrayBuffer()));
}
