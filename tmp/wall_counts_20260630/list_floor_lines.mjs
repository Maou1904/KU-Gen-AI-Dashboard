import fs from "node:fs/promises";

const text = await fs.readFile("C:/Users/atipo/Downloads/text.txt", "utf8");
for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (trimmed.startsWith("ระดับ")) {
    console.log(trimmed);
  }
}
