import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './lib/supabaseClient';
import { saveResultsToBackend, fetchResultsList, fetchResultById, type ResultsListItem, type ResultDetail } from './services/resultsApi';
import Navbar from './components/Navbar';

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
// Point directly to backend during development
const API_BASE_URL = 'https://practise-pitch-be.onrender.com/api/ai';
const RESULTS_URL = '/api/results';

// --- Main App Component ---
export default function App() {
  // --- State Variables ---

  // 1. UI State
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 2. Quiz Setup State
  const [quizConfig, setQuizConfig] = useState({
    exam: "UPSC",
    q_no: 5,
    difficulty: "Medium",
    topic: "Miscellaneous",
    questionType: "MCQ",
    language: "English",
  });

  // 3. Quiz Active State
  const [questions, setQuestions] = useState<ApiResponseData | null>(null);
  const [preparedQuestions, setPreparedQuestions] = useState<ApiResponseData | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  // 4. Validation and timing state
  const [formErrors, setFormErrors] = useState<{ q_no?: string }>({});
  const [quizStartTime, setQuizStartTime] = useState<number | null>(null);
  const [totalTimeMs, setTotalTimeMs] = useState<number | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  // Save results status
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  // Results browsing state
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultsListItem[] | null>(null);
  const [resultsPage, setResultsPage] = useState(0);
  const [resultsLimit, setResultsLimit] = useState(5);
  const [resultsHasMore, setResultsHasMore] = useState(false);
  const [selectedResult, setSelectedResult] = useState<ResultDetail | null>(null);
  const [resultDetailPage, setResultDetailPage] = useState<ResultDetail | null>(null);
  const [effectiveTopic, setEffectiveTopic] = useState<string>("Miscellaneous");
  // Supabase auth state
  const [supabaseClient] = useState(() => getSupabaseClient());
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authMode, setAuthMode] = useState<'signIn' | 'signUp'>('signIn');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const adminEmail = (import.meta as any).env?.VITE_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = (import.meta as any).env?.VITE_ADMIN_PASSWORD || 'admin123';

  const getEmailRedirectTo = () => {
    const envRedirect = (import.meta as any).env?.VITE_SUPABASE_REDIRECT_URL as string | undefined;
    return envRedirect || `${window.location.origin}`;
  };
  // 5. Per-question timing
  const [questionStartTime, setQuestionStartTime] = useState<number | null>(null);
  const [currentQuestionElapsedMs, setCurrentQuestionElapsedMs] = useState<number>(0);
  const [perQuestionDurationsMs, setPerQuestionDurationsMs] = useState<Record<number, number>>({});

  // --- Event Handlers ---

  /**
   * Updates the quiz configuration form
   */
  const handleConfigChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    
    const nextConfig = {
      ...quizConfig,
      [name]: type === 'number' ? parseInt(value, 10) : value,
    } as typeof quizConfig;

    setQuizConfig(nextConfig);
    validateAndSetErrors(nextConfig);
  };

  const validateAndSetErrors = (cfg: typeof quizConfig) => {
    const errors: { q_no?: string } = {};
    if (!cfg.q_no || Number.isNaN(cfg.q_no) || cfg.q_no < 1 || cfg.q_no > 20) {
      errors.q_no = 'Questions must be between 1 and 20';
    }
    setFormErrors(errors);
    return Object.keys(errors).length > 0;
  };

  /**
   * Fetches the quiz questions from the backend API
   */
  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreating(true);
    setError(null);
    setQuestions(null);
    setPreparedQuestions(null);
    setUserAnswers({});
    setCurrentQuestionIndex(0);
    setIsSubmitted(false);
    setTotalTimeMs(null);

    // Validate before calling API
    const hasErrors = validateAndSetErrors(quizConfig);
    if (hasErrors) {
      setIsCreating(false);
      return;
    }

    // Do NOT start timers yet; start after user clicks Start Quiz

    try {
      // Retrieve access token for backend auth middleware
      let accessToken: string | undefined = session?.access_token as unknown as string | undefined;
      if (!accessToken && supabaseClient) {
        const { data } = await supabaseClient.auth.getSession();
        accessToken = data.session?.access_token;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const resolvedTopic = resolveTopic(quizConfig);
      setEffectiveTopic(resolvedTopic);
      const response = await fetch(`${API_BASE_URL}/generate-questions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...quizConfig, topic: resolvedTopic }),
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const result: FullApiResponse = await response.json();

      if (result.status === 'success') {
        setPreparedQuestions(result.data);
      } else {
        // Handle cases where the server returns a 200 OK but a business logic error
        // @ts-expect-error - 'data' might be an error object from the backend
        throw new Error(result.data?.message || 'Failed to parse quiz data');
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsCreating(false);
    }
  };

  const beginPreparedQuiz = () => {
    if (!preparedQuestions) return;
    setQuestions(preparedQuestions);
    setPreparedQuestions(null);
    setQuizStartTime(Date.now());
    setCurrentQuestionElapsedMs(0);
    setPerQuestionDurationsMs({});
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setIsSubmitted(false);
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
      // Persist elapsed time for current question
      const elapsed = (questionStartTime ? Date.now() - questionStartTime : 0);
      setPerQuestionDurationsMs(prev => ({
        ...prev,
        [currentQuestionIndex]: (prev[currentQuestionIndex] || 0) + elapsed,
      }));
      setCurrentQuestionIndex(prevIndex => prevIndex + 1);
      setQuestionStartTime(Date.now());
      setCurrentQuestionElapsedMs(0);
    }
  };

  /**
   * Navigates to the previous question
   */
  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      // Persist elapsed time for current question
      const elapsed = (questionStartTime ? Date.now() - questionStartTime : 0);
      setPerQuestionDurationsMs(prev => ({
        ...prev,
        [currentQuestionIndex]: (prev[currentQuestionIndex] || 0) + elapsed,
      }));
      setCurrentQuestionIndex(prevIndex => prevIndex - 1);
      setQuestionStartTime(Date.now());
      setCurrentQuestionElapsedMs(0);
    }
  };

  /**
   * Submits the quiz and shows the results
   */
  const handleSubmitQuiz = () => {
    // Persist time for the last viewed question
    if (questionStartTime !== null) {
      const elapsed = Date.now() - questionStartTime;
      setPerQuestionDurationsMs(prev => ({
        ...prev,
        [currentQuestionIndex]: (prev[currentQuestionIndex] || 0) + elapsed,
      }));
    }
    setIsSubmitted(true);
    const total = quizStartTime ? Date.now() - quizStartTime : 0;
    setTotalTimeMs(total);
    // In a real app, you might calculate the score here, especially for MCQs
    console.log("Quiz Submitted! Answers:", userAnswers);
    void saveResults(total);
  };

  // Live ticker for the per-question timer
  useEffect(() => {
    if (!questions || isSubmitted || questionStartTime === null) return;
    const id = setInterval(() => {
      setCurrentQuestionElapsedMs(Date.now() - (questionStartTime || Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [questions, isSubmitted, questionStartTime]);

  // Initialize Supabase session + auth listener
  useEffect(() => {
    if (!supabaseClient) return;
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription?.unsubscribe();
  }, [supabaseClient]);

  const saveResults = async (timeMsToSend: number) => {
    try {
      if (!questions) return;
      setSaveStatus('saving');
      setSaveError(null);

      // token
      let accessToken: string | undefined = (session as any)?.access_token;
      if (!accessToken && supabaseClient) {
        const { data } = await supabaseClient.auth.getSession();
        accessToken = data.session?.access_token;
      }

      const topicForSave = `${quizConfig.exam} : ${effectiveTopic || resolveTopic(quizConfig)}`;
      await saveResultsToBackend({
        resultsUrl: RESULTS_URL,
        accessToken,
        payload: {
          topic: topicForSave,
          timeMs: timeMsToSend,
          questions,
          solutions: {
            userAnswers,
            score: calculateScore(),
          },
        },
      });
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to save results');
    }
  };

  const handleEmailAuth = async () => {
    if (!supabaseClient) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      // Dev bypass — sign in without Supabase when admin creds match
      if (authMode === 'signIn' && authEmail === adminEmail && authPassword === adminPassword) {
        const fakeSession = {
          access_token: 'dev-bypass',
          token_type: 'bearer',
          user: { id: 'dev-admin', email: authEmail },
        } as unknown as Session;
        setSession(fakeSession);
        return;
      }
      if (authMode === 'signIn') {
        const { error } = await supabaseClient.auth.signInWithPassword({ email: authEmail, password: authPassword });
        if (error) throw error;
      } else {
        const { error } = await supabaseClient.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            emailRedirectTo: getEmailRedirectTo(),
            data: { full_name: authName },
          },
        });
        if (error) throw error;
        // Show verification message and switch to sign-in mode
        setAuthInfo(`Verification link sent to ${authEmail}. Please verify your email, then sign in.`);
        setAuthMode('signIn');
        setAuthPassword('');
        setAuthName('');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      // Handle both Supabase and dev-bypass sessions
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }
    } catch { /* no-op */ }
    setSession(null);
    setQuestions(null);
    setIsSubmitted(false);
    setShowAnswers(false);
  };

  const getAccessToken = async (): Promise<string | undefined> => {
    let accessToken: string | undefined = (session as any)?.access_token;
    if (!accessToken && supabaseClient) {
      const { data } = await supabaseClient.auth.getSession();
      accessToken = data.session?.access_token;
    }
    return accessToken;
  };

  const goHome = () => {
    // Reset transient views and navigate to start screen
    setShowResultsPanel(false);
    setResultDetailPage(null);
    setError(null);
    setIsSubmitted(false);
    setQuestions(null);
    setShowAnswers(false);
    setCurrentQuestionIndex(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openResultsPanel = async () => {
    setShowResultsPanel(true);
    await loadResultsPage(0, resultsLimit);
  };

  const loadResultsPage = async (page: number, limit: number) => {
    try {
      setResultsLoading(true);
      setResultsError(null);
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const { data, meta } = await fetchResultsList({ resultsUrl: RESULTS_URL, accessToken: token, page, limit });
      setResults(data);
      setResultsPage(meta.page);
      setResultsLimit(meta.limit);
      setResultsHasMore(meta.hasMore);
      setSelectedResult(null);
    } catch (e) {
      setResultsError(e instanceof Error ? e.message : 'Failed to load results');
    } finally {
      setResultsLoading(false);
    }
  };

  const loadResultDetail = async (id: string) => {
    try {
      setResultsLoading(true);
      setResultsError(null);
      const token = await getAccessToken();
      if (!token) throw new Error('Not authenticated');
      const detail = await fetchResultById({ resultsUrl: RESULTS_URL, accessToken: token, id });
      setSelectedResult(detail);
      // Open as a dedicated page view
      setResultDetailPage(detail);
      setShowResultsPanel(false);
    } catch (e) {
      setResultsError(e instanceof Error ? e.message : 'Failed to load result');
    } finally {
      setResultsLoading(false);
    }
  };

  const renderSavedResultPage = () => {
    const detail = resultDetailPage;
    if (!detail) return null;

    // Best-effort MCQ rendering similar to live answers view
    const qData: any = detail.questions as any;
    const isMcq = qData && qData.questionType === 'MCQ';
    const questionArray: any[] = isMcq ? qData.QuestionArray : [];
    const answerArray: string[] = isMcq ? qData.AnswerArray : [];
    const userAns = (detail.solutions?.userAnswers || {}) as Record<number, string>;

    return (
      <div className="max-w-4xl mx-auto p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Details</h2>
          <button
            onClick={() => { setResultDetailPage(null); setShowResultsPanel(true); }}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 cursor-pointer"
          >
            Back to results
          </button>
        </div>

        <div className="text-center space-y-4 mb-6">
          <div className="text-2xl"><span className="font-semibold">Topic:</span> {detail.topic}</div>
          <div className="text-2xl"><span className="font-semibold">Score:</span> {detail.solutions?.score}</div>
          <div className="text-2xl"><span className="font-semibold">Time:</span> {formatDuration(detail.time_ms)}</div>
          <div className="text-gray-500">Created: {new Date(detail.created_at).toLocaleString()}</div>
        </div>

        {isMcq && (
          <div className="space-y-6">
            {questionArray.map((qItem: any, index: number) => {
              const correctLetter = answerArray[index];
              const correctOption = (qItem.Options || []).find((opt: string) => opt.startsWith(`${correctLetter}`)) || '';
              const u = userAns[index];
              const isCorrect = u && u.startsWith(correctLetter);
              return (
                <div key={index} className="p-5 border border-gray-200 rounded-xl">
                  <div className="flex items-start justify-between">
                    <div className="text-lg font-semibold text-gray-900">
                      <span className="mr-2 text-gray-500">{index + 1}.</span>
                      <span className="align-middle">
                        {renderRichQuestionText(qItem.Q)}
                      </span>
                    </div>
                    <span className={`ml-4 px-3 py-1 text-xs font-semibold rounded-full ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {isCorrect ? 'Correct' : 'Incorrect'}
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {(qItem.Options || []).map((opt: string, i: number) => {
                      const isTheCorrect = opt === correctOption;
                      const isUserChoice = opt === u;
                      return (
                        <div
                          key={i}
                          className={`p-3 rounded-lg border text-sm
                            ${isTheCorrect ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}
                            ${isUserChoice && !isTheCorrect ? 'border-red-300 bg-red-50' : ''}
                            `}
                        >
                          <span>{opt}</span>
                          {isTheCorrect && <span className="ml-2 text-green-700 font-medium">(Correct)</span>}
                          {isUserChoice && !isTheCorrect && <span className="ml-2 text-red-700">(Your choice)</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isMcq && (
          <div className="space-y-6">
            {(qData?.QuestionArray || []).map((qText: string, index: number) => {
              const answerText = userAns[index];
              return (
                <div key={index} className="p-5 border border-gray-200 rounded-xl">
                  <div className="text-lg font-semibold text-gray-900 mb-3">
                    <span className="mr-2 text-gray-500">{index + 1}.</span>
                    <span className="align-middle">{renderRichQuestionText(qText)}</span>
                  </div>
                  <div className="mt-2">
                    <div className="text-sm font-medium text-gray-700 mb-1">Your answer:</div>
                    <div className="text-sm text-gray-800 bg-gray-50 p-3 rounded border">
                      {answerText && answerText.trim() ? answerText : '— No answer provided —'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // --- Render Functions ---

  /**
   * Renders the initial form to configure and start the quiz
   */
  const renderSetupForm = () => (
    <div className="w-full max-w-xl p-8 space-y-6 bg-white shadow-xl rounded-2xl relative">
      <h2 className="text-4xl font-extrabold text-center text-gray-900">practise-pitch 🏏</h2>
      <p className="text-center text-sm text-gray-600 -mt-3">Step onto the pitch and test your wits. Ready to bat? </p>
      <form onSubmit={handleCreateQuiz} className="space-y-4">
        <div>
          <label htmlFor="exam" className="block text-sm font-medium text-gray-700">📘 Exam</label>
          <input
            type="text"
            id="exam"
            name="exam"
            value={quizConfig.exam}
            onChange={handleConfigChange}
            className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., UPSC, GRE, NEET"
          />
        </div>

        <div>
          <label htmlFor="topic" className="block text-sm font-medium text-gray-700">🔖 Topic</label>
          <input
            type="text"
            id="topic"
            name="topic"
            value={quizConfig.topic}
            onChange={handleConfigChange}
            className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Miscellaneous (related to the exam)"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="q_no" className="block text-sm font-medium text-gray-700">🎯 Questions</label>
            <input
              type="number"
              id="q_no"
              name="q_no"
              value={quizConfig.q_no}
              onChange={handleConfigChange}
              min="1"
              max="20"
              className={`w-full px-4 py-2 mt-1 text-gray-900 border rounded-lg focus:ring-indigo-500 focus:border-indigo-500 ${formErrors.q_no ? 'border-red-500' : 'border-gray-300'}`}
            />
            {formErrors.q_no && (
              <p className="mt-1 text-sm text-red-600">{formErrors.q_no}</p>
            )}
          </div>
          <div>
            <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700">⚙️ Difficulty</label>
            <select
              id="difficulty"
              name="difficulty"
              value={quizConfig.difficulty}
              onChange={handleConfigChange}
              className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option>Easy</option>
              <option>Medium</option>
              <option>Hard</option>
            </select>
          </div>
          <div>
            <label htmlFor="questionType" className="block text-sm font-medium text-gray-700">🧠 Type</label>
            <select
              id="questionType"
              name="questionType"
              value={quizConfig.questionType}
              onChange={handleConfigChange}
              className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="MCQ">MCQ</option>
              <option value="Subjective">Subjective</option>
            </select>
          </div>
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700">🌐 Language</label>
            <select
              id="language"
              name="language"
              value={quizConfig.language}
              onChange={handleConfigChange}
              className="w-full px-4 py-2 mt-1 text-gray-900 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={isCreating || !!formErrors.q_no}
          className="w-full px-6 py-3 font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg shadow-md hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer"
        >
          {isCreating ? 'Creating Quiz…' : 'Create Quiz 🚀🏏'}
        </button>
      </form>
      <div className="absolute -bottom-6 -left-6 select-none rotate-[-15deg]"><img src="/player.png" alt="" className="h-14 w-14" /></div>
    </div>
  );

  // (unused) legacy creation screen removed; spinner shown above

  const renderReadyScreen = () => (
    <div className="w-full max-w-xl p-10 text-center bg-white shadow-lg rounded-2xl">
      <h2 className="text-3xl font-bold text-gray-800 mb-4">🎉 Your pitch is ready!</h2>
      <p className="text-gray-700 mb-6">Are you ready to bat? 🏏 Timers begin when you press Start.</p>
      <button
        onClick={beginPreparedQuiz}
        className="w-full px-6 py-3 font-semibold text-white bg-green-600 rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 cursor-pointer"
      >
        Start Quiz
      </button>
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
    const accumulatedMs = perQuestionDurationsMs[currentQuestionIndex] || 0;
    const liveMs = isSubmitted ? 0 : currentQuestionElapsedMs;
    const shownMs = accumulatedMs + liveMs;

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
          <div className="mt-2 text-right text-sm text-gray-600">
            Time on this question: <span className="font-medium text-gray-800">{formatDuration(shownMs)}</span>
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

      {typeof totalTimeMs === 'number' && (
        <div className="mb-6">
          <p className="text-lg text-gray-700">Time Taken: {formatDuration(totalTimeMs)}</p>
        </div>
      )}

      {/* Save status banner */}
      {saveStatus === 'saving' && (
        <div className="mb-4 text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-md p-3">Saving results…</div>
      )}
      {saveStatus === 'success' && (
        <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-md p-3">Results saved.</div>
      )}
      {saveStatus === 'error' && (
        <div className="mb-4 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3">Save failed{saveError ? `: ${saveError}` : ''}</div>
      )}

      {questions?.questionType === 'MCQ' && (
        <button
          onClick={() => setShowAnswers(true)}
          className="w-full mb-4 px-6 py-3 font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          Show Answers
        </button>
      )}

      <button
        onClick={() => {
          // Reset all state to start over
          setQuestions(null);
          setIsSubmitted(false);
          setUserAnswers({});
          setCurrentQuestionIndex(0);
          setQuizStartTime(null);
          setTotalTimeMs(null);
          setShowAnswers(false);
        }}
        className="w-full px-6 py-3 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 cursor-pointer"
      >
        Take Another Quiz
      </button>
    </div>
  );

  /**
   * Renders the full answers review for MCQs
   */
  const renderAnswersPage = () => {
    if (!questions || questions.questionType !== 'MCQ') return null;

    return (
      <div className="w-full max-w-3xl p-8 space-y-6 bg-white shadow-2xl rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-800">Answers Review</h2>
          <button
            onClick={() => setShowAnswers(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 cursor-pointer"
          >
            Back to Results
          </button>
        </div>

        <div className="space-y-6">
          {questions.QuestionArray.map((qItem, index) => {
            const correctLetter = questions.AnswerArray[index];
            const correctOption = qItem.Options.find(opt => opt.startsWith(`${correctLetter}`)) || '';
            const userOption = userAnswers[index];
            const isCorrect = userOption && userOption.startsWith(correctLetter);
            const spentMs = (perQuestionDurationsMs[index] || 0);

            return (
              <div key={index} className="p-5 border border-gray-200 rounded-xl">
                <div className="flex items-start justify-between">
                  <div className="text-lg font-semibold text-gray-900">
                    <span className="mr-2 text-gray-500">{index + 1}.</span>
                    <span className="align-middle">
                      {renderRichQuestionText(qItem.Q)}
                    </span>
                  </div>
                  <span className={`ml-4 px-3 py-1 text-xs font-semibold rounded-full ${isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {isCorrect ? 'Correct' : 'Incorrect'}
                  </span>
                </div>

                <div className="mt-2 text-sm text-gray-600">Time spent: {formatDuration(spentMs)}</div>

                <div className="mt-4 space-y-2">
                  {qItem.Options.map((opt, i) => {
                    const isTheCorrect = opt === correctOption;
                    const isUserChoice = opt === userOption;
                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-lg border text-sm
                          ${isTheCorrect ? 'border-green-400 bg-green-50' : 'border-gray-200 bg-white'}
                          ${isUserChoice && !isTheCorrect ? 'border-red-300 bg-red-50' : ''}
                        `}
                      >
                        <span>{opt}</span>
                        {isTheCorrect && <span className="ml-2 text-green-700 font-medium">(Correct)</span>}
                        {isUserChoice && !isTheCorrect && <span className="ml-2 text-red-700">(Your choice)</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /**
   * Helper to calculate score for MCQ quizzes
   */
  const calculateScore = () => {
    if (questions?.questionType !== 'MCQ') return 0;
    
    let score = 0;
    questions.QuestionArray.forEach((_question, index) => {
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

  // Gate 1: Missing Supabase env config
  if (!supabaseClient) {
    console.log("Supabase credentials are not set.");
    return (
      <div className="flex items-center justify-center min-h-screen w-full bg-gray-50 p-6">
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-red-600 mb-2">Configuration Error</h2>
          <p className="text-gray-700">Supabase credentials are not set.</p>
          <p className="text-gray-600 mt-2">
            Add <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_URL</code> and <code className="bg-gray-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> in your <code className="bg-gray-100 px-1 rounded">.env.local</code> and restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  // Gate 2: Not authenticated → show public landing page with auth panel
  if (!session) {
    console.log("Not authenticated");
    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 relative">
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/stadium.jpg')" }}></div>
          <div className="absolute inset-0 bg-white/60"></div>
        </div>
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          {/* Left: Hero copy + image (publicly visible) */}
          <div>
            <h1 className="text-4xl font-extrabold text-gray-900">practise-pitch 🏏</h1>
            <p className="mt-4 text-gray-700 text-lg">
              Step up to the crease—generate questions, practice your shots, and review your innings with timing insights.
            </p>
            <ul className="mt-6 space-y-2 text-gray-700 list-disc ml-5">
              <li>MCQ and Subjective modes</li>
              <li>Per-question and total timers</li>
              <li>Answer review with correctness highlights</li>
            </ul>
            <div className="mt-10">
              <img src="/icon.png" alt="Bat and ball" className="w-full max-w-xl opacity-90 select-none" />
            </div>
          </div>

          {/* Right: Auth card */}
          <div className="w-full max-w-md md:ml-auto bg-white rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-semibold text-center text-gray-800 mb-2">Login or Sign up 🏏</h2>
            <p className="text-center text-xs text-gray-600 mb-4">Join the squad and start your practise innings!</p>
            <div className="space-y-4">
              {authMode === 'signUp' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">👤 Name</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Your full name"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700">📧 Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">🔐 Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="••••••••"
                />
              </div>
              {authError && <p className="text-sm text-red-600">{authError}</p>}
              {authInfo && (
                <div className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-md p-3">
                  {authInfo}
                </div>
              )}
              <button
                onClick={handleEmailAuth}
                disabled={authLoading || !authEmail || !authPassword || (authMode === 'signUp' && !authName.trim())}
                className="w-full px-6 py-3 font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 rounded-lg shadow-md hover:from-indigo-700 hover:to-blue-700 disabled:bg-gray-400 cursor-pointer"
              >
                {authMode === 'signIn' ? (authLoading ? 'Signing in…' : 'Sign in 🏏') : (authLoading ? 'Signing up…' : 'Sign up 🏏')}
              </button>
              <div className="text-center text-sm text-gray-600">
                {authMode === 'signIn' ? (
                  <span>
                    New here?{' '}
                    <button className="text-indigo-600 underline cursor-pointer" onClick={() => setAuthMode('signUp')}>Create an account</button>
                  </span>
                ) : (
                  <span>
                    Already have an account?{' '}
                    <button className="text-indigo-600 underline cursor-pointer" onClick={() => setAuthMode('signIn')}>Sign in</button>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50 to-blue-50 relative">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/stadium.jpg')" }}></div>
        <div className="absolute inset-0 bg-white/60"></div>
      </div>
      <Navbar
        userEmail={session?.user?.email || ''}
        userName={(session?.user as any)?.user_metadata?.full_name || (session?.user as any)?.user_metadata?.name || ''}
        onShowCreate={goHome}
        onShowResults={openResultsPanel}
        onSignOut={handleSignOut}
      />
      <div className="flex items-center justify-center px-4 pb-8">
      {/* Show loading spinner */}
      {isCreating && (
        <div className="fixed bottom-4 right-4 w-80 p-4 bg-white rounded-xl shadow-xl border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 animate-pulse"></div>
              <div className="absolute inset-0 rounded-full bg-blue-400 opacity-30 animate-ping"></div>
              <div className="absolute inset-2 rounded-full bg-white"></div>
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Creating your quiz… 🏏</div>
              <div className="text-xs text-gray-600">Grab a sip of water or check your past innings while we set the field.</div>
            </div>
          </div>
          <div className="mt-3 h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-blue-500 to-indigo-500 animate-[slide_1.2s_linear_infinite]"></div>
          </div>
        </div>
      )}
      {/* No bottom-right toast for ready state; central card is sufficient */}

      {/* Show error message */}
      {error && (
        <div className="w-full max-w-md p-6 text-center bg-white border-2 border-red-300 shadow-lg rounded-2xl">
          <h3 className="text-2xl font-bold text-red-600 mb-4">An Error Occurred</h3>
          <p className="text-gray-700 bg-red-50 p-4 rounded-lg">{error}</p>
          <button
            onClick={() => setError(null)} // Just clear error, user stays on setup form
            className="w-full mt-6 px-6 py-2 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Show saved result detail page (if opened) */}
      {!error && resultDetailPage && renderSavedResultPage()}

      {/* Show setup form (if no loading, no error, and no questions) */}
      {!error && !resultDetailPage && !questions && !preparedQuestions && renderSetupForm()}
      {!error && !resultDetailPage && !questions && preparedQuestions && renderReadyScreen()}

      {/* Show quiz (if questions are loaded and not submitted) */}
      {!error && !resultDetailPage && questions && !isSubmitted && renderQuiz()}
      
      {/* Show results (if submitted) */}
      {!error && !resultDetailPage && questions && isSubmitted && !showAnswers && renderResults()}
      {/* Show answers page (if requested) */}
      {!error && !resultDetailPage && questions && isSubmitted && showAnswers && renderAnswersPage()}
      </div>

      {/* Results panel */}
      {showResultsPanel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden">
            <div className="p-6 border-r border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">Your Results</h3>
                <button className="text-gray-600 hover:text-gray-900" onClick={() => setShowResultsPanel(false)}>✕</button>
              </div>
              {resultsLoading && <p className="text-sm text-gray-600">Loading…</p>}
              {resultsError && <p className="text-sm text-red-600">{resultsError}</p>}
              <ul className="divide-y divide-gray-200">
                {(results ?? []).map((r) => (
                  <li key={r.id} className="py-3 cursor-pointer hover:bg-gray-50 px-2 rounded" onClick={() => loadResultDetail(r.id)}>
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{r.topic}</span>
                      <span className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between">
                <button
                  onClick={() => loadResultsPage(Math.max(0, resultsPage - 1), resultsLimit)}
                  disabled={resultsPage <= 0 || resultsLoading}
                  className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50 cursor-pointer"
                >
                  Prev
                </button>
                <span className="text-sm text-gray-600">Page {resultsPage + 1}</span>
                <button
                  onClick={() => loadResultsPage(resultsPage + 1, resultsLimit)}
                  disabled={!resultsHasMore || resultsLoading}
                  className="px-3 py-1.5 rounded-md border text-sm disabled:opacity-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Details</h3>
              {!selectedResult && <p className="text-sm text-gray-600">Select a result to view details</p>}
              {selectedResult && (
                <div className="space-y-3">
                  <div className="text-gray-800"><span className="font-semibold">Topic:</span> {selectedResult.topic}</div>
                  <div className="text-gray-800"><span className="font-semibold">Score:</span> {selectedResult.solutions?.score}</div>
                  <div className="text-gray-800"><span className="font-semibold">Time:</span> {formatDuration(selectedResult.time_ms)}</div>
                  <div className="text-gray-500 text-sm">Created: {new Date(selectedResult.created_at).toLocaleString()}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Child Components ---

// Renders question text with basic rich formatting for numbered/bulleted lists
function renderRichQuestionText(text: string) {
  if (!text) return null;

  // Detect a sequence like "1. ... 2. ..." anywhere in the string
  const hasNumberedItems = /(\b\d+\.\s)/.test(text) && /(\b2\.\s)/.test(text);

  if (hasNumberedItems) {
    // Optional intro before the first item (e.g., "Consider the following statements:")
    const firstIdx = text.search(/\b1\.\s/);
    const intro = firstIdx > 0 ? text.slice(0, firstIdx).trim() : '';
    const listPart = firstIdx >= 0 ? text.slice(firstIdx) : text;

    // Capture "n. content" blocks until next number or end
    const itemRegex = /(\d+)\.\s([\s\S]*?)(?=(?:\n?\s*\d+\.\s)|$)/g;
    const items: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(listPart)) !== null) {
      items.push(match[2].trim());
    }

    return (
      <div className="space-y-3">
        {intro && <p className="text-gray-800">{intro}</p>}
        <ol className="list-decimal ml-6 space-y-2">
          {items.map((it, i) => (
            <li key={i} className="text-gray-800">{it}</li>
          ))}
        </ol>
      </div>
    );
  }

  // Detect simple bullet lines starting with -, *, • on separate lines
  const lines = text.split(/\r?\n/);
  const bulletLines = lines.filter(l => /^\s*[-*•]\s+/.test(l));
  if (bulletLines.length >= 2) {
    return (
      <ul className="list-disc ml-6 space-y-2">
        {bulletLines.map((l, i) => (
          <li key={i} className="text-gray-800">{l.replace(/^\s*[-*•]\s+/, '').trim()}</li>
        ))}
      </ul>
    );
  }

  // Fallback: plain paragraph preserving line breaks
  return (
    <p className="text-gray-800" style={{ whiteSpace: 'pre-wrap' }}>
      {text}
    </p>
  );
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

function resolveTopic(cfg: { topic: string; exam: string }) {
  const raw = (cfg.topic || '').trim();
  const lower = raw.toLowerCase();
  if (!raw || lower === 'any topic' || lower === 'miscellaneous' || lower === 'miscellanious') {
    const exam = (cfg.exam || '').trim();
    return exam ? `Miscellaneous related to ${exam}` : 'Miscellaneous';
  }
  return raw;
}

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
      <div className="text-xl font-semibold">
        {renderRichQuestionText(question.Q)}
      </div>
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
      <div className="text-xl font-semibold">
        {renderRichQuestionText(question)}
      </div>
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
