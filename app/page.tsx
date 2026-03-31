"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

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

type SavedProgress = {
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

type RawQuestion = {
  question?: unknown;
  options?: unknown;
  answer?: unknown;
  explanation?: unknown;
};

const STORAGE_KEY = "lare-quiz-progress-v3";

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeQuestion(raw: RawQuestion): Question | null {
  if (
    typeof raw.question !== "string" ||
    !Array.isArray(raw.options) ||
    typeof raw.answer !== "string" ||
    typeof raw.explanation !== "string"
  ) {
    return null;
  }

  const question = raw.question.trim();
  const answer = raw.answer.trim();
  const explanation = raw.explanation.trim();

  const options = raw.options
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!question || !answer || !explanation) return null;

  const normalizedOptions = options.includes(answer)
    ? options
    : [answer, ...options.filter((item) => item !== answer)];

  if (!normalizedOptions.length) return null;

  return {
    question,
    answer,
    explanation,
    options: shuffleArray(normalizedOptions),
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
        const data: unknown = await response.json();

        if (
          typeof data === "object" &&
          data !== null &&
          "topics" in data &&
          Array.isArray((data as { topics: unknown }).topics)
        ) {
          const cleanTopics = ((data as { topics: unknown[] }).topics)
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean);

          setTopics(cleanTopics);
          if (!cleanTopics.length) {
            setStatus("No folders were found in the library.");
          }
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
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setRestored(true);
        return;
      }

      const parsed = JSON.parse(raw) as SavedProgress;

      if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
        setRestored(true);
        return;
      }

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
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!restored) return;

    const snapshot: SavedProgress = {
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

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
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

  const quizFinished = questions.length > 0 && currentIndex >= questions.length;
  const currentQuestion = !quizFinished ? questions[currentIndex] ?? null : null;

  function clearQuizState() {
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
    clearQuizState();
    setStatus("Choose a folder and click Generate Questions.");
    window.localStorage.removeItem(STORAGE_KEY);
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
    clearQuizState();

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

      const data: unknown = await response.json();

      if (!response.ok) {
        if (typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string") {
          setStatus((data as { error: string }).error);
        } else {
          setStatus("Something went wrong while generating questions.");
        }
        return;
      }

      let rawQuestions: RawQuestion[] = [];

      if (
        typeof data === "object" &&
        data !== null &&
        "questions" in data &&
        Array.isArray((data as { questions: unknown }).questions)
      ) {
        rawQuestions = (data as { questions: RawQuestion[] }).questions;
      }

      const cleanQuestions = rawQuestions
        .map(normalizeQuestion)
        .filter((item): item is Question => item !== null);

      if (!cleanQuestions.length) {
        setStatus("No questions were generated.");
        return;
      }

      setQuestions(cleanQuestions);
      setSecondsLeft(secondsPerQuestion);
      setStatus(`Generated ${cleanQuestions.length} questions from ${selectedTopic}.`);
    } catch {
      setStatus("Something went wrong while generating questions.");
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
            Select a file group, choose how many questions you want, and review the answers one at a time.
          </p>
        </div>

        {!questions.length ? (
          <div style={styles.stack}>
            <div style={styles.card}>
              <label style={styles.label}>Choose what to test</label>
              <select
                value={selectedTopic}
                onChange={(event) => setSelectedTopic(event.target.value)}
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
                onChange={(event) => setQuestionCount(Number(event.target.value) || 10)}
                style={styles.input}
              />

              <div style={{ marginTop: 18 }}>
                <label style={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={timerMode}
                    onChange={(event) => setTimerMode(event.target.checked)}
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
                    onChange={(event) => setSecondsPerQuestion(Number(event.target.value) || 60)}
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
                    opacity: loading ? 0.72 : 1,
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

            <div style={styles.buttonRow}>
              <button onClick={handleStartOver} style={styles.primaryButton}>
                Start Over
              </button>
            </div>
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
              <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
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

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #eef4ff 0%, #f8fafc 45%, #ffffff 100%)",
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
    fontSize: 42,
    margin: 0,
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 0,
    fontSize: 18,
    color: "#475569",
    lineHeight: 1.5,
  },
  stack: {
    display: "grid",
    gap: 20,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #dbe3ee",
    borderRadius: 20,
    padding: 26,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  label: {
    display: "block",
    marginBottom: 10,
    fontWeight: 700,
    fontSize: 20,
    color: "#0f172a",
  },
  select: {
    width: "100%",
    padding: 16,
    fontSize: 18,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#111827",
  },
  input: {
    width: 160,
    padding: 14,
    fontSize: 18,
    borderRadius: 12,
    border: "1px solid #cbd5e1",
    color: "#111827",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 18,
    fontWeight: 700,
    color: "#0f172a",
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
    boxShadow: "0 10px 20px rgba(37,99,235,0.22)",
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
  buttonRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  status: {
    marginTop: 18,
    marginBottom: 0,
    fontSize: 16,
    color: "#64748b",
    lineHeight: 1.5,
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 18,
    fontSize: 18,
    alignItems: "center",
    color: "#0f172a",
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
    background: "linear-gradient(90deg, #2563eb 0%, #3b82f6 100%)",
    transition: "width 0.25s ease",
  },
  questionBox: {
    border: "1px solid #dbe3ee",
    borderRadius: 16,
    padding: 24,
    marginBottom: 22,
    background: "#f8fbff",
  },
  questionText: {
    fontSize: 28,
    lineHeight: 1.45,
    margin: 0,
    color: "#0f172a",
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
    background: "#ffe4ec",
    border: "2px solid #e11d48",
  },
  explanationBox: {
    marginTop: 24,
    border: "1px solid #dbe3ee",
    borderRadius: 16,
    padding: 22,
    background: "#f9fafb",
  },
  explanationTitle: {
    marginTop: 0,
    marginBottom: 10,
    fontWeight: 700,
    fontSize: 20,
    color: "#0f172a",
  },
  explanationText: {
    fontSize: 17,
    lineHeight: 1.65,
    marginBottom: 18,
    color: "#334155",
  },
  resultTitle: {
    fontSize: 34,
    marginTop: 0,
    marginBottom: 14,
    color: "#0f172a",
  },
  resultText: {
    fontSize: 22,
    marginBottom: 8,
    color: "#334155",
  },
  percentText: {
    fontSize: 34,
    fontWeight: 700,
    color: "#2563eb",
    marginTop: 0,
    marginBottom: 22,
  },
  reviewBox: {
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
    border: "1px solid #fbcfe8",
    background: "#fff1f2",
  },
  reviewTitle: {
    marginTop: 0,
    fontSize: 24,
    color: "#881337",
  },
  reviewItem: {
    marginBottom: 18,
    paddingBottom: 18,
  },
  reviewQuestion: {
    fontWeight: 700,
    marginBottom: 8,
    color: "#1f2937",
  },
  reviewLine: {
    margin: "4px 0",
    fontSize: 16,
    lineHeight: 1.5,
    color: "#334155",
  },
};
