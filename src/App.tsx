import React, { useState } from 'react';

import './index.css';

// --- Type Definitions ---
// Based on your backend's expected JSON structure

interface McqQuestion {
  No: number;
  Q: string;
  Options: string[];
}

interface ApiMcqResponse {
  questionType: "MCQ";
  QuestionArray: McqQuestion[];
  AnswerArray: string[]; // This holds the correct answers, e.g., "B"
}

interface ApiSubjectiveResponse {
  questionType: "Subjective";
  QuestionArray: string[];
}

// A union type for the API data
type ApiResponseData = ApiMcqResponse | ApiSubjectiveResponse;

// The full API response structure
interface FullApiResponse {
  status: "success";
  data: ApiResponseData;
}

// Type for storing user's answers
interface UserAnswers {
  [questionIndex: number]: string; // e.g., { 0: "A", 1: "My subjective answer" }
}

// The base URL for our backend API
// This will be proxied by Vite to http://localhost:8080 (as per setup guide)
const API_BASE_URL = '/api/ai';

// --- Main App Component ---
export default function App() {
  // --- State Variables ---

  // 1. UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2. Quiz Setup State
  const [quizConfig, setQuizConfig] = useState({
    exam: "UPSC",
    q_no: 5,
    difficulty: "Medium",
    topic: "Indian Monsoon",
    questionType: "MCQ",
  });

  // 3. Quiz Active State
  const [questions, setQuestions] = useState<ApiResponseData | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  // --- Event Handlers ---

  /**
   * Updates the quiz configuration form
   */
  const handleConfigChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    setQuizConfig(prevConfig => ({
      ...prevConfig,
      [name]: type === 'number' ? parseInt(value, 10) : value,
    }));
  };

  /**
   * Fetches the quiz questions from the backend API
   */
  const handleStartQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setQuestions(null);
    setUserAnswers({});
    setCurrentQuestionIndex(0);
    setIsSubmitted(false);

    try {
      const response = await fetch(`${API_BASE_URL}/generate-questions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quizConfig),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const result: FullApiResponse = await response.json();

      if (result.status === 'success') {
        setQuestions(result.data);
      } else {
        // Handle cases where the server returns a 200 OK but a business logic error
        // @ts-expect-error - 'data' might be an error object from the backend
        throw new Error(result.data?.message || 'Failed to parse quiz data');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Updates the user's answer for the current question
   */
  const handleAnswerChange = (value: string) => {
    setUserAnswers(prevAnswers => ({
      ...prevAnswers,
      [currentQuestionIndex]: value,
    }));
  };

  /**
   * Navigates to the next question
   */
  const handleNextQuestion = () => {
    if (!questions) return;
    
    const totalQuestions = questions.questionType === 'MCQ'
      ? questions.QuestionArray.length
      : questions.QuestionArray.length;

    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
    }
  };

  /**
   * Navigates to the previous question
   */
  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prevIndex => prevIndex - 1);
    }
  };

  /**
   * Submits the quiz and shows the results
   */
  const handleSubmitQuiz = () => {
    setIsSubmitted(true);
    // In a real app, you might calculate the score here, especially for MCQs
    console.log("Quiz Submitted! Answers:", userAnswers);
  };

  // --- Render Functions ---

  /**
   * Renders the initial form to configure and start the quiz
   */
  const renderSetupForm = () => (
    <div className="w-full max-w-xl p-8 space-y-6 bg-white shadow-lg rounded-2xl">
      <h2 className="text-3xl font-bold text-center text-gray-800">
        AI Exam Generator
      </h2>
      <form onSubmit={handleStartQuiz} className="space-y-4">
        <div>
          <label htmlFor="exam" className="block text-sm font-medium text-gray-700">Exam</label>
          <input
            type="text"
            id="exam"
            name="exam"
            value={quizConfig.exam}
            onChange={handleConfigChange}
            className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., UPSC, GRE, NEET"
          />
        </div>

        <div>
          <label htmlFor="topic" className="block text-sm font-medium text-gray-700">Topic</label>
          <input
            type="text"
            id="topic"
            name="topic"
            value={quizConfig.topic}
            onChange={handleConfigChange}
            className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            placeholder="e.g., Indian Monsoon, Algebra"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="q_no" className="block text-sm font-medium text-gray-700">Questions</label>
            <input
              type="number"
              id="q_no"
              name="q_no"
              value={quizConfig.q_no}
              onChange={handleConfigChange}
              min="1"
              max="20"
              className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700">Difficulty</label>
            <select
              id="difficulty"
              name="difficulty"
              value={quizConfig.difficulty}
              onChange={handleConfigChange}
              className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </div>
          <div>
            <label htmlFor="questionType" className="block text-sm font-medium text-gray-700">Type</label>
            <select
              id="questionType"
              name="questionType"
              value={quizConfig.questionType}
              onChange={handleConfigChange}
              className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="MCQ">MCQ</option>
              <option value="Subjective">Subjective</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isLoading ? 'Generating Quiz...' : 'Start Quiz'}
        </button>
      </form>
    </div>
  );

  /**
   * Renders the main quiz interface with one question at a time
   */
  const renderQuiz = () => {
    if (!questions) return null;

    const totalQuestions = questions.questionType === 'MCQ'
      ? questions.QuestionArray.length
      : questions.QuestionArray.length;
    
    const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

    return (
      <div className="w-full max-w-3xl p-8 space-y-6 bg-white shadow-2xl rounded-2xl">
        {/* Progress Bar and Counter */}
        <div className="mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-lg font-semibold text-blue-700">
              Question {currentQuestionIndex + 1} of {totalQuestions}
            </span>
            <span className="text-lg font-medium text-gray-600">
              {questions.questionType}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Question Display */}
        <div className="py-4">
          {questions.questionType === 'MCQ' ? (
            <McqQuestionDisplay
              question={questions.QuestionArray[currentQuestionIndex]}
              selectedAnswer={userAnswers[currentQuestionIndex]}
              onAnswerSelect={handleAnswerChange}
            />
          ) : (
            <SubjectiveQuestionDisplay
              question={questions.QuestionArray[currentQuestionIndex]}
              currentAnswer={userAnswers[currentQuestionIndex]}
              onAnswerChange={handleAnswerChange}
            />
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6 border-t border-gray-200">
          <button
            onClick={handlePrevQuestion}
            disabled={currentQuestionIndex === 0}
            className="px-6 py-2 font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>

          {isLastQuestion ? (
            <button
              onClick={handleSubmitQuiz}
              className="px-8 py-2 font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Submit Quiz
            </button>
          ) : (
            <button
              onClick={handleNextQuestion}
              className="px-8 py-2 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Next
            </button>
          )}
        </div>
      </div>
    );
  };

  /**
   * Renders the final "Thank You" or results screen
   */
  const renderResults = () => (
    <div className="w-full max-w-xl p-10 text-center bg-white shadow-lg rounded-2xl">
      <h2 className="text-3xl font-bold text-gray-800 mb-4">Quiz Complete!</h2>
      <p className="text-lg text-gray-600 mb-6">
        Your answers have been submitted.
      </p>
      
      {/* Optional: Show score for MCQs */}
      {questions?.questionType === 'MCQ' && (
        <div className="mb-6">
          <p className="text-xl font-semibold">
            Your Score: {calculateScore()} / {questions.QuestionArray.length}
          </p>
        </div>
      )}

      <button
        onClick={() => {
          // Reset all state to start over
          setQuestions(null);
          setIsSubmitted(false);
          setUserAnswers({});
          setCurrentQuestionIndex(0);
        }}
        className="w-full px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
      >
        Take Another Quiz
      </button>
    </div>
  );

  /**
   * Helper to calculate score for MCQ quizzes
   */
  const calculateScore = () => {
    if (questions?.questionType !== 'MCQ') return 0;
    
    let score = 0;
    questions.QuestionArray.forEach((q, index) => {
      // Assumes AnswerArray holds the correct letter, e.g., "B"
      // Assumes userAnswers holds the selected option text, e.g., "B. Option 2"
      // We just check if the user's answer string starts with the correct letter.
      const correctAnswerLetter = questions.AnswerArray[index];
      const userAnswer = userAnswers[index];
      
      if (userAnswer && userAnswer.startsWith(correctAnswerLetter)) {
        score++;
      }
    });
    return score;
  };

  // --- Main Render Logic ---

  return (
    <div className="flex items-center justify-center min-h-screen w-full bg-gray-50 p-4">
      {/* Show loading spinner */}
      {isLoading && (
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent border-solid rounded-full animate-spin"></div>
          <p className="mt-4 text-lg font-medium text-gray-700">Generating your quiz...</p>
        </div>
      )}

      {/* Show error message */}
      {!isLoading && error && (
        <div className="w-full max-w-md p-6 text-center bg-white border-2 border-red-300 shadow-lg rounded-2xl">
          <h3 className="text-2xl font-bold text-red-600 mb-4">An Error Occurred</h3>
          <p className="text-gray-700 bg-red-50 p-4 rounded-lg">{error}</p>
          <button
            onClick={() => setError(null)} // Just clear error, user stays on setup form
            className="w-full mt-6 px-6 py-2 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Show setup form (if no loading, no error, and no questions) */}
      {!isLoading && !error && !questions && renderSetupForm()}

      {/* Show quiz (if questions are loaded and not submitted) */}
      {!isLoading && !error && questions && !isSubmitted && renderQuiz()}
      
      {/* Show results (if submitted) */}
      {!isLoading && !error && questions && isSubmitted && renderResults()}
    </div>
  );
}

// --- Child Components ---

/**
 * Renders an MCQ question with its options
 */
const McqQuestionDisplay = ({
  question,
  selectedAnswer,
  onAnswerSelect,
}: {
  question: McqQuestion;
  selectedAnswer: string;
  onAnswerSelect: (value: string) => void;
}) => {
  return (
    <div className="space-y-4">
      <p className="text-xl font-semibold text-gray-800" style={{ whiteSpace: 'pre-wrap' }}>
        {question.Q}
      </p>
      <div className="space-y-3">
        {question.Options.map((option, index) => {
          const isSelected = selectedAnswer === option;
          return (
            <button
              key={index}
              onClick={() => onAnswerSelect(option)}
              className={`
                w-full p-4 text-left border rounded-lg text-gray-700
                transition-all duration-200
                ${isSelected 
                  ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-400' 
                  : 'bg-white border-gray-300 hover:bg-gray-50'}
              `}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Renders a Subjective question with a text area
 */
const SubjectiveQuestionDisplay = ({
  question,
  currentAnswer,
  onAnswerChange,
}: {
  question: string;
  currentAnswer: string;
  onAnswerChange: (value: string) => void;
}) => {
  return (
    <div className="space-y-4">
      <p className="text-xl font-semibold text-gray-800" style={{ whiteSpace: 'pre-wrap' }}>
        {question}
      </p>
      <textarea
        value={currentAnswer || ''}
        onChange={(e) => onAnswerChange(e.target.value)}
        rows={10}
        className="w-full p-4 text-gray-900 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        placeholder="Type your answer here..."
      />
    </div>
  );
};

