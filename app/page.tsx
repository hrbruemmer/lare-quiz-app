"use client";

import { useEffect, useState } from "react";

type Question = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

export default function Page() {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Choose a folder and click Generate Questions.");
  const [current, setCurrent] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);

  useEffect(() => {
    fetch("/api/library-topics")
      .then((res) => res.json())
      .then((data) => {
        setTopics(Array.isArray(data?.topics) ? data.topics : []);
      })
      .catch(() => {
        setStatus("Could not load library folders.");
      });
  }, []);

  async function handleGenerate() {
    if (!selectedTopic) {
      setStatus("Please choose a folder first.");
      return;
    }

    setLoading(true);
    setStatus("Generating questions...");
    setQuestions([]);
    setCurrent(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore(0);

    try {
      const response = await fetch("/api/library-quiz", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topic: selectedTopic,
          questionCount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data?.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      const items = Array.isArray(data?.questions) ? data.questions : [];

      if (!items.length) {
        setStatus("No questions were generated.");
        setLoading(false);
        return;
      }

      setQuestions(items);
      setStatus(`Generated ${items.length} questions from ${selectedTopic}.`);
    } catch {
      setStatus("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleAnswer(option: string) {
    if (showExplanation) return;

    setSelectedAnswer(option);
    setShowExplanation(true);

    if (option === questions[current].answer) {
      setScore((s) => s + 1);
    }
  }

  function handleNext() {
    setCurrent((c) => c + 1);
    setSelectedAnswer(null);
    setShowExplanation(false);
  }

  function handleStartOver() {
    setQuestions([]);
    setCurrent(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore(0);
    setStatus("Choose a folder and click Generate Questions.");
  }

  const question = questions[current];

  return (
    <div
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: 32,
        fontFamily: "Arial, sans-serif",
        color: "#1f2937",
      }}
    >
      <h1 style={{ fontSize: 40, marginBottom: 8 }}>LARE Quiz Builder</h1>
      <p style={{ marginTop: 0, marginBottom: 24, fontSize: 18, color: "#4b5563" }}>
        Select a file group, generate questions, and review answers one at a time.
      </p>

      {questions.length === 0 ? (
        <div style={{ display: "grid", gap: 20 }}>
          <div
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 18,
              padding: 24,
              background: "#ffffff",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: 10,
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              Choose what to test
            </label>
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              style={{
                width: "100%",
                padding: 16,
                fontSize: 18,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              <option value="">Select a folder</option>
              {topics.map((topic) => (
                <option key={topic} value={topic}>
                  {topic}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 18,
              padding: 24,
              background: "#ffffff",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
            }}
          >
            <label
              style={{
                display: "block",
                marginBottom: 10,
                fontWeight: 700,
                fontSize: 20,
              }}
            >
              Number of questions
            </label>
            <input
              type="number"
              min={5}
              max={30}
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value) || 10)}
              style={{
                width: 120,
                padding: 14,
                fontSize: 18,
                borderRadius: 12,
                border: "1px solid #cbd5e1",
              }}
            />

            <div style={{ marginTop: 24 }}>
              <button
                onClick={handleGenerate}
                disabled={loading}
                style={{
                  padding: "16px 24px",
                  fontSize: 20,
                  fontWeight: 700,
                  borderRadius: 14,
                  border: "none",
                  background: loading ? "#94a3b8" : "#2563eb",
                  color: "white",
                  cursor: loading ? "default" : "pointer",
                  minWidth: 260,
                }}
              >
                {loading ? "Generating..." : "Generate Questions"}
              </button>
            </div>

            <p style={{ marginTop: 18, fontSize: 16, color: "#6b7280" }}>{status}</p>
          </div>
        </div>
      ) : current < questions.length ? (
        <div
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 18,
            padding: 28,
            background: "#ffffff",
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              marginBottom: 24,
              fontSize: 18,
            }}
          >
            <strong>
              Question {current + 1} of {questions.length}
            </strong>
            <span>Score: {score}</span>
          </div>

          <div
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 14,
              padding: 20,
              marginBottom: 20,
              background: "#f8fafc",
            }}
          >
            <p style={{ fontSize: 26, lineHeight: 1.4, margin: 0 }}>{question.question}</p>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {question.options.map((option, index) => {
              const isCorrect = showExplanation && option === question.answer;
              const isWrong = showExplanation && option === selectedAnswer && option !== question.answer;

              let background = "#ffffff";
              let border = "1px solid #cbd5e1";
              let color = "#111827";

              if (isCorrect) {
                background = "#dcfce7";
                border = "2px solid #16a34a";
              } else if (isWrong) {
                background = "#fce7f3";
                border = "2px solid #e11d48";
              }

              return (
                <button
                  key={index}
                  onClick={() => handleAnswer(option)}
                  disabled={showExplanation}
                  style={{
                    textAlign: "left",
                    padding: 18,
                    borderRadius: 14,
                    border,
                    background,
                    color,
                    fontSize: 18,
                    cursor: showExplanation ? "default" : "pointer",
                    fontWeight: 600,
                  }}
                >
                  <strong>{String.fromCharCode(65 + index)}.</strong> {option}
                </button>
              );
            })}
          </div>

          {showExplanation && (
            <div
              style={{
                marginTop: 24,
                border: "1px solid #d1d5db",
                borderRadius: 14,
                padding: 20,
                background: "#f9fafb",
              }}
            >
              <p style={{ marginTop: 0, fontWeight: 700, fontSize: 20 }}>Explanation</p>
              <p style={{ fontSize: 17, lineHeight: 1.5 }}>{question.explanation}</p>

              <button
                onClick={handleNext}
                style={{
                  marginTop: 8,
                  padding: "14px 22px",
                  fontSize: 18,
                  fontWeight: 700,
                  borderRadius: 12,
                  border: "none",
                  background: "#111827",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                {current + 1 === questions.length ? "Finish Quiz" : "Next Question"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 18,
            padding: 28,
            background: "#ffffff",
            boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
          }}
        >
          <h2 style={{ fontSize: 32, marginTop: 0 }}>Quiz Complete</h2>
          <p style={{ fontSize: 22 }}>
            You got {score} out of {questions.length} correct.
          </p>
          <p style={{ fontSize: 28, fontWeight: 700, color: "#2563eb" }}>
            {Math.round((score / questions.length) * 100)}%
          </p>

          <button
            onClick={handleStartOver}
            style={{
              padding: "14px 22px",
              fontSize: 18,
              fontWeight: 700,
              borderRadius: 12,
              border: "none",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            Start Over
          </button>
        </div>
      )}
    </div>
  );
}