"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type SavedState = {
  selectedTopic: string;
  questionCount: number;
  timerMode: boolean;
  secondsPerQuestion: number;
  questions: Question[];
  currentIndex: number;
  selectedAnswer: string | null;
  showExplanation: boolean;
  score: number;
  secondsLeft: number;
  missedQuestions: MissedQuestion[];
};

const STORAGE_KEY = "lare-quiz-progress-v2";

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sanitizeQuestion(raw: any): Question | null {
  if (
    !raw ||
    typeof raw.question !== "string" ||
    !Array.isArray(raw.options) ||
    typeof raw.answer !== "string" ||
    typeof raw.explanation !== "string"
  ) {
    return null;
  }

  const options = raw.options
    .filter((item: unknown) => typeof item === "string")
    .map((item: string) => item.trim())
    .filter(Boolean);

  if (!options.length) return null;

  const answer = raw.answer.trim();
  const normalizedOptions = options.includes(answer)
    ? options
    : [answer, ...options.filter((item) => item !== answer)];

  return {
    question: raw.question.trim(),
    options: shuffleArray(normalizedOptions),
    answer,
    explanation: raw.explanation.trim(),
  };
}

export default function Page() {
  const [topics, setTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const [questionCount, setQuestionCount] = useState(10);
  const [timerMode, setTimerMode] = useState(false);
  const [secondsPerQuestion, setSecondsPerQuestion] = useState(60);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [missedQuestions, setMissedQuestions] = useState<MissedQuestion[]>([]);

  const [status, setStatus] = useState("Choose a folder and click Generate Questions.");
  const [loading, setLoading] = useState(false);
  const [restored, setRestored] = useState(false);

  const timeoutHandledRef = useRef(false);

  useEffect(() => {
    async function loadTopics() {
      try {
        const response = await fetch("/api/library-topics");
        const data = await response.json();
        if (Array.isArray(data?.topics)) {
          setTopics(data.topics);
        } else {
          setStatus("Could not load library folders.");
        }
      } catch {
        setStatus("Could not load library folders.");
      }
    }

    loadTopics();
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        setRestored(true);
        return;
      }

      const parsed: SavedState = JSON.parse(saved);

      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        setSelectedTopic(parsed.selectedTopic || "");
        setQuestionCount(parsed.questionCount || 10);
        setTimerMode(Boolean(parsed.timerMode));
        setSecondsPerQuestion(parsed.secondsPerQuestion || 60);
        setQuestions(parsed.questions);
        setCurrentIndex(parsed.currentIndex || 0);
        setSelectedAnswer(parsed.selectedAnswer ?? null);
        setShowExplanation(Boolean(parsed.showExplanation));
        setScore(parsed.score || 0);
        setSecondsLeft(parsed.secondsLeft || parsed.secondsPerQuestion || 60);
        setMissedQuestions(Array.isArray(parsed.missedQuestions) ? parsed.missedQuestions : []);
        setStatus("Restored saved progress.");
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!restored) return;

    const snapshot: SavedState = {
      selectedTopic,
      questionCount,
      timerMode,
      secondsPerQuestion,
      questions,
      currentIndex,
      selectedAnswer,
      showExplanation,
      score,
      secondsLeft,
      missedQuestions,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    restored,
    selectedTopic,
    questionCount,
    timerMode,
    secondsPerQuestion,
    questions,
    currentIndex,
    selectedAnswer,
    showExplanation,
    score,
    secondsLeft,
    missedQuestions,
  ]);

  const currentQuestion = questions[currentIndex] ?? null;
  const quizFinished = questions.length > 0 && currentIndex >= questions.length;

  function resetQuizState() {
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setScore(0);
    setSecondsLeft(secondsPerQuestion);
    setMissedQuestions([]);
    timeoutHandledRef.current = false;
  }

  function handleStartOver() {
    resetQuizState();
    setStatus("Choose a folder and click Generate Questions.");
    localStorage.removeItem(STORAGE_KEY);
  }

  function handleTimeout() {
    if (!currentQuestion || timeoutHandledRef.current || showExplanation) return;

    timeoutHandledRef.current = true;
    setSelectedAnswer(null);
    setShowExplanation(true);
    setMissedQuestions((prev) => [
      ...prev,
      {
        question: currentQuestion.question,
        selectedAnswer: null,
        correctAnswer: currentQuestion.answer,
        explanation: currentQuestion.explanation,
      },
    ]);
  }

  useEffect(() => {
    if (!timerMode || !currentQuestion || showExplanation || quizFinished) return;

    timeoutHandledRef.current = false;

    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timerMode, currentQuestion, showExplanation, quizFinished]);

  async function handleGenerate() {
    if (!selectedTopic) {
      setStatus("Please choose a folder first.");
      return;
    }

    setLoading(true);
    setStatus("Generating questions...");
    resetQuizState();

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
        return;
      }

      const rawQuestions = Array.isArray(data?.questions) ? data.questions : [];
      const cleanQuestions = rawQuestions
        .map(sanitizeQuestion)
        .filter((item: Question | null): item is Question => Boolean(item));

      if (!cleanQuestions.length) {
        setStatus("No questions were generated.");
        return;
      }

      setQuestions(cleanQuestions);
      setSecondsLeft(secondsPerQuestion);
      setStatus(`Generated ${cleanQuestions.length} questions from ${selectedTopic}.`);
    } catch {
      setStatus("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function handleAnswer(option: string) {
    if (!currentQuestion || showExplanation) return;

    timeoutHandledRef.current = true;
    setSelectedAnswer(option);
    setShowExplanation(true);

    if (option === currentQuestion.answer) {
      setScore((prev) => prev + 1);
      return;
    }

    setMissedQuestions((prev) => [
      ...prev,
      {
        question: currentQuestion.question,
        selectedAnswer: option,
        correctAnswer: currentQuestion.answer,
        explanation: currentQuestion.explanation,
      },
    ]);
  }

  function handleNext() {
    timeoutHandledRef.current = false;
    setSelectedAnswer(null);
    setShowExplanation(false);
    setSecondsLeft(secondsPerQuestion);
    setCurrentIndex((prev) => prev + 1);
  }

  const progressPercent = useMemo(() => {
    if (!questions.length) return 0;
    const completed = showExplanation ? currentIndex + 1 : currentIndex;
    return Math.round((completed / questions.length) * 100);
  }, [questions.length, currentIndex, showExplanation]);

  if (!restored) {
    return (
      <div style={styles.page}>
        <div style={styles.wrapper}>
          <div style={styles.card}>
            <h1 style={styles.title}>LARE Quiz Builder</h1>
            <p style={styles.subtitle}>Loading…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrapper}>
        <div style={styles.headerBlock}>
          <h1 style={styles.title}>LARE Quiz Builder</h1>
          <p style={styles.subtitle}>
            Select a file group, generate questions, and review answers one at a time.
          </p>
        </div>

        {!questions.length ? (
          <div style={styles.stack}>
            <div style={styles.card}>
              <label style={styles.label}>Choose what to test</label>
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                style={styles.select}
              >
                <option value="">Select a folder</option>
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.card}>
              <label style={styles.label}>Number of questions</label>
              <input
                type="number"
                min={1}
                max={30}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value) || 10)}
                style={styles.input}
              />

              <div style={{ marginTop: 18 }}>
                <label style={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={timerMode}
                    onChange={(e) => setTimerMode(e.target.checked)}
                  />
                  Timer mode
                </label>
              </div>

              {timerMode && (
                <div style={{ marginTop: 18 }}>
                  <label style={styles.label}>Seconds per question</label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={secondsPerQuestion}
                    onChange={(e) => setSecondsPerQuestion(Number(e.target.value) || 60)}
                    style={styles.input}
                  />
                </div>
              )}

              <div style={{ marginTop: 24 }}>
                <button
                  onClick={handleGenerate}
                  disabled={loading}
                  style={{
                    ...styles.primaryButton,
                    opacity: loading ? 0.7 : 1,
                    cursor: loading ? "default" : "pointer",
                  }}
                >
                  {loading ? "Generating..." : "Generate Questions"}
                </button>
              </div>

              <p style={styles.status}>{status}</p>
            </div>
          </div>
        ) : quizFinished ? (
          <div style={styles.card}>
            <h2 style={styles.resultTitle}>Quiz Complete</h2>
            <p style={styles.resultText}>
              You got {score} out of {questions.length} correct.
            </p>
            <p style={styles.percentText}>{Math.round((score / questions.length) * 100)}%</p>

            {missedQuestions.length > 0 && (
              <div style={styles.reviewBox}>
                <h3 style={styles.reviewTitle}>Review Missed Questions</h3>
                {missedQuestions.map((item, index) => (
                  <div
                    key={`${item.question}-${index}`}
                    style={{
                      ...styles.reviewItem,
                      borderBottom:
                        index === missedQuestions.length - 1 ? "none" : "1px solid #f3c7d5",
                    }}
                  >
                    <p style={styles.reviewQuestion}>{item.question}</p>
                    <p style={styles.reviewLine}>
                      <strong>Your answer:</strong> {item.selectedAnswer ?? "No answer"}
                    </p>
                    <p style={{ ...styles.reviewLine, color: "#166534" }}>
                      <strong>Correct answer:</strong> {item.correctAnswer}
                    </p>
                    <p style={styles.reviewLine}>{item.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            <button onClick={handleStartOver} style={styles.primaryButton}>
              Start Over
            </button>
          </div>
        ) : currentQuestion ? (
          <div style={styles.card}>
            <div style={styles.topBar}>
              <strong>
                Question {currentIndex + 1} of {questions.length}
              </strong>
              <span>Score: {score}</span>
              {timerMode && <span>Time left: {secondsLeft}s</span>}
            </div>

            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${progressPercent}%`,
                }}
              />
            </div>

            <div style={styles.questionBox}>
              <p style={styles.questionText}>{currentQuestion.question}</p>
            </div>

            <div style={styles.answersWrap}>
              {currentQuestion.options.map((option, index) => {
                const isCorrect = showExplanation && option === currentQuestion.answer;
                const isWrong =
                  showExplanation &&
                  option === selectedAnswer &&
                  option !== currentQuestion.answer;

                return (
                  <button
                    key={`${option}-${index}`}
                    onClick={() => handleAnswer(option)}
                    disabled={showExplanation}
                    style={{
                      ...styles.answerButton,
                      ...(isCorrect ? styles.correctAnswer : {}),
                      ...(isWrong ? styles.wrongAnswer : {}),
                      cursor: showExplanation ? "default" : "pointer",
                    }}
                  >
                    <strong>{String.fromCharCode(65 + index)}.</strong> {option}
                  </button>
                );
              })}
            </div>

            {showExplanation && (
              <div style={styles.explanationBox}>
                <p style={styles.explanationTitle}>Explanation</p>
                <p style={styles.explanationText}>{currentQuestion.explanation}</p>
                <button onClick={handleNext} style={styles.secondaryButton}>
                  {currentIndex + 1 === questions.length ? "Finish Quiz" : "Next Question"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={styles.card}>
            <h2 style={styles.resultTitle}>LARE Quiz Builder</h2>
            <p style={styles.subtitle}>Something went wrong. Please start over.</p>
            <button onClick={handleStartOver} style={styles.primaryButton}>
              Start Over
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: 24,
    fontFamily: "Arial, sans-serif",
    color: "#111827",
  },
  wrapper: {
    maxWidth: 900,
    margin: "0 auto",
  },
  headerBlock: {
    marginBottom: 24,
  },
  title: {
    fontSize: 40,
    margin: 0,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    fontSize: 18,
    color: "#4b5563",
  },
  stack: {
    display: "grid",
    gap: 20,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #dbe3ee",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 4px 14px rgba(0,0,0,0.05)",
  },
  label: {
    display: "block",
    marginBottom: 10,
    fontWeight: 700,
    fontSize: 20,
  },
  select: {
    width: "100%",
    padding: 16,
    fontSize: 18,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
  },
  input: {
    width: 140,
    padding: 14,
    fontSize: 18,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 18,
    fontWeight: 700,
  },
  primaryButton: {
    padding: "16px 26px",
    fontSize: 20,
    fontWeight: 700,
    borderRadius: 14,
    border: "none",
    background: "#2563eb",
    color: "white",
    minWidth: 280,
    boxShadow: "0 6px 16px rgba(37,99,235,0.25)",
  },
  secondaryButton: {
    padding: "14px 22px",
    fontSize: 18,
    fontWeight: 700,
    borderRadius: 12,
    border: "none",
    background: "#111827",
    color: "white",
  },
  status: {
    marginTop: 18,
    marginBottom: 0,
    fontSize: 16,
    color: "#6b7280",
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
    fontSize: 18,
    alignItems: "center",
  },
  progressTrack: {
    width: "100%",
    height: 14,
    background: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 24,
  },
  progressFill: {
    height: "100%",
    background: "#2563eb",
    transition: "width 0.25s ease",
  },
  questionBox: {
    border: "1px solid #d1d5db",
    borderRadius: 14,
    padding: 22,
    marginBottom: 22,
    background: "#f8fafc",
  },
  questionText: {
    fontSize: 28,
    lineHeight: 1.4,
    margin: 0,
  },
  answersWrap: {
    display: "grid",
    gap: 14,
  },
  answerButton: {
    textAlign: "left",
    padding: 18,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#111827",
    fontSize: 18,
    fontWeight: 600,
    transition: "all 0.15s ease",
  },
  correctAnswer: {
    background: "#dcfce7",
    border: "2px solid #16a34a",
  },
  wrongAnswer: {
    background: "#fce7f3",
    border: "2px solid #e11d48",
  },
  explanationBox: {
    marginTop: 24,
    border: "1px solid #d1d5db",
    borderRadius: 14,
    padding: 20,
    background: "#f9fafb",
  },
  explanationTitle: {
    marginTop: 0,
    marginBottom: 10,
    fontWeight: 700,
    fontSize: 20,
  },
  explanationText: {
    fontSize: 17,
    lineHeight: 1.6,
    marginBottom: 18,
  },
  resultTitle: {
    fontSize: 34,
    marginTop: 0,
    marginBottom: 14,
  },
  resultText: {
    fontSize: 22,
    marginBottom: 8,
  },
  percentText: {
    fontSize: 30,
    fontWeight: 700,
    color: "#2563eb",
    marginTop: 0,
    marginBottom: 22,
  },
  reviewBox: {
    marginBottom: 24,
    padding: 20,
    borderRadius: 14,
    border: "1px solid #fbcfe8",
    background: "#fff1f2",
  },
  reviewTitle: {
    marginTop: 0,
    fontSize: 24,
  },
  reviewItem: {
    marginBottom: 18,
    paddingBottom: 18,
  },
  reviewQuestion: {
    fontWeight: 700,
    marginBottom: 8,
  },
  reviewLine: {
    margin: "4px 0",
    fontSize: 16,
    lineHeight: 1.5,
  },
};
