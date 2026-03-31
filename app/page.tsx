"use client";

import { useEffect, useState } from "react";

type Question = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

type Missed = {
  question: string;
  correct: string;
  explanation: string;
};

export default function Page() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Missed[]>([]);
  const [seconds, setSeconds] = useState(30);
  const [timerOn, setTimerOn] = useState(false);

  useEffect(() => {
    // SIMPLE HARD-CODED QUESTIONS (so it ALWAYS works)
    setQuestions([
      {
        question: "What is grading primarily concerned with?",
        options: ["Soil color", "Elevation", "Planting", "Irrigation"],
        answer: "Elevation",
        explanation: "Grading deals with land elevation and drainage."
      },
      {
        question: "Which is best for drainage?",
        options: ["Flat surface", "Positive slope", "Negative slope", "Clay soil"],
        answer: "Positive slope",
        explanation: "Water must flow away from structures."
      }
    ]);
  }, []);

  useEffect(() => {
    if (!timerOn || showExplanation) return;

    const t = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          handleTimeout();
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [timerOn, showExplanation]);

  function start() {
    setTimerOn(true);
    setSeconds(30);
    setCurrent(0);
    setScore(0);
    setMissed([]);
  }

  function handleTimeout() {
    const q = questions[current];
    setShowExplanation(true);
    setMissed((m) => [...m, {
      question: q.question,
      correct: q.answer,
      explanation: q.explanation
    }]);
  }

  function answer(opt: string) {
    if (showExplanation) return;

    const q = questions[current];
    setSelected(opt);
    setShowExplanation(true);

    if (opt === q.answer) {
      setScore((s) => s + 1);
    } else {
      setMissed((m) => [...m, {
        question: q.question,
        correct: q.answer,
        explanation: q.explanation
      }]);
    }
  }

  function next() {
    setSelected(null);
    setShowExplanation(false);
    setSeconds(30);

    if (current + 1 < questions.length) {
      setCurrent((c) => c + 1);
    } else {
      setTimerOn(false);
    }
  }

  if (!timerOn) {
    return (
      <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "Arial" }}>
        <h1>LARE Quiz</h1>
        <button onClick={start}>Start Quiz</button>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", fontFamily: "Arial" }}>
      <h2>Question {current + 1}</h2>
      <p><b>Time:</b> {seconds}</p>

      <p>{q.question}</p>

      {q.options.map((opt, i) => (
        <button
          key={i}
          onClick={() => answer(opt)}
          style={{
            display: "block",
            width: "100%",
            marginBottom: 10,
            padding: 10,
            background:
              showExplanation && opt === q.answer
                ? "#c8f7c5"
                : showExplanation && opt === selected
                ? "#f7c5c5"
                : "#eee"
          }}
        >
          {opt}
        </button>
      ))}

      {showExplanation && (
        <div>
          <p>{q.explanation}</p>
          <button onClick={next}>Next</button>
        </div>
      )}

      {!timerOn && (
        <div>
          <h3>Score: {score}</h3>
          <h3>Missed</h3>
          {missed.map((m, i) => (
            <div key={i}>
              <p>{m.question}</p>
              <p>Correct: {m.correct}</p>
              <p>{m.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
