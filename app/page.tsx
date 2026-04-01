// FULL PAGE FILE WITH MISSED-ONLY MODE + LOCAL STORAGE

"use client";

import { useEffect, useState } from "react";

type Question = {
  question: string;
  options: string[];
  answer: string[];
  explanation: string;
  multi: boolean;
};

export default function Page() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [missed, setMissed] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [showAnswer, setShowAnswer] = useState(false);
  const [useMissed, setUseMissed] = useState(false);
  const [loading, setLoading] = useState(false);

  // LOAD MISSED FROM LOCAL STORAGE
  useEffect(() => {
    const saved = localStorage.getItem("missedQuestions");
    if (saved) {
      setMissed(JSON.parse(saved));
    }
  }, []);

  // SAVE MISSED TO LOCAL STORAGE
  useEffect(() => {
    localStorage.setItem("missedQuestions", JSON.stringify(missed));
  }, [missed]);

  async function generateQuestions() {
    setLoading(true);
    setUseMissed(false);

    const res = await fetch("/api/library-quiz", {
      method: "POST",
      body: JSON.stringify({
        topic: "Construction Documentation & Administration",
        questionCount: 5,
      }),
    });

    const data = await res.json();
    setQuestions(data.questions || []);
    setCurrent(0);
    setSelected([]);
    setShowAnswer(false);
    setLoading(false);
  }

  function toggleOption(option: string) {
    if (selected.includes(option)) {
      setSelected(selected.filter((o) => o !== option));
    } else {
      setSelected([...selected, option]);
    }
  }

  function submitAnswer() {
    setShowAnswer(true);

    const correct = questions[current].answer;
    const isCorrect =
      selected.length === correct.length &&
      selected.every((s) => correct.includes(s));

    if (!isCorrect) {
      setMissed((prev) => [...prev, questions[current]]);
    }
  }

  function nextQuestion() {
    setCurrent(current + 1);
    setSelected([]);
    setShowAnswer(false);
  }

  function startMissedMode() {
    setQuestions(missed);
    setUseMissed(true);
    setCurrent(0);
    setSelected([]);
    setShowAnswer(false);
  }

  if (loading) return <div>Generating questions...</div>;

  if (!questions.length)
    return (
      <div>
        <button onClick={generateQuestions}>Generate Questions</button>
        <button onClick={startMissedMode} disabled={!missed.length}>
          Review Missed ({missed.length})
        </button>
      </div>
    );

  const q = questions[current];

  return (
    <div style={{ padding: 20 }}>
      <h2>
        Question {current + 1} / {questions.length}
        {useMissed && " (Missed Mode)"}
      </h2>

      <p>{q.question}</p>

      {q.options.map((opt, i) => (
        <div key={i}>
          <label>
            <input
              type={q.multi ? "checkbox" : "radio"}
              checked={selected.includes(opt)}
              onChange={() => toggleOption(opt)}
            />
            {opt}
          </label>
        </div>
      ))}

      {!showAnswer && (
        <button onClick={submitAnswer}>Submit</button>
      )}

      {showAnswer && (
        <div>
          <p><strong>Answer:</strong> {q.answer.join(", ")}</p>
          <p>{q.explanation}</p>
          <button onClick={nextQuestion}>Next</button>
        </div>
      )}
    </div>
  );
}
