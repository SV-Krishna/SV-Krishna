import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { AppConfig, PreflightCheck, RagChunk, RagSearchResult } from "../types";

interface RagDocumentRecord {
  fileName: string;
  mtimeMs: number;
  size: number;
  chunkIds: string[];
}

interface RagStoreFile {
  indexedAt: string;
  documents: RagDocumentRecord[];
  chunks: RagChunk[];
}

interface ExtractionPayload {
  text?: string;
  pages?: Array<{
    page?: number;
    text?: string;
  }>;
  sections?: Array<{
    heading?: string;
    sectionPath?: string[];
    text?: string;
    pageStart?: number;
    pageEnd?: number;
  }>;
  error?: string;
}

const TOKEN_PATTERN = /[a-z0-9]{2,}/g;
const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "what",
  "where",
  "when",
  "how",
  "why",
  "are",
  "is",
  "near",
  "into",
  "your",
  "you",
  "use",
  "using",
  "about",
  "have",
  "has",
  "had",
  "was",
  "were",
  "will",
  "would",
  "could",
  "should",
  "can",
  "tell",
  "me",
]);

const normalizeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const inferDocumentKey = (source: string): string => {
  const normalized = normalizeKey(source);
  if (normalized.includes("bukh")) {
    return "bukh";
  }
  if (normalized.includes("clipper duet") || normalized.includes("clipper")) {
    return "clipper";
  }
  if (normalized.includes("test manual")) {
    return "test-manual";
  }

  return normalized.split(" ").slice(0, 3).join("-");
};

export const getDocumentHints = (query: string): string[] => {
  const normalized = normalizeKey(query);
  const hints: string[] = [];
  if (normalized.includes("bukh")) {
    hints.push("bukh");
  }
  if (normalized.includes("clipper duet") || normalized.includes("clipper")) {
    hints.push("clipper");
  }

  return hints;
};

export const tokenize = (text: string): string[] => {
  const matches = text.toLowerCase().match(TOKEN_PATTERN) ?? [];
  return matches.filter((token) => !STOP_WORDS.has(token));
};

export const splitIntoChunks = (
  text: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  const safeChunkSize = Math.max(1, chunkSize);
  const safeOverlap = Math.max(0, Math.min(chunkOverlap, safeChunkSize - 1));
  const step = Math.max(1, safeChunkSize - safeOverlap);
  const chunks: string[] = [];

  for (let start = 0; start < words.length; start += step) {
    const chunk = words.slice(start, start + safeChunkSize).join(" ").trim();
    if (!chunk) {
      continue;
    }

    chunks.push(chunk);
    if (start + safeChunkSize >= words.length) {
      break;
    }
  }

  return chunks;
};

