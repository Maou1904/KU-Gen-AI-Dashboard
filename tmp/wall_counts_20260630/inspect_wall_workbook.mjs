import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, outputDir] = process.argv.slice(2);
if (!inputPath || !outputDir) {
  throw new Error("Usage: inspect_wall_workbook.mjs <input.xlsx> <output-dir>");
}

await fs.mkdir(outputDir, { recursive: true });

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,drawing",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 12,
  tableMaxCellChars: 120,
});

console.log("OVERVIEW");
console.log(overview.ndjson);

for (const sheet of workbook.worksheets.items) {
  const used = sheet.getUsedRange();
  const address = used?.address ?? "A1";
  console.log(`SHEET ${sheet.name} USED ${address}`);

  const region = await workbook.inspect({
    kind: "region",
    sheetId: sheet.name,
    range: address,
    maxChars: 12000,
    tableMaxRows: 60,
    tableMaxCols: 16,
    tableMaxCellChars: 120,
  });
  console.log(region.ndjson);

  const render = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });

  const safeName = sheet.name.replace(/[<>:"/\\|?*]/g, "_");
  await fs.writeFile(
    path.join(outputDir, `${safeName}.png`),
    new Uint8Array(await render.arrayBuffer()),
  );
}
