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

  return chunks
    .map((chunk) => {
      let score = 0;
      for (const token of chunk.tokens) {
        if (queryTerms.has(token)) {
          score += 1;
        }
      }

      return {
        source: chunk.source,
        text: chunk.text,
        score,
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, topK));
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

  buildPrompt(query: string, results: RagSearchResult[]): string {
    if (results.length === 0) {
      return query;
    }

    const context = results
      .map(
        (result, index) =>
          `[${index + 1}] Source: ${result.source}\n${result.text}`,
      )
      .join("\n\n");

    return [
      "Use the following local reference material if it is relevant. If the material is not relevant, ignore it.",
      "",
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
      const rawText = await this.extractPdfText(file.fullPath);
      const chunkTexts = splitIntoChunks(rawText, this.chunkSize, this.chunkOverlap);
      const chunkIds: string[] = [];

      for (const [index, text] of chunkTexts.entries()) {
        const id = `${file.fileName}:${index}`;
        chunkIds.push(id);
        chunks.push({
          id,
          source: file.fileName,
          text,
          tokens: tokenize(text),
        });
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
        chunks: parsed.chunks ?? [],
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

  private async extractPdfText(pdfPath: string): Promise<string> {
    const stdout = await this.runCommand([this.extractorScript, pdfPath]);
    const payload = JSON.parse(stdout) as ExtractionPayload;
    if (payload.error) {
      throw new Error(`RAG extraction failed for ${pdfPath}: ${payload.error}`);
    }

    return (payload.text ?? "").trim();
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

        rejectPromise(new Error(stderr.trim() || `Command exited with ${code}.`));
      });
    });
  }
}
