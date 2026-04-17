import { loadConfig } from "../config";
import { ChatService } from "../services/chatService";
import { EmbeddingStore } from "../services/embeddingStore";
import { HybridStore } from "../services/hybridStore";
import { RagStore } from "../services/ragStore";
import type { RagSearchResult } from "../types";

type RetrievalMode = "lexical" | "embedding" | "hybrid";

interface BenchmarkCase {
  manual: "bukh" | "clipper";
  question: string;
}

const CASES: BenchmarkCase[] = [
  {
    manual: "bukh",
    question: "Where is the fuel injection pump described in the BUKH DV20 manual?",
  },
  {
    manual: "bukh",
    question: "What should be checked before dismantling the fuel injection pump on the BUKH DV20?",
  },
  {
    manual: "bukh",
    question: "What is the tightening torque for the cylinder head nuts on the BUKH DV20?",
  },
  {
    manual: "clipper",
    question: "According to the Clipper Duet manual, what does the depth display show?",
  },
  {
    manual: "clipper",
    question: "According to the Clipper Duet manual, how do you change the shallow alarm setting?",
  },
  {
    manual: "clipper",
    question: "According to the Clipper Duet manual, what power supply voltage does the instrument use?",
  },
];

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

const main = async (): Promise<void> => {
  const config = loadConfig();
  const chat = new ChatService(config);
  const lexical = new RagStore(config);
  const embedding = new EmbeddingStore(config);
  const hybrid = new HybridStore(config);

  await chat.ensureKnowledgeReady();
  await embedding.ensureIndexed();
  await hybrid.ensureIndexed();

  const modes: Array<[RetrievalMode, (question: string) => Promise<RagSearchResult[]>]> = [
    ["lexical", (question) => lexical.search(question)],
    ["embedding", (question) => embedding.search(question)],
    ["hybrid", (question) => hybrid.search(question)],
  ];

  for (const testCase of CASES) {
    process.stdout.write(`\n=== ${testCase.manual.toUpperCase()} ===\n`);
    process.stdout.write(`${testCase.question}\n`);

    for (const [mode, search] of modes) {
      const retrievalStart = Date.now();
      const sources = await search(testCase.question);
      const retrievalSeconds = ((Date.now() - retrievalStart) / 1000).toFixed(2);

      const answerStart = Date.now();
      const reply = await chat.answerWithSources(testCase.question, sources);
      const answerSeconds = ((Date.now() - answerStart) / 1000).toFixed(2);

      process.stdout.write(`\n[${mode}] retrieval=${retrievalSeconds}s answer=${answerSeconds}s\n`);
      printSources(sources);
      process.stdout.write(`  reply: ${reply.replace(/\n/g, " ")}\n`);
    }
  }
};

main().catch((error) => {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`benchmark failed: ${detail}\n`);
  process.exit(1);
});
