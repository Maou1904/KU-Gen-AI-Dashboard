import { Workbook } from "@oai/artifact-tool";

const workbook = Workbook.create();
console.log(workbook.help("worksheet.delete", { include: "index,examples,notes", maxChars: 2000 }).ndjson);
