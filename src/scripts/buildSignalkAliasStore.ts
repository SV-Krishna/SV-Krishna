import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SOURCE_URL = "https://signalk.org/specification/1.5.0/doc/vesselsBranch.html";
const OUTPUT_PATH = process.argv[2] || `${process.cwd()}/local/svkrishna/config/signalk-alias-store.json`;

const splitWords = (value: string): string[] =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_./-]+/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);

const addRelation = (map: Map<string, Map<string, number>>, a: string, b: string): void => {
  if (!a || !b || a === b) {
    return;
  }
  if (!map.has(a)) {
    map.set(a, new Map<string, number>());
  }
  const nested = map.get(a)!;
  nested.set(b, (nested.get(b) ?? 0) + 1);
};

const main = async (): Promise<void> => {
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${response.status}`);
  }
  const html = await response.text();

  const pathMatches = html.match(/[a-z]+(?:\.[A-Za-z][A-Za-z0-9]+){2,}/g) ?? [];
  const relations = new Map<string, Map<string, number>>();

  for (const path of pathMatches) {
    const tokens = [...new Set(splitWords(path))];
    for (const token of tokens) {
      for (const related of tokens) {
        addRelation(relations, token, related);
      }
    }
  }

  const curated: Record<string, string[]> = {
    battery: ["batteries", "house", "domestic", "voltage", "current"],
    voltage: ["volt", "battery", "batteries", "electrical"],
    temperature: ["temp", "inside", "outside", "cabin", "engine"],
    wind: ["true", "apparent", "gust", "angle", "direction", "speed"],
    speed: ["sog", "stw", "velocity"],
    depth: ["below", "keel", "transducer", "sounder"],
    heading: ["course", "cog", "bearing"],
  };

  for (const [key, values] of Object.entries(curated)) {
    for (const value of values) {
      addRelation(relations, key, value);
      addRelation(relations, value, key);
    }
  }

  const aliases: Record<string, string[]> = {};
  for (const [key, related] of relations.entries()) {
    const sorted = [...related.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token)
      .filter((token) => token !== key)
      .slice(0, 16);
    if (sorted.length > 0) {
      aliases[key] = sorted;
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceUrl: SOURCE_URL,
    pathCount: pathMatches.length,
    aliases,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${OUTPUT_PATH} with ${Object.keys(aliases).length} alias keys.\n`);
};

void main();
