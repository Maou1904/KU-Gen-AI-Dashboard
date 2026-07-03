import fs from "node:fs/promises";

const text = await fs.readFile("C:/Users/atipo/Downloads/text.txt", "utf8");
const samples = ["B208-1", "T-B201-1", "610-3", "3007-1"];

for (const id of samples) {
  const index = text.indexOf(id);
  const snippet = text.slice(index, index + 140).replace(/\s+/g, "");
  console.log(id, {
    hasOpenDouble: snippet.includes("บานเปิดค"),
    hasOpenSingle: snippet.includes("บานเปิดเด"),
    hasSlideSingle: snippet.includes("บานเลื่") && snippet.includes("เด"),
    hasSlideDouble: snippet.includes("บานเลื่") && snippet.includes("ค"),
    hasRolling: snippet.includes("บานม"),
    snippet,
  });
}
