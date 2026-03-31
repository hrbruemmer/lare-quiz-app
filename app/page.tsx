"use client";

import { useEffect, useMemo, useState } from "react";

type Question = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

type MissedQuestion = {
  question: string;
  selectedAnswer: string | null;
  correctAnswer: string;
  explanation: string;
};

function shuffleArray<T>(items: T[]) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function Page() {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<MissedQuestion[]>([]);
const [seconds, setSeconds] = useState(60);
  const [timerOn, setTimerOn] = useState(false);

  useEffect(() => {
    fetch("/api/library-topics")
      .then((r) => r.json())
      .then((d) => setTopics(d.topics || []));
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

  function handleTimeout() {
    const q = questions[current];
    setShowExplanation(true);
    setMissed((m) => [
      ...m,
      {
        question: q.question,
        selectedAnswer: null,
        correctAnswer: q.answer,
        explanation: q.explanation,
      },
    ]);
  }

  async function generate() {
    const res = await fetch("/api/library-quiz", {
      method: "POST",
      body: JSON.stringify({ topic: selectedTopic, questionCount }),
    });
function answer(option: string) {
    if (showExplanation) return;

    const q = questions[current];
    setSelectedAnswer(option);
    setShowExplanation(true);

    if (option === q.answer) {
      setScore((s) => s + 1);
    } else {
      setMissed((m) => [
        ...m,
        {
          question: q.question,
          selectedAnswer: option,
          correctAnswer: q.answer,
          explanation: q.explanation,
        },
      ]);
    }
  }

  function next() {
    setCurrent((c) => c + 1);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setSeconds(60);
  }

  if (!questions.length) {
    return (
      <div style={{ padding: 30 }}>
        <h1>LARE Quiz Builder</h1>

        <select onChange={(e) => setSelectedTopic(e.target.value)}>
          <option>Select folder</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <br /><br />

        <button onClick={generate}>Generate Questions</button>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", fontFamily: "Arial" }}>
      <h2>Score: {score}</h2>
      {timerOn && <p>Time: {seconds}</p>}

      <div style={{ height: 10, background: "#eee", marginBottom: 20 }}>
        <div style={{
          width: `${((current + 1) / questions.length) * 100}%`,
          height: "100%",
          background: "#2563eb"
        }} />
      </div>

      <h3>{q.question}</h3>

      {q.options.map((o, i) => {
        let bg = "#fff";

        if (showExplanation) {
          if (o === q.answer) bg = "#d1fae5";
          else if (o === selectedAnswer) bg = "#fecaca";
        }

        return (
          <button key={i} onClick={() => answer(o)}
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 12, background: bg }}>
            {o}
          </button>
        );
      })}

      {showExplanation && (
        <div>
          <p>{q.explanation}</p>
          <button onClick={next}>Next</button>
        </div>
      )}

{current >= questions.length - 1 && showExplanation && (
        <div>
          <h3>Review Missed</h3>
          {missed.map((m, i) => (
            <div key={i}>
              <p>{m.question}</p>
              <p>Correct: {m.correctAnswer}</p>
              <p>{m.explanation}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
  }