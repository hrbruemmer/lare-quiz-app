// STABLE FIX: remove pdf parsing entirely, use pre-extracted text files

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

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoChunks(text: string, size: number = 1400): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function sampleChunks(chunks: string[], count: number): string[] {
  if (chunks.length <= count) return chunks;

  const result: string[] = [];
  const step = Math.max(1, Math.floor(chunks.length / count));

  for (let i = 0; i < chunks.length && result.length < count; i += step) {
    result.push(chunks[i]);
  }

  return result;
}

function parseJsonSafely(text: string): { questions?: QuestionPayload[] } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RouteBody;
    const topic = String(body.topic || "").trim();
    const questionCount = Math.max(1, Math.min(30, Number(body.questionCount || 10)));

    if (!topic) {
      return Response.json({ error: "No folder selected." }, { status: 400 });
    }

    const folderPath = path.join(process.cwd(), "library", topic);

    if (!fs.existsSync(folderPath)) {
      return Response.json({ error: "Folder not found." }, { status: 404 });
    }

    // 🔥 READ .txt FILES INSTEAD OF PDF
    const files = fs
      .readdirSync(folderPath)
      .filter((file: string) => file.toLowerCase().endsWith(".txt"));

    if (!files.length) {
      return Response.json({ error: "No TXT files found. Convert PDFs to text first." }, { status: 400 });
    }

    let fullText = "";

    for (const file of files) {
      const text = fs.readFileSync(path.join(folderPath, file), "utf-8");
      fullText += "\n" + text;
    }

    const cleaned = cleanText(fullText);
    const chunks = splitIntoChunks(cleaned);
    const sampled = sampleChunks(chunks, Math.max(10, questionCount * 2));

    const prompt = `
Generate ${questionCount} LARE-style questions.

- At least 40% must be SELECT ALL THAT APPLY
- Use different parts of the material
- Avoid repetition

Return JSON:
{
  "questions": [
    {
      "question": "",
      "options": [],
      "answer": [],
      "explanation": "",
      "multi": true
    }
  ]
}

CONTENT:
${sampled.join("\n---\n")}
`;

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const parsed = parseJsonSafely(response.output_text || "");

    if (!parsed?.questions) {
      return Response.json({ error: "Bad AI response" }, { status: 500 });
    }

    return Response.json(parsed);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
