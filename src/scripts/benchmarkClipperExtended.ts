import { loadConfig } from "../config";
import { ChatService } from "../services/chatService";
import { EmbeddingStore } from "../services/embeddingStore";
import { HybridStore } from "../services/hybridStore";
import { RagStore } from "../services/ragStore";
import type { RagSearchResult } from "../types";

type RetrievalMode = "lexical" | "embedding" | "hybrid";

interface BenchmarkCase {
  label: "baseline" | "new";
  question: string;
}

const BASELINE_CASES: BenchmarkCase[] = [
  {
    label: "baseline",
    question: "According to the Clipper Duet manual, what does the depth display show?",
  },
  {
    label: "baseline",
    question: "According to the Clipper Duet manual, how do you change the shallow alarm setting?",
  },
  {
    label: "baseline",
    question: "According to the Clipper Duet manual, what power supply voltage does the instrument use?",
  },
];

// Further 10 tests derived from the Clipper Duet manual sections (installation + configuration + alarms).
const NEW_CASES: BenchmarkCase[] = [
  {
    label: "new",
    question: "According to the Clipper Duet manual, what does the display show when the echo is completely lost?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, how do you turn the display backlight on and off?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, what are the panel cutout dimensions for installing the display?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, which wire connects to negative and which to positive?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, what fuse rating is suggested for the power supply?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, how do you enter configuration mode?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, how do you disable the speed alarm?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, how do you arm and then disable the minimum depth alarm without changing the setting?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, what are the three mounting options for the echo sounder transducer?",
  },
  {
    label: "new",
    question: "According to the Clipper Duet manual, how is external electrical interference characterised on the display?",
  },
];

const CASES: BenchmarkCase[] = [...BASELINE_CASES, ...NEW_CASES];

const printSources = (sources: RagSearchResult[]): void => {
  for (const source of sources) {
    const pageLabel =
      source.pageStart > 0
        ? source.pageStart === source.pageEnd
          ? `${source.pageStart}`
          : `${source.pageStart}-${source.pageEnd}`
        : "unknown";
    process.stdout.write(
      `  - ${source.source} p.${pageLabel} score=${source.score.toFixed(3)} ${source.heading ? `heading=${source.heading}` : ""}\n`,
    );
  }
};

const timeIt = async <T>(label: string, fn: () => Promise<T>): Promise<{ value: T; seconds: number }> => {
  const start = Date.now();
  const value = await fn();
  const seconds = (Date.now() - start) / 1000;
  process.stdout.write(`${label}=${seconds.toFixed(2)}s\n`);
  return { value, seconds };
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  const chat = new ChatService(config);
  const lexical = new RagStore(config);
  const embedding = new EmbeddingStore(config);
  const hybrid = new HybridStore(config);

  process.stdout.write("=== CLIPPER EXTENDED BENCHMARK ===\n");
  process.stdout.write(`extractor=${config.ragExtractorMode} model=${config.ollamaModel} embed_model=${config.embeddingModel}\n`);
  process.stdout.write(`source_dir=${config.ragSourceDir}\n`);
  process.stdout.write(`rag_store=${config.ragStorePath}\n`);
  process.stdout.write(`embedding_store=${config.embeddingStorePath}\n\n`);

  process.stdout.write("Indexing timings (first run / cold store):\n");
  await timeIt("  index.lexical", async () => lexical.ensureIndexed());
  await timeIt("  index.embedding", async () => embedding.ensureIndexed());
  await timeIt("  index.hybrid", async () => hybrid.ensureIndexed());
  await timeIt("  index.chat", async () => chat.ensureKnowledgeReady());

  const modes: Array<[RetrievalMode, (question: string) => Promise<RagSearchResult[]>]> = [
    ["lexical", (question) => lexical.search(question)],
    ["embedding", (question) => embedding.search(question)],
    ["hybrid", (question) => hybrid.search(question)],
  ];

  const totals = new Map<string, { retrievalSeconds: number; answerSeconds: number; count: number }>();
  const newTotals = new Map<string, { retrievalSeconds: number; answerSeconds: number; count: number }>();

  for (const testCase of CASES) {
    process.stdout.write(`\n--- ${testCase.label.toUpperCase()} ---\n`);
    process.stdout.write(`${testCase.question}\n`);

    for (const [mode, search] of modes) {
      const retrievalStart = Date.now();
      const sources = await search(testCase.question);
      const retrievalSeconds = (Date.now() - retrievalStart) / 1000;

      const answerStart = Date.now();
      const reply = await chat.answerWithSources(testCase.question, sources);
      const answerSeconds = (Date.now() - answerStart) / 1000;

      process.stdout.write(`\n[${mode}] retrieval=${retrievalSeconds.toFixed(2)}s answer=${answerSeconds.toFixed(2)}s\n`);
      printSources(sources);
      process.stdout.write(`  reply: ${reply.replace(/\n/g, " ")}\n`);

      const bucket = totals.get(mode) ?? { retrievalSeconds: 0, answerSeconds: 0, count: 0 };
      bucket.retrievalSeconds += retrievalSeconds;
      bucket.answerSeconds += answerSeconds;
      bucket.count += 1;
      totals.set(mode, bucket);

      if (testCase.label === "new") {
        const newBucket = newTotals.get(mode) ?? { retrievalSeconds: 0, answerSeconds: 0, count: 0 };
        newBucket.retrievalSeconds += retrievalSeconds;
        newBucket.answerSeconds += answerSeconds;
        newBucket.count += 1;
        newTotals.set(mode, newBucket);
      }
    }
  }

  process.stdout.write("\nAverages (all 13 questions):\n");
  for (const mode of ["lexical", "embedding", "hybrid"] as const) {
    const bucket = totals.get(mode);
    if (!bucket || bucket.count === 0) {
      continue;
    }
    process.stdout.write(
      `  ${mode}: retrieval_avg=${(bucket.retrievalSeconds / bucket.count).toFixed(2)}s answer_avg=${(bucket.answerSeconds / bucket.count).toFixed(2)}s\n`,
    );
  }

  process.stdout.write("\nAverages (new 10 questions only):\n");
  for (const mode of ["lexical", "embedding", "hybrid"] as const) {
    const bucket = newTotals.get(mode);
    if (!bucket || bucket.count === 0) {
      continue;
    }
    process.stdout.write(
      `  ${mode}: retrieval_avg=${(bucket.retrievalSeconds / bucket.count).toFixed(2)}s answer_avg=${(bucket.answerSeconds / bucket.count).toFixed(2)}s\n`,
    );
  }
};

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`benchmark failed: ${detail}\n`);
  process.exit(1);
});

