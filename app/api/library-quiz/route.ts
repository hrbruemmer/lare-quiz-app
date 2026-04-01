// FINAL FIX v3 - fixes TypeScript + runtime issues

import fs from "fs";
import path from "path";
import OpenAI from "openai";

// force Node runtime
export const runtime = "nodejs";

// correct import
const pdfParse = require("pdf-parse");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ FIX: add type
function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function splitIntoChunks(text: string, size: number = 1200): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

function sampleChunks(chunks: string[], count: number): string[] {
  const result: string[] = [];
  const step = Math.floor(chunks.length / count) || 1;
  for (let i = 0; i < chunks.length && result.length < count; i += step) {
    result.push(chunks[i]);
  }
  return result;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const topic: string = body.topic;
    const questionCount: number = body.questionCount || 10;

    const folderPath = path.join(process.cwd(), "library", topic);
    const files = fs.readdirSync(folderPath).filter((f: string) => f.endsWith(".pdf"));

    let fullText: string = "";

    for (const file of files) {
      const buffer = fs.readFileSync(path.join(folderPath, file));
      const pdf = await pdfParse(buffer);
      fullText += "\n" + pdf.text;
    }

    const cleaned = cleanText(fullText);
    const chunks = splitIntoChunks(cleaned);
    const sampled = sampleChunks(chunks, questionCount * 2);

    const prompt = `
Generate ${questionCount} LARE-style questions.

REQUIREMENTS:
- At least 40% must be SELECT ALL THAT APPLY
- Questions must come from DIFFERENT parts of the material
- Avoid repeating the same section

Return JSON only:
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

    const response = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const text = response.output_text;
    const json = JSON.parse(text);

    return Response.json(json);
  } catch (e: any) {
    return Response.json({ error: e.message });
  }
}
