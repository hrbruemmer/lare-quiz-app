// FULL ENHANCED VERSION (SAFE + FEATURES)
"use client";

import { useState, useEffect } from "react";

type Question = {
  question: string;
  options: string[];
  answer: string | string[];
  explanation: string;
  multi?: boolean;
};

export default function Page() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [count, setCount] = useState(5);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    setQuestions([
      {
        question: "Which factors affect drainage? (Select all)",
        options: ["Slope", "Soil type", "Color", "Sunlight"],
        answer: ["Slope", "Soil type"],
        explanation: "Drainage depends on slope and soil permeability.",
        multi: true
      },
      {
        question: "What is grading primarily concerned with?",
        options: ["Soil color", "Elevation", "Planting", "Lighting"],
        answer: "Elevation",
        explanation: "Grading controls elevation and drainage."
      }
    ]);
  }, []);

  function startQuiz() {
    setStarted(true);
    setCurrent(0);
    setScore(0);
    setSelected([]);
  }

  function toggle(option: string) {
    if (showExplanation) return;

    setSelected((prev) =>
      prev.includes(option)
        ? prev.filter((o) => o !== option)
        : [...prev, option]
    );
  }

  function submitAnswer() {
    const q = questions[current];
    setShowExplanation(true);

    if (q.multi) {
      const correct = q.answer as string[];
      const isCorrect =
        correct.length === selected.length &&
        correct.every((a) => selected.includes(a));

      if (isCorrect) setScore(score + 1);
    } else {
      if (selected[0] === q.answer) setScore(score + 1);
    }
  }

  function next() {
    setSelected([]);
    setShowExplanation(false);

    if (current + 1 < count) {
      setCurrent(current + 1);
    } else {
      setStarted(false);
      alert(`Score: ${score}/${count}`);
    }
  }

  if (!started) {
    return (
      <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "Arial" }}>
        <h1>LARE Quiz</h1>

        <label>Number of Questions</label>
        <input
          type="number"
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
        />

        <br /><br />

        <button onClick={startQuiz}>Start Quiz</button>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "Arial" }}>
      <h2>Question {current + 1}</h2>

      <p>{q.question}</p>

      {q.options.map((opt, i) => {
        const isSelected = selected.includes(opt);

        let bg = "#eee";
        if (showExplanation) {
          if (Array.isArray(q.answer) && q.answer.includes(opt)) bg = "#c8f7c5";
          else if (isSelected) bg = "#f7c5c5";
        }

        return (
          <button
            key={i}
            onClick={() => toggle(opt)}
            style={{
              display: "block",
              width: "100%",
              marginBottom: 10,
              padding: 10,
              background: bg
            }}
          >
            {opt}
          </button>
        );
      })}

      {!showExplanation && (
        <button onClick={submitAnswer}>Submit</button>
      )}

      {showExplanation && (
        <div>
          <p>{q.explanation}</p>
          <button onClick={next}>Next</button>
        </div>
      )}
    </div>
  );
}
