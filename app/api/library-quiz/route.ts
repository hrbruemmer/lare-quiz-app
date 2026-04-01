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

declare global {
  // eslint-disable-next-line no-var
  var DOMMatrix: any;
  // eslint-disable-next-line no-var
  var ImageData: any;
  // eslint-disable-next-line no-var
  var Path2D: any;
}

function installPdfPolyfills() {
  if (typeof global.DOMMatrix === "undefined") {
    class SimpleDOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;

      constructor(_init?: unknown) {}

      multiplySelf() {
        return this;
      }

      preMultiplySelf() {
        return this;
      }

      translateSelf() {
        return this;
      }

      scaleSelf() {
        return this;
      }

      rotateSelf() {
        return this;
      }

      invertSelf() {
        return this;
      }

      transformPoint(point: unknown) {
        return point;
      }
    }

    global.DOMMatrix = SimpleDOMMatrix;
  }

  if (typeof global.ImageData === "undefined") {
    global.ImageData = class ImageDataPolyfill {
      data: Uint8ClampedArray;
      width: number;
      height: number;

      constructor(
        dataOrWidth: Uint8ClampedArray | number,
        widthOrHeight: number,
        maybeHeight?: number
      ) {
        if (typeof dataOrWidth === "number") {
          this.width = dataOrWidth;
          this.height = widthOrHeight;
          this.data = new Uint8ClampedArray(this.width * this.height * 4);
        } else {
          this.data = dataOrWidth;
          this.width = widthOrHeight;
          this.height = maybeHeight ?? 1;
        }
      }
    };
  }

  if (typeof global.Path2D === "undefined") {
    global.Path2D = class Path2DPolyfill {
      constructor(_path?: unknown) {}
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      rect() {}
      roundRect() {}
      arc() {}
      arcTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      ellipse() {}
    };
  }
}

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
    const fenced = text.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        return null;
      }
    }
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

    const files = fs
      .readdirSync(folderPath)
      .filter((file: string) => file.toLowerCase().endsWith(".pdf"));

    if (!files.length) {
      return Response.json({ error: "No PDF files found in that folder." }, { status: 400 });
    }

    let fullText = "";

    installPdfPolyfills();
    const pdfParse = require("pdf-parse");

    for (const file of files) {
      const buffer = fs.readFileSync(path.join(folderPath, file));
      const pdf = await pdfParse(buffer);
      fullText += "\n" + (pdf.text || "");
    }

    const cleaned = cleanText(fullText);

    if (!cleaned) {
      return Response.json({ error: "Could not read text from PDF." }, { status: 500 });
    }

    const chunks = splitIntoChunks(cleaned, 1400);
    const sampled = sampleChunks(chunks, Math.max(10, questionCount * 2));

    const prompt = `
Generate ${questionCount} LARE-style study questions from the source text below.

Requirements:
- At least 40 percent must be SELECT ALL THAT APPLY questions with more than one correct answer.
- Questions must come from DIFFERENT parts of the material.
- Avoid repeating the same section or idea.
- Questions should help someone review important exam-relevant information.
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

SOURCE TEXT:
${sampled.join("\n---\n")}
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

    return Response.json({ questions: parsed.questions });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return Response.json({ error: message }, { status: 500 });
  }
}
