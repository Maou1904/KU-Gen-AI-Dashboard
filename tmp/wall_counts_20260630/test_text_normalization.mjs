import fs from "node:fs/promises";

const text = await fs.readFile("C:/Users/atipo/Downloads/text.txt", "utf8");
for (const id of ["B208-1", "T-B201-1", "610-3", "3007-1"]) {
  const index = text.indexOf(id);
  const snippet = text.slice(index, index + 160).replace(/\r/g, "").split("\n").join(" ");
  console.log("RAW", id, snippet);
  console.log("NFC", id, snippet.normalize("NFC"));
  console.log("NFKC", id, snippet.normalize("NFKC"));
}
