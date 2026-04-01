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

function splitIntoParagraphChunks(text: string, maxLength: number = 1100): string[] {
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

  if (current) {
    chunks.push(current);
  }

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
    const chunksPerFile = Math.max(
      2,
      Math.min(4, Math.ceil(questionCount / Math.max(1, files.length)) + 1)
    );

    for (const file of files) {
      const raw = fs.readFileSync(path.join(folderPath, file), "utf-8");
      const cleaned = cleanText(raw);

      if (!cleaned) continue;

      const fileChunks = splitIntoParagraphChunks(cleaned, 1100);
      const sampled = selectDistributedChunks(fileChunks, chunksPerFile);

      sampled.forEach((chunk, index) => {
        perFileSegments.push(
          `[FILE: ${file} | EXCERPT ${index + 1} of ${sampled.length}]\n${chunk}`
        );
      });
    }

    if (!perFileSegments.length) {
      return Response.json(
        { error: "The TXT files were found, but no usable text could be read." },
        { status: 400 }
      );
    }

    const maxSegments = Math.min(
      perFileSegments.length,
      Math.max(10, questionCount * 2)
    );
    const selectedSegments = selectDistributedChunks(perFileSegments, maxSegments);

    const prompt = `
Generate ${questionCount} LARE-style study questions from the source excerpts below.

Requirements:
- At least 40 percent must be SELECT ALL THAT APPLY questions with more than one correct answer.
- Spread the questions across DIFFERENT files and DIFFERENT excerpts.
- Avoid repeating the same topic, section, or concept.
- Focus on important exam-relevant information rather than trivia.
- Use plausible distractors.
- For every question, return:
  - question
  - options
  - answer (always an array; one item for single-answer, multiple items for multi-select)
  - explanation
  - multi (true for select-all-that-apply, false otherwise)

Return valid JSON only in this exact shape:
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
${selectedSegments.join("\n\n---\n\n")}
`.trim();

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const outputText = response.output_text || "";
    const parsed = parseJsonSafely(outputText);

    if (!parsed || !Array.isArray(parsed.questions)) {
      return Response.json(
        {
          error: "AI did not return valid question JSON.",
          raw: outputText.slice(0, 1000),
        },
        { status: 500 }
      );
    }

    const questions = normalizeQuestions(parsed.questions);

    if (!questions.length) {
      return Response.json(
        { error: "No usable questions were returned." },
        { status: 500 }
      );
    }

    return Response.json({ questions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
