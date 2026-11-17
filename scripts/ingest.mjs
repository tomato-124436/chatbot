import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const DOCUMENT_TITLE = "KB 반려행복펫보험";
const SECTION_BY_PAGE = {
  1: "표지",
  2: "안내 및 유의사항",
  3: "개인신용정보 고객 권리 안내",
  4: "개인신용정보 고객 권리 안내",
  5: "고객정보 취급방침",
  6: "고객정보 취급방침",
  7: "고객정보 취급방침",
  9: "고객센터 안내",
  10: "표지",
  11: "특별약관 목차",
  12: "반려동물 사망시 위로금 특별약관",
  13: "반려동물 배상책임 특별약관",
  14: "반려동물 배상책임 특별약관",
  15: "반려동물 배상책임 특별약관",
  16: "반려동물 배상책임 특별약관",
};

function normalizePage(text) {
  return text
    .replace(/\u0000/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce((merged, line) => {
      if (merged.length === 0) return [line];
      const previous = merged[merged.length - 1];
      if (/[.?!。]$/.test(previous) || /^[-•\d]/.test(line) || previous.length < 12) {
        merged.push(line);
      } else {
        merged[merged.length - 1] = previous + line;
      }
      return merged;
    }, [])
    .join("\n");
}

function chunkText(text, size = 700, overlap = 80) {
  if (text.length <= size) return [text];
  const chunks = [];
  for (let start = 0; start < text.length; start += size - overlap) {
    chunks.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return chunks;
}

async function embedPassage(input) {
  const response = await fetch("https://api.upstage.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "embedding-passage", input }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "Upstage embedding failed");
  return body.data[0].embedding;
}

const pdf = await getDocumentProxy(new Uint8Array(readFileSync(new URL("../dataset/kb.pdf", import.meta.url))));
const extracted = await extractText(pdf, { mergePages: false });
const chunks = [];

extracted.text.forEach((page, index) => {
  const section = SECTION_BY_PAGE[index + 1];
  const content = normalizePage(page);
  if (!section || content.length < 40) return;
  for (const piece of chunkText(content)) {
    chunks.push({
      source: `${DOCUMENT_TITLE} · ${section}`,
      content: piece,
    });
  }
});

console.log(`chunks ${chunks.length}`);
const payload = [];
for (const [index, chunk] of chunks.entries()) {
  const embedding = await embedPassage(chunk.content);
  payload.push({
    source: chunk.source,
    chunk_index: index,
    content: chunk.content,
    embedding: `[${embedding.join(",")}]`,
  });
  process.stdout.write(".");
}
process.stdout.write("\n");

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const batchSize = 4;
let inserted = 0;
for (let start = 0; start < payload.length; start += batchSize) {
  const { data, error } = await supabase.rpc("replace_documents", {
    ingest_secret: env.INGEST_SECRET,
    chunks: payload.slice(start, start + batchSize),
    replace_all: start === 0,
  });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  inserted += data ?? 0;
}

const probe = await embedQueryProbe("반려동물 사망 위로금은 언제 지급되나요?");
console.log(JSON.stringify({ inserted, probeDim: probe.length }));

async function embedQueryProbe(input) {
  const response = await fetch("https://api.upstage.ai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.UPSTAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "embedding-query", input }),
  });
  const body = await response.json();
  return body.data[0].embedding;
}

