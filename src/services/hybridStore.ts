import type { AppConfig, RagChunk, RagSearchResult } from "../types";
import { cosineSimilarity, EmbeddingStore } from "./embeddingStore";
import { RagStore, getDocumentHints, rankChunks } from "./ragStore";

export class HybridStore {
  private readonly lexical: RagStore;
  private readonly embedding: EmbeddingStore;
  private readonly topK: number;

  constructor(private readonly config: AppConfig) {
    this.lexical = new RagStore(config);
    this.embedding = new EmbeddingStore(config);
    this.topK = config.embeddingTopK;
  }

  async ensureIndexed(): Promise<void> {
    await this.lexical.ensureIndexed();
    await this.embedding.ensureIndexed();
  }

  async search(query: string): Promise<RagSearchResult[]> {
    await this.ensureIndexed();

    const chunks = await this.lexical.getChunks();
    const documentHints = new Set(getDocumentHints(query));
    const queryVector = await this.embedding.embedQuery(query);
    const lexicalHits = rankChunks(chunks, query, Math.max(10, this.topK * 3));
    const scored: RagSearchResult[] = [];
    for (const hit of lexicalHits) {
      const chunk = this.findChunk(chunks, hit);
      if (!chunk) {
        continue;
      }

      const vector = await this.embedding.getVector(chunk.id);
      if (!vector) {
        continue;
      }

      const lexicalScore = hit.score;
      const denseScore = Math.max(0, cosineSimilarity(queryVector, vector));
      const sectionBoost = this.sectionMatchScore(query, chunk);
      const documentBoost = documentHints.size > 0 && documentHints.has(chunk.docKey) ? 5 : 0;
      const score = lexicalScore * 0.6 + denseScore * 20 * 0.3 + sectionBoost * 0.1 + documentBoost;
      if (score <= 0) {
        continue;
      }

      scored.push(this.toResult(chunk, score, hit.text));
    }

    return scored
      .sort((left, right) => right.score - left.score)
      .slice(0, this.topK);
  }

  private toResult(chunk: RagChunk, score: number, excerpt?: string): RagSearchResult {
    return {
      docKey: chunk.docKey,
      source: chunk.source,
      text: excerpt ?? chunk.text,
      score,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      heading: chunk.heading,
      sectionPath: chunk.sectionPath,
    };
  }

  private findChunk(chunks: RagChunk[], hit: RagSearchResult): RagChunk | undefined {
    return chunks.find(
      (chunk) =>
        chunk.source === hit.source &&
        chunk.pageStart === hit.pageStart &&
        chunk.pageEnd === hit.pageEnd &&
        chunk.text.includes(hit.text.slice(0, 32)),
    );
  }

  private sectionMatchScore(query: string, chunk: RagChunk): number {
    const normalizedQuery = query.toLowerCase();
    let score = 0;
    for (const section of chunk.sectionPath ?? []) {
      const words = section.toLowerCase().split(/\s+/).filter(Boolean);
      for (const word of words) {
        if (word.length > 3 && normalizedQuery.includes(word)) {
          score += 1;
        }
      }
    }

    return score;
  }
}
