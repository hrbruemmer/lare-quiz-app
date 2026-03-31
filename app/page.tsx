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

  function startQuiz() {
    fetch(`/api/questions?topic=${selectedTopic}&count=${questionCount}`)
      .then((r) => r.json())
      .then((data) => {
        const formatted = data.questions.map((raw: any) => {
          const { question, options, answer, explanation } = raw;

          const normalizedOptions = options.includes(answer)
            ? options
            : [answer, ...options.filter((item: string) => item !== answer)];

          return {
            question: question.trim(),
            options: shuffleArray(normalizedOptions),
            answer,
            explanation,
          };
        });

        setQuestions(formatted);
        setCurrent(0);
        setScore(0);
        setMissed([]);
        setTimerOn(true);
        setSeconds(60);
      });
  }

  function answer(opt: string) {
    if (showExplanation) return;

    const q = questions[current];
    setSelectedAnswer(opt);
    setShowExplanation(true);

    if (opt === q.answer) {
      setScore((s) => s + 1);
    } else {
      setMissed((m) => [
        ...m,
        {
          question: q.question,
          selectedAnswer: opt,
          correctAnswer: q.answer,
          explanation: q.explanation,
        },
      ]);
    }
  }

  function next() {
    setShowExplanation(false);
    setSelectedAnswer(null);
    setSeconds(60);

    if (current + 1 < questions.length) {
      setCurrent((c) => c + 1);
    } else {
      setTimerOn(false);
    }
  }

  if (!questions.length) {
    return (
      <div style={{ padding: 20 }}>
        <h1>LARE Quiz</h1>

        <select onChange={(e) => setSelectedTopic(e.target.value)}>
          <option>Select Topic</option>
          {topics.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>

        <br />
        <br />

        <button onClick={startQuiz}>Start Quiz</button>
      </div>
    );
  }

  const q = questions[current];

  return (
    <div style={{ padding: 20 }}>
      <h2>
        Question {current + 1} / {questions.length}
      </h2>

      <p>{q.question}</p>

      {q.options.map((opt, i) => (
        <button
          key={i}
          onClick={() => answer(opt)}
          style={{ display: "block", width: "100%", marginBottom: 10 }}
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
