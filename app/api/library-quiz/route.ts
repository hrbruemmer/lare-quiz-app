import fs from "fs";
import path from "path";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteBody = {
  topic?: string;
  questionCount?: number;
};

type QuestionPayload = {
  question: string;
  options: string[];
  answer: string[];
  explanation: string;
  multi: boolean;
};

type AIResponse = {
  questions?: QuestionPayload[];
};

function cleanText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoParagraphChunks(text: string, maxLength: number = 900): string[] {
  const cleaned = cleanText(text);
  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paragraphs.length) {
    const chunks: string[] = [];
    for (let i = 0; i < cleaned.length; i += maxLength) {
      chunks.push(cleaned.slice(i, i + maxLength));
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph;
      continue;
    }

    if ((current + "\n\n" + paragraph).length <= maxLength) {
      current += "\n\n" + paragraph;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function selectDistributedChunks(chunks: string[], wanted: number): string[] {
  if (chunks.length <= wanted) return chunks;
  if (wanted <= 1) return [chunks[Math.floor(chunks.length / 2)]];

  const result: string[] = [];
  const step = (chunks.length - 1) / (wanted - 1);

  for (let i = 0; i < wanted; i += 1) {
    const index = Math.round(i * step);
    result.push(chunks[index]);
  }

  return result;
}

function parseJsonSafely(text: string): AIResponse | null {
  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }

    return null;
  }
}

function normalizeQuestions(items: QuestionPayload[]): QuestionPayload[] {
  return items
    .filter((item) => item && typeof item.question === "string")
    .map((item) => {
      const options = Array.isArray(item.options)
        ? item.options
            .filter((option): option is string => typeof option === "string")
            .map((o) => o.trim())
            .filter(Boolean)
        : [];

      const answer = Array.isArray(item.answer)
        ? item.answer
            .filter((a): a is string => typeof a === "string")
            .map((a) => a.trim())
            .filter(Boolean)
        : [];

      const normalizedOptions = Array.from(new Set([...options, ...answer]));

      return {
        question: String(item.question).trim(),
        options: normalizedOptions,
        answer: Array.from(new Set(answer)),
        explanation: String(item.explanation || "").trim(),
        multi: Boolean(item.multi) || answer.length > 1,
      };
    })
    .filter(
      (item) =>
        item.question &&
        item.options.length >= 2 &&
        item.answer.length >= 1 &&
        item.explanation
    );
}

function makeBatchPlan(total: number): number[] {
  if (total <= 4) return [total];
  if (total <= 8) return [Math.ceil(total / 2), Math.floor(total / 2)];
  if (total <= 12) return [4, 4, total - 8];
  const batches: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    if (remaining <= 4) {
      batches.push(remaining);
      break;
    }
    batches.push(4);
    remaining -= 4;
  }
  return batches;
}

function dedupeByQuestion(items: QuestionPayload[]): QuestionPayload[] {
  return Array.from(
    new Map(items.map((item) => [item.question.toLowerCase(), item])).values()
  );
}

function buildPrompt(args: {
  questionCount: number;
  requireMulti: number;
  selectedSegments: string[];
}) {
  return `
Generate ${args.questionCount} LARE-style study questions from the source excerpts below.

Requirements:
- At least ${args.requireMulti} of these ${args.questionCount} questions must be SELECT ALL THAT APPLY questions with more than one correct answer.
- Spread questions across DIFFERENT excerpts when possible.
- Avoid repeating the same concept.
- Focus on important exam-relevant material.
- Use plausible distractors.
- Keep explanations short and useful.
- Return valid JSON only.

Return exactly this shape:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": ["string"],
      "explanation": "string",
      "multi": false
    }
  ]
}

SOURCE EXCERPTS:
${args.selectedSegments.join("\n\n---\n\n")}
`.trim();
}

async function generateBatch(
  client: OpenAI,
  questionCount: number,
  allSegments: string[],
  offsetSeed: number
): Promise<QuestionPayload[]> {
  const segmentCount = Math.min(
    allSegments.length,
    Math.max(4, Math.min(8, questionCount + 2))
  );

  const rotated = allSegments
    .slice(offsetSeed % allSegments.length)
    .concat(allSegments.slice(0, offsetSeed % allSegments.length));

  const selectedSegments = selectDistributedChunks(rotated, segmentCount);

  const prompt = buildPrompt({
    questionCount,
    requireMulti: Math.max(1, Math.round(questionCount * 0.4)),
    selectedSegments,
  });

  const response = await client.responses.create({
    model: "gpt-5-mini",
    input: prompt,
  });

  const outputText = response.output_text || "";
  const parsed = parseJsonSafely(outputText);

  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error("AI did not return valid question JSON.");
  }

  const normalized = normalizeQuestions(parsed.questions);

  if (!normalized.length) {
    throw new Error("No usable questions were returned.");
  }

  return normalized.slice(0, questionCount);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RouteBody;
    const topic = String(body.topic || "").trim();
    const questionCount = Math.max(1, Math.min(20, Number(body.questionCount || 10)));

    if (!topic) {
      return Response.json({ error: "No folder selected." }, { status: 400 });
    }

    const folderPath = path.join(process.cwd(), "library", topic);

    if (!fs.existsSync(folderPath)) {
      return Response.json({ error: "Folder not found." }, { status: 404 });
    }

    const files = fs
      .readdirSync(folderPath)
      .filter((file: string) => file.toLowerCase().endsWith(".txt"))
      .sort();

    if (!files.length) {
      return Response.json(
        { error: "No TXT files found in that folder." },
        { status: 400 }
      );
    }

    const perFileSegments: string[] = [];
    const chunksPerFile = 2;

    for (const file of files) {
      const raw = fs.readFileSync(path.join(folderPath, file), "utf-8");
      const cleaned = cleanText(raw);
      if (!cleaned) continue;

      const fileChunks = splitIntoParagraphChunks(cleaned, 900);
      const sampled = selectDistributedChunks(fileChunks, chunksPerFile);

      sampled.forEach((chunk, index) => {
        perFileSegments.push(
          `[FILE: ${file} | EXCERPT ${index + 1}]\n${chunk}`
        );
      });
    }

    if (!perFileSegments.length) {
      return Response.json(
        { error: "The TXT files were found, but no usable text could be read." },
        { status: 400 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const batchPlan = makeBatchPlan(questionCount);

    const batchPromises = batchPlan.map((batchSize, index) =>
      generateBatch(client, batchSize, perFileSegments, index * 2)
    );

    const batchResults = await Promise.all(batchPromises);
    const merged = dedupeByQuestion(batchResults.flat());

    if (!merged.length) {
      return Response.json(
        { error: "No usable questions were returned." },
        { status: 500 }
      );
    }

    return Response.json({ questions: merged.slice(0, questionCount) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
