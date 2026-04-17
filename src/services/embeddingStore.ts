import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AppConfig, EmbeddingRecord, RagChunk, RagSearchResult } from "../types";
import { RagStore } from "./ragStore";

interface OllamaEmbedResponse {
  embeddings?: number[][];
}

interface EmbeddingStoreFile {
  model: string;
  records: EmbeddingRecord[];
}

export const cosineSimilarity = (left: number[], right: number[]): number => {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }

  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
};

export class EmbeddingStore {
  private readonly endpoint: string;
  private readonly model: string;
  private readonly storePath: string;
  private readonly topK: number;
  private readonly rag: RagStore;
  private records = new Map<string, number[]>();

  constructor(private readonly config: AppConfig) {
    const ollamaService = config.services.find((service) => service.name === "ollama");
    if (!ollamaService) {
      throw new Error("Ollama service configuration is missing.");
    }

    this.endpoint = ollamaService.url.replace(/\/+$/, "");
    this.model = config.embeddingModel;
    this.storePath = config.embeddingStorePath;
    this.topK = config.embeddingTopK;
    this.rag = new RagStore(config);
  }

  async ensureIndexed(): Promise<void> {
    const chunks = await this.rag.getChunks();
    await mkdir(dirname(this.storePath), { recursive: true });
    await this.load();

    const missing = chunks.filter((chunk) => !this.records.has(chunk.id));
    if (missing.length === 0) {
      return;
    }

    for (const chunk of missing) {
      const vector = await this.embed(chunk.text);
      this.records.set(chunk.id, vector);
    }

    await this.persist();
  }

  async search(query: string): Promise<RagSearchResult[]> {
    await this.ensureIndexed();
    const chunks = await this.rag.getChunks();
    const queryVector = await this.embed(query);

    return chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryVector, this.records.get(chunk.id) ?? []),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, this.topK)
      .map(({ chunk, score }) => ({
        source: chunk.source,
        text: chunk.text,
        score,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        heading: chunk.heading,
      }));
  }

  async getChunks(): Promise<RagChunk[]> {
    await this.ensureIndexed();
    return await this.rag.getChunks();
  }

  async getVector(chunkId: string): Promise<number[] | undefined> {
    await this.ensureIndexed();
    return this.records.get(chunkId);
  }

  async embedQuery(input: string): Promise<number[]> {
    return await this.embed(input);
  }

  private async embed(input: string): Promise<number[]> {
    const response = await fetch(`${this.endpoint}/api/embed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding request returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as OllamaEmbedResponse;
    const vector = payload.embeddings?.[0];
    if (!vector || vector.length === 0) {
      throw new Error("Ollama embedding response was empty.");
    }

    return vector;
  }

  private async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as EmbeddingStoreFile;
      if (parsed.model !== this.model) {
        this.records.clear();
        return;
      }

      this.records = new Map(parsed.records.map((record) => [record.chunkId, record.vector]));
    } catch {
      this.records.clear();
    }
  }

  private async persist(): Promise<void> {
    const file: EmbeddingStoreFile = {
      model: this.model,
      records: [...this.records.entries()].map(([chunkId, vector]) => ({
        chunkId,
        vector,
      })),
    };

    await writeFile(this.storePath, JSON.stringify(file));
  }
}