export const rankChunks = (
  chunks: RagChunk[],
  query: string,
  topK: number,
): RagSearchResult[] => {
  const queryTokens = tokenize(query);
  const queryTerms = new Set(queryTokens);
  if (queryTerms.size === 0) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().replace(/\s+/g, " ").trim();
  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  const documentHints = new Set(getDocumentHints(query));
  const seen = new Set<string>();

  return chunks
    .map((chunk) => {
      const excerpt = narrowExcerpt(chunk.text, queryTerms);
      const uniqueChunkTerms = new Set(chunk.tokens);
      const uniqueMatches = [...uniqueChunkTerms].filter((token) => queryTerms.has(token));
      const totalMatches = chunk.tokens.filter((token) => queryTerms.has(token)).length;
      let score = uniqueMatches.length * 5 + totalMatches;

      const normalizedChunk = excerpt.toLowerCase().replace(/\s+/g, " ").trim();
      if (normalizedQuery.length > 8 && normalizedChunk.includes(normalizedQuery)) {
        score += 30;
      }

      if (queryWords.length >= 2) {
        for (let index = 0; index < queryWords.length - 1; index += 1) {
          const phrase = `${queryWords[index]} ${queryWords[index + 1]}`;
          if (normalizedChunk.includes(phrase)) {
            score += 4;
          }
        }
      }

      if (chunk.heading) {
        const normalizedHeading = normalizeKey(chunk.heading);
        for (const word of queryWords) {
          if (word.length > 3 && normalizedHeading.includes(word)) {
            score += 3;
          }
        }
      }

      if (documentHints.size > 0 && documentHints.has(chunk.docKey)) {
        score += 40;
      }

      return {
        docKey: chunk.docKey,
        source: chunk.source,
        text: excerpt,
        score,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        heading: chunk.heading,
        sectionPath: chunk.sectionPath,
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .filter((result) => {
      const signature = [
        result.source,
        result.pageStart,
        result.pageEnd,
        result.text.slice(0, 160).toLowerCase(),
      ].join("|");
      if (seen.has(signature)) {
        return false;
      }

      seen.add(signature);
      return true;
    })
    .slice(0, Math.max(1, topK));
};

export const hasTrustedSources = (sources: RagSearchResult[]): boolean => {
  if (sources.length === 0) {
    return false;
  }

  const topScore = sources[0]?.score ?? 0;
  if (topScore < 8) {
    return false;
  }

  return true;
};

const detectHeading = (text: string): string | undefined => {
  const firstSentence = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .find(Boolean);

  if (!firstSentence) {
    return undefined;
  }

  const compact = firstSentence.replace(/\s+/g, " ").trim();
  return compact.length > 90 ? `${compact.slice(0, 87).trimEnd()}...` : compact;
};

const classifySection = (heading: string | undefined, text: string): string[] => {
  const normalized = normalizeKey(`${heading ?? ""} ${text}`);
  const sections: string[] = [];

  if (normalized.includes("fuel injection pump") || normalized.includes("fuel pump")) {
    sections.push("Fuel System", "Fuel Injection Pump");
  } else if (normalized.includes("fuel")) {
    sections.push("Fuel System");
  }

  if (normalized.includes("cylinder head")) {
    sections.push("Cylinder Head");
  }

  if (normalized.includes("gearbox") || normalized.includes("bw7") || normalized.includes("gear wheel")) {
    sections.push("Gearbox");
  }

  if (normalized.includes("alarm")) {
    sections.push("Alarm");
  }

  if (normalized.includes("speed alarm")) {
    sections.push("Speed Alarm");
  }

  if (normalized.includes("minimum depth alarm") || normalized.includes("shallow alarm")) {
    sections.push("Depth Alarm");
  }

  if (normalized.includes("keel offset")) {
    sections.push("Keel Offset");
  }

  if (normalized.includes("power") || normalized.includes("battery") || normalized.includes("volt")) {
    sections.push("Power");
  }

  if (normalized.includes("using the instrument") || normalized.includes("trip distance")) {
    sections.push("Operation");
  }

  return sections.length > 0 ? sections : ["General"];
};

const splitIntoSentences = (text: string): string[] => {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
};

const narrowExcerpt = (text: string, queryTerms: Set<string>): string => {
  const sentences = splitIntoSentences(text);
  if (sentences.length <= 2) {
    return text;
  }

  let bestIndex = 0;
  let bestScore = -1;

  for (const [index, sentence] of sentences.entries()) {
    const sentenceTokens = tokenize(sentence);
    const uniqueMatches = new Set(sentenceTokens.filter((token) => queryTerms.has(token)));
    const score = uniqueMatches.size * 5 + sentenceTokens.filter((token) => queryTerms.has(token)).length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  const excerpt = sentences.slice(Math.max(0, bestIndex - 1), Math.min(sentences.length, bestIndex + 2));
  return excerpt.join(" ");
};

export class RagStore {
  private readonly enabled: boolean;
  private readonly sourceDir: string;
  private readonly storePath: string;
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly topK: number;
  private readonly extractorPython: string;
  private readonly extractorScript: string;
  private readonly extractorMode: AppConfig["ragExtractorMode"];
  private cache: RagStoreFile = {
    indexedAt: "",
    documents: [],
    chunks: [],
  };

  constructor(private readonly config: AppConfig) {
    this.enabled = config.enableRag;
    this.sourceDir = config.ragSourceDir;
    this.storePath = config.ragStorePath;
    this.chunkSize = config.ragChunkSize;
    this.chunkOverlap = config.ragChunkOverlap;
    this.topK = config.ragTopK;
    this.extractorPython = config.ragExtractorPython;
    this.extractorScript = resolve(process.cwd(), "python", "extract_pdf_text.py");
    this.extractorMode = config.ragExtractorMode;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async runPreflightChecks(): Promise<PreflightCheck[]> {
    if (!this.enabled) {
      return [{ name: "rag", ok: true, detail: "disabled" }];
    }

    const checks: PreflightCheck[] = [];
    await mkdir(this.sourceDir, { recursive: true });
    await mkdir(dirname(this.storePath), { recursive: true });

    checks.push({
      name: "rag-source-dir",
      ok: true,
      detail: this.sourceDir,
    });

    checks.push({
      name: "rag-store-path",
      ok: true,
      detail: this.storePath,
    });

    try {
      await this.runCommand([this.extractorScript, "--help"]);
      checks.push({
        name: "rag-extractor",
        ok: true,
        detail: `${this.extractorPython} ${this.extractorScript}`,
      });
    } catch (error) {
      checks.push({
        name: "rag-extractor",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }

    return checks;
  }

  async ensureIndexed(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await mkdir(this.sourceDir, { recursive: true });
    await mkdir(dirname(this.storePath), { recursive: true });

    const currentFiles = await this.getPdfFiles();
    const currentSignature = currentFiles.map((file) => `${file.fileName}:${file.mtimeMs}:${file.size}`);

    await this.loadStore();
    const storedSignature = this.cache.documents.map(
      (file) => `${file.fileName}:${file.mtimeMs}:${file.size}`,
    );

    if (
      this.cache.chunks.length > 0 &&
      currentSignature.length === storedSignature.length &&
      currentSignature.every((value, index) => value === storedSignature[index])
    ) {
      return;
    }

    await this.rebuildStore(currentFiles);
  }

  async rebuildNow(): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    const files = await this.getPdfFiles();
    await this.rebuildStore(files);
    return this.cache.documents.length;
  }

  async search(query: string): Promise<RagSearchResult[]> {
    if (!this.enabled) {
      return [];
    }

    await this.ensureIndexed();
    return rankChunks(this.cache.chunks, query, this.topK);
  }

  async getChunks(): Promise<RagChunk[]> {
    if (!this.enabled) {
      return [];
    }

    await this.ensureIndexed();
    return this.cache.chunks;
  }

  buildPrompt(query: string, results: RagSearchResult[]): string {
    if (results.length === 0) {
      return query;
    }

    const context = results
      .map(
        (result, index) =>
          [
            `[${index + 1}] Source: ${result.source}`,
            result.pageStart > 0
              ? `Pages: ${result.pageStart}${result.pageEnd > result.pageStart ? `-${result.pageEnd}` : ""}`
              : "Pages: unknown",
            result.sectionPath?.length ? `Section path: ${result.sectionPath.join(" > ")}` : "",
            result.heading ? `Section: ${result.heading}` : "",
            `Excerpt: ${result.text}`,
          ]
            .filter(Boolean)
            .join("\n"),
      )
      .join("\n\n");

    return [
      "You are answering with local reference material.",
      "Rules:",
      "1. Use the reference excerpts when they are relevant.",
      "2. If the excerpts are insufficient, say so plainly.",
      "3. Prefer direct, factual language over paraphrasing when describing procedures or specifications.",
      "4. For procedural questions, give concise step-by-step instructions using only supported steps.",
      "5. If button names, values, or settings are present in the excerpts, preserve them exactly.",
      "6. End the answer with a 'Sources:' line that cites the relevant document and page numbers.",
      "",
      "Reference excerpts:",
      context,
      "",
      `User question: ${query}`,
    ].join("\n");
  }

  getStatusLine(): string {
    if (!this.enabled) {
      return "RAG: off";
    }

    return `RAG: on (${this.cache.documents.length} docs, ${this.cache.chunks.length} chunks)`;
  }

  private async rebuildStore(
    files: Array<{ fileName: string; fullPath: string; mtimeMs: number; size: number }>,
  ): Promise<void> {
    const documents: RagDocumentRecord[] = [];
    const chunks: RagChunk[] = [];

    for (const file of files) {
      const chunkIds: string[] = [];
      const extraction = await this.extractPdfText(file.fullPath);
      const docKey = inferDocumentKey(file.fileName);
      const sectionEntries =
        extraction.sections.length > 0
          ? extraction.sections
          : [
              {
                heading: undefined,
                sectionPath: [],
                text: extraction.text,
                pageStart: 1,
                pageEnd: 1,
              },
            ];

      let chunkIndex = 0;
      for (const sectionEntry of sectionEntries) {
        const chunkTexts = splitIntoChunks(sectionEntry.text, this.chunkSize, this.chunkOverlap);
        for (const text of chunkTexts) {
          const id = `${file.fileName}:${chunkIndex}`;
          const heading = sectionEntry.heading ?? detectHeading(text);
          const derivedSectionPath =
            sectionEntry.sectionPath && sectionEntry.sectionPath.length > 0
              ? sectionEntry.sectionPath
              : classifySection(heading, text);
          const sectionPath = derivedSectionPath[0] === docKey ? derivedSectionPath : [docKey, ...derivedSectionPath];
          chunkIds.push(id);
          chunks.push({
            id,
            docKey,
            source: file.fileName,
            text,
            tokens: tokenize(text),
            pageStart: sectionEntry.pageStart,
            pageEnd: sectionEntry.pageEnd,
            heading,
            sectionPath,
          });
          chunkIndex += 1;
        }
      }

      documents.push({
        fileName: file.fileName,
        mtimeMs: file.mtimeMs,
        size: file.size,
        chunkIds,
      });
    }

    this.cache = {
      indexedAt: new Date().toISOString(),
      documents,
      chunks,
    };

    await writeFile(this.storePath, JSON.stringify(this.cache, null, 2));
  }

  private async loadStore(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as RagStoreFile;
      this.cache = {
        indexedAt: parsed.indexedAt ?? "",
        documents: parsed.documents ?? [],
        chunks: (parsed.chunks ?? []).map((chunk) => ({
          ...chunk,
          docKey: chunk.docKey ?? inferDocumentKey(chunk.source),
          sectionPath: chunk.sectionPath ?? [inferDocumentKey(chunk.source), "General"],
        })),
      };
    } catch {
      this.cache = {
        indexedAt: "",
        documents: [],
        chunks: [],
      };
    }
  }

  private async getPdfFiles(): Promise<
    Array<{ fileName: string; fullPath: string; mtimeMs: number; size: number }>
  > {
    const entries = await readdir(this.sourceDir, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(async (entry) => {
          const fullPath = join(this.sourceDir, entry.name);
          const details = await stat(fullPath);
          return {
            fileName: entry.name,
            fullPath,
            mtimeMs: details.mtimeMs,
            size: details.size,
          };
        }),
    );

    return files;
  }

  private async extractPdfText(pdfPath: string): Promise<{
    text: string;
    pages: Array<{ page: number; text: string }>;
    sections: Array<{
      heading?: string;
      sectionPath: string[];
      text: string;
      pageStart: number;
      pageEnd: number;
    }>;
  }> {
    const stdout = await this.runCommand([this.extractorScript, "--mode", this.extractorMode, pdfPath]);
    let payload: ExtractionPayload;
    try {
      payload = JSON.parse(stdout) as ExtractionPayload;
    } catch {
      // Some extractors (or their dependencies) log to stdout. Recover by parsing the JSON object
      // from the first '{' onwards.
      const start = stdout.indexOf("{");
      if (start === -1) {
        throw new Error(`RAG extraction returned non-JSON output for ${pdfPath}.`);
      }
      payload = JSON.parse(stdout.slice(start)) as ExtractionPayload;
    }
    if (payload.error) {
      throw new Error(`RAG extraction failed for ${pdfPath}: ${payload.error}`);
    }

    return {
      text: (payload.text ?? "").trim(),
      pages: (payload.pages ?? [])
        .map((entry) => ({
          page: entry.page ?? 0,
          text: (entry.text ?? "").trim(),
        }))
        .filter((entry) => entry.page > 0 && entry.text.length > 0),
      sections: (payload.sections ?? [])
        .map((entry) => ({
          heading: entry.heading,
          sectionPath: entry.sectionPath ?? [],
          text: (entry.text ?? "").trim(),
          pageStart: entry.pageStart ?? 0,
          pageEnd: entry.pageEnd ?? entry.pageStart ?? 0,
        }))
        .filter((entry) => entry.text.length > 0),
    };
  }

  private async runCommand(args: string[]): Promise<string> {
    return await new Promise<string>((resolvePromise, rejectPromise) => {
      const child = spawn(this.extractorPython, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", rejectPromise);
      child.on("close", (code) => {
        if (code === 0) {
          resolvePromise(stdout.trim());
          return;
        }

        const detail = stderr.trim() || stdout.trim() || `Command exited with ${code}.`;
        rejectPromise(new Error(detail));
      });
    });
  }
}
