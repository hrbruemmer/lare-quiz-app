import fs from "fs";
import path from "path";
import { getPath } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";
import OpenAI from "openai";

PDFParse.setWorker(getPath());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type RequestBody = {
  topic?: string;
  questionCount?: number;
  includeMultiSelect?: boolean;
  promptStyle?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cleanText(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitIntoChunks(text: string, maxLength = 1400) {
  const cleaned = cleanText(text);
  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

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

  if (!chunks.length && cleaned) {
    for (let i = 0; i < cleaned.length; i += maxLength) {
      chunks.push(cleaned.slice(i, i + maxLength));
    }
  }

  return chunks;
}

function distributedSample<T>(items: T[], count: number) {
  if (items.length <= count) return items;

  const result: T[] = [];
  const step = (items.length - 1) / (count - 1);

  for (let i = 0; i < count; i += 1) {
    const index = Math.round(i * step);
    result.push(items[index]);
  }

  return result;
}

function extractJson(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

async function readPdfText(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return cleanText(result.text || "");
  } finally {
    await parser.destroy();
  }
}

function buildPrompt(args: {
  topic: string;
  questionCount: number;
  multiSelectRequired: number;
  sourceSegments: string[];
  sourceFiles: string[];
  promptStyle?: string;
}) {
  return `
You are generating high-quality exam-prep questions from source material.

Goal:
- Write questions that help a learner review IMPORTANT INFORMATION from the provided source material.
- Cover DIFFERENT PARTS of the document, not just the beginning.
- Spread questions across as many distinct topics/sections as possible.
- Do not cluster more than 2 questions on the same source segment unless absolutely necessary.
- At least ${args.multiSelectRequired} of the ${args.questionCount} questions MUST be "select all that apply" with multiple correct answers.
- The rest may be single-answer multiple choice.
- Keep the questions grounded in the source text and avoid inventing unsupported facts.

Topic/folder selected:
${args.topic}

Files used:
${args.sourceFiles.join(", ")}

Style guidance:
${args.promptStyle || "Make the questions practical, challenging, and focused on study value."}

Return VALID JSON ONLY in exactly this shape:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "answer": ["one or more exact option strings"],
      "explanation": "string",
      "multi": true
    }
  ]
}

Rules:
- Generate exactly ${args.questionCount} questions.
- For single-answer questions, "answer" must still be an array with exactly one item.
- For multi-select questions, "answer" must be an array with 2 or more items and "multi" must be true.
- Use 4 options when possible. 5 options is okay if needed.
- Make distractors plausible.
- Do not include markdown fences.
- Do not include any text before or after the JSON.

SOURCE SEGMENTS:
${args.sourceSegments
  .map((segment, index) => `SEGMENT ${index + 1}:\n${segment}`)
  .join("\n\n-----\n\n")}
`.trim();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const topic = String(body.topic || "").trim();
    const questionCount = clamp(Number(body.questionCount || 10), 1, 30);
    const includeMultiSelect = body.includeMultiSelect !== false;
    const multiSelectRequired = includeMultiSelect
      ? Math.max(1, Math.round(questionCount * 0.4))
      : 0;

    if (!topic) {
      return Response.json({ error: "No folder selected." }, { status: 400 });
    }

    const folderPath = path.join(process.cwd(), "library", topic);

    if (!fs.existsSync(folderPath)) {
      return Response.json({ error: "Folder not found." }, { status: 400 });
    }

    const files = fs
      .readdirSync(folderPath)
      .filter((file) => file.toLowerCase().endsWith(".pdf"));

    if (!files.length) {
      return Response.json({ error: "No PDF files found in that folder." }, { status: 400 });
    }

    const texts: string[] = [];

    for (const file of files) {
      const fullPath = path.join(folderPath, file);
      const text = await readPdfText(fullPath);
      if (text) {
        texts.push(`[SOURCE FILE: ${file}]\n${text}`);
      }
    }

    const combined = cleanText(texts.join("\n\n"));
    if (!combined) {
      return Response.json({ error: "No readable text found in the folder." }, { status: 400 });
    }

    const allChunks = splitIntoChunks(combined, 1400);
    const sampledChunks = distributedSample(
      allChunks,
      clamp(questionCount * 3, 10, 28)
    );

    const prompt = buildPrompt({
      topic,
      questionCount,
      multiSelectRequired,
      sourceSegments: sampledChunks,
      sourceFiles: files,
      promptStyle: body.promptStyle,
    });

    const completion = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const raw = completion.output_text || "";
    const jsonText = extractJson(raw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return Response.json(
        {
          error: "AI returned invalid JSON.",
          raw: raw.slice(0, 600),
        },
        { status: 500 }
      );
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("questions" in parsed) ||
      !Array.isArray((parsed as { questions: unknown }).questions)
    ) {
      return Response.json(
        { error: "AI response did not contain a questions array." },
        { status: 500 }
      );
    }

    return Response.json(parsed);
  } catch (error: any) {
    console.error(error);
    return Response.json(
      { error: error?.message || "Could not generate quiz." },
      { status: 500 }
    );
  }
}
