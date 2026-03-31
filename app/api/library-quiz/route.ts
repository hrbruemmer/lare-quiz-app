import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { topic, questionCount } = await req.json();

    const text = `
Landscape architecture principles including grading, drainage,
planting design, and site analysis.
`;

    const prompt = `
Create ${questionCount} LARE-style multiple choice questions.

- Use exactly 4 answer choices
- Only one correct answer
- Include a short explanation
- Return valid JSON only

Return exactly this shape:
{
  "questions": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answer": "exact option text",
      "explanation": "..."
    }
  ]
}

TEXT:
${text}
`;

    const completion = await client.responses.create({
      model: "gpt-5",
      input: prompt,
    });

    const raw = completion.output_text;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return Response.json(
        { error: `Invalid JSON: ${raw.slice(0, 200)}` },
        { status: 500 }
      );
    }

    return Response.json(parsed);
  } catch (err: any) {
    console.error(err);
    return Response.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}