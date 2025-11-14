import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Chart } from 'chart.js/auto';
import { GoogleGenAI } from '@google/genai';
import { AlgorithmKey, ArrayType, BattleConfig, GameState, Highlight, SortStats, BattleResult, Language } from './types';
import { ALGORITHMS, DEFAULT_USER_CODE, DEFAULT_PYTHON_CODE } from './constants';
import { getAlgorithmRunner } from './services/sortingService';
import { SwordsIcon, CodeIcon, ClockIcon, CompareIcon, SwapIcon, WriteIcon, ExpandIcon, CloseIcon, SpinnerIcon, ClipboardIcon, CheckIcon, BookIcon } from './components/icons';

// Add Prism to the window object for TypeScript
declare var Prism: any;

// --- UI HELPER COMPONENTS ---

const GlassPanel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`bg-black/40 backdrop-blur-sm border border-purple-500/50 rounded-lg shadow-lg shadow-purple-900/50 ${className}`}>
        {children}
    </div>
);

const Button: React.FC<{ onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string; title?: string }> = ({ onClick, children, disabled = false, className = '', title }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={`relative inline-flex items-center justify-center px-6 py-3 font-game text-sm uppercase tracking-widest text-black bg-cyan-400 border-2 border-cyan-800 shadow-[4px_4px_0px_#0d0d2b] transition-all duration-150 ease-in-out hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#0d0d2b] active:translate-x-[4px] active:translate-y-[4px] active:shadow-[0px_0px_0px_#0d0d2b] disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-[4px_4px_0px_#0d0d2b] ${className}`}
    >
        {children}
    </button>
);

const Select: React.FC<{ id: string; value: string; onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void; children: React.ReactNode; disabled?: boolean }> = ({ id, value, onChange, children, disabled = false }) => (
    <select id={id} value={value} onChange={onChange} disabled={disabled} className="w-full bg-gray-900/80 border-2 border-purple-500 rounded p-2 text-white focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors duration-200">
        {children}
    </select>
);

const Slider: React.FC<{ id: string; min: number; max: number; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; disabled?: boolean }> = (props) => (
    <input type="range" {...props} />
);

const LoadingIndicator: React.FC<{ isPaused: boolean }> = ({ isPaused }) => (
    <div className="flex items-center justify-center gap-4 font-game text-lg">
        <SpinnerIcon />
        <span className="text-yellow-300 animate-pulse">
            {isPaused ? 'PAUSED' : 'RUNNING...'}
        </span>
    </div>
);

// --- VISUALIZATION COMPONENTS ---

const Bar: React.FC<{ value: number; maxValue: number; isComparing: boolean; isSwapping: boolean; isSorted: boolean }> = React.memo(({ value, maxValue, isComparing, isSwapping, isSorted }) => {
    const height = `${(value / maxValue) * 100}%`;
    const baseClasses = 'w-full rounded-t-sm transition-colors duration-100 ease-linear';
    let colorClasses = 'bg-fuchsia-500 shadow-[0_0_8px_var(--glow-fuchsia)]';
    if (isSorted) colorClasses = 'bg-green-400 shadow-[0_0_8px_var(--glow-green)]';
    else if (isSwapping) colorClasses = 'bg-cyan-400 shadow-[0_0_8px_var(--glow-cyan)]';
    else if (isComparing) colorClasses = 'bg-yellow-400 shadow-[0_0_8px_var(--glow-yellow)]';
    
    return <div style={{ height }} className={`${baseClasses} ${colorClasses}`} />;
});

const ArenaDisplay: React.FC<{ array: number[]; highlights: Highlight; sorted: boolean }> = ({ array, highlights, sorted }) => (
    <div className="h-64 w-full flex items-end justify-start gap-[1px] border-2 border-fuchsia-500/50 rounded-md p-1 bg-black bg-opacity-70 shadow-[0_0_15px_rgba(255,0,255,0.3)]">
        {array.map((value, index) => (
            <Bar
                key={index}
                value={value}
                maxValue={array.length}
                isComparing={highlights.comparing?.includes(index) || false}
                isSwapping={highlights.swapping?.includes(index) || false}
                isSorted={sorted}
            />
        ))}
    </div>
);

// --- CORE LOGIC COMPONENTS ---

interface ArenaProps {
    arenaId: number;
    algorithmKey: AlgorithmKey;
    initialArray: number[];
    delay: number;
    onFinish: (result: BattleResult) => void;
    userCode?: string;
    addCommentary: (text: string) => void;
    isRunning: boolean;
    isPaused: boolean;
}

/**
 * Manages the state and lifecycle of a single sorting algorithm visualization instance (an "arena").
 * This hook encapsulates the sorting logic, state updates for rendering, and communication
 * with the sorting service. It is designed to be used by the `Arena` component.
 *
 * @param {object} props - The properties for configuring the arena.
 * @param {number} props.arenaId - A unique identifier for the arena, used in commentary messages.
 * @param {AlgorithmKey} props.algorithmKey - The key identifying which sorting algorithm to run.
 * @param {number[]} props.initialArray - The array of numbers to be sorted.
 * @param {number} props.delay - The delay in milliseconds between visualization updates.
 * @param {(result: BattleResult) => void} props.onFinish - A callback function invoked when the sorting is complete.
 * @param {string} [props.userCode] - An optional string of user-provided code, used when `algorithmKey` is 'userCode'.
 * @param {(text: string) => void} props.addCommentary - A callback function to add messages to the live commentary log.
 * @param {boolean} props.isRunning - A flag that triggers the start of the sorting algorithm when true.
 * @param {boolean} props.isPaused - A flag that pauses or resumes the algorithm's execution.
 * @returns {{
 *   array: number[],
 *   highlights: Highlight,
 *   stats: SortStats,
 *   isSorted: boolean,
 *   error: string | null,
 *   algorithmName: string
 * }} An object containing the current state of the arena for rendering.
 * - `array`: The current state of the array as it's being sorted.
 * - `highlights`: An object indicating which array indices should be highlighted (e.g., for comparison or swapping).
 * - `stats`: An object containing performance metrics like comparisons, swaps, and execution time.
 * - `isSorted`: A boolean flag that becomes true once the algorithm successfully completes.
 * - `error`: A string containing an error message if the algorithm fails, otherwise null.
 * - `algorithmName`: The display name of the algorithm currently running in the arena.
 */
const useArenaState = ({
    arenaId,
    algorithmKey,
    initialArray,
    delay,
    onFinish,
    userCode,
    addCommentary,
    isRunning,
    isPaused,
}: ArenaProps) => {
    const [array, setArray] = useState<number[]>(initialArray);
    const [highlights, setHighlights] = useState<Highlight>({});
    const [stats, setStats] = useState<SortStats>({ comparisons: 0, swaps: 0, time: 0, writes: 0 });
    const [isSorted, setIsSorted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const delayRef = useRef(delay);
    delayRef.current = delay;
    
    const isPausedRef = useRef(isPaused);
    isPausedRef.current = isPaused;

    const algorithmName = algorithmKey === 'userCode' ? 'Your Algorithm' : ALGORITHMS[algorithmKey as Exclude<AlgorithmKey, 'userCode'>].name;

    useEffect(() => {
        let isCancelled = false;
        
        const updateCallback = async (newArray: number[], newHighlights: Highlight, newStats: Partial<SortStats>, errorMessage?: string) => {
            if (isCancelled) return;
            setArray(newArray);
            setHighlights(newHighlights);
            setStats(prevStats => ({...prevStats, ...newStats}));
            if (errorMessage) {
                // Strip "Error: " prefix as we add our own title
                setError(errorMessage.replace(/^Error:\s*/, ''));
            }
        };

        const runSort = async () => {
            // Reset state for each new run
            setArray(initialArray);
            setHighlights({});
            setStats({ comparisons: 0, swaps: 0, time: 0, writes: 0 });
            setIsSorted(false);
            setError(null);

            try {
                const runner = algorithmKey === 'userCode'
                    ? getAlgorithmRunner('userCode', userCode || '')
                    : getAlgorithmRunner(algorithmKey);
                const algorithm = runner(updateCallback, () => delayRef.current, () => isPausedRef.current);
                addCommentary(`[Arena ${arenaId}] ${algorithmName} prepares for battle!`);
                const finalStats = await algorithm(initialArray);

                if (!isCancelled) {
                    if (finalStats) {
                        setIsSorted(true);
                        addCommentary(`[Arena ${arenaId}] ${algorithmName} has finished!`);
                        onFinish({
                            name: algorithmName,
                            ...finalStats,
                            time: finalStats.time / 1000 // convert to seconds for chart
                        });
                    } else {
                        onFinish({ name: algorithmName, time: 0, comparisons: 0, swaps: 0, writes: 0 });
                    }
                }
            } catch (e) {
                 if (e instanceof Error && !isCancelled) {
                    const errorMessage = `Fatal error in ${algorithmName}: ${e.message}`;
                    setError(errorMessage);
                    addCommentary(`[Arena ${arenaId}] ${errorMessage}`);
                    onFinish({ name: algorithmName, time: 0, comparisons: 0, swaps: 0, writes: 0 });
                }
            }
        };

        if (isRunning) {
            runSort();
        }

        return () => {
            isCancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [algorithmKey, initialArray, onFinish, userCode, addCommentary, arenaId, isRunning]);

    return { array, highlights, stats, isSorted, error, algorithmName };
};


const Arena: React.FC<ArenaProps> = (props) => {
    const { array, highlights, stats, isSorted, error, algorithmName } = useArenaState(props);

    return (
        <GlassPanel className="p-4 flex flex-col">
            <h3 className="text-xl font-game text-yellow-300 mb-4 text-center truncate">{algorithmName}</h3>
            <ArenaDisplay array={array} highlights={highlights} sorted={isSorted} />
            <div className="mt-4 text-sm font-mono flex-grow">
                 <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <p className="truncate"><ClockIcon />{(stats.time / 1000).toFixed(3)}s</p>
                    <p className="truncate"><CompareIcon />{stats.comparisons.toLocaleString()}</p>
                    <p className="truncate"><SwapIcon />{stats.swaps.toLocaleString()}</p>
                    <p className="truncate"><WriteIcon />{stats.writes.toLocaleString()}</p>
                 </div>
                {error && (
                    <div className="bg-red-900/70 border border-red-500 p-2 rounded mt-2 text-red-300 text-xs font-mono break-words whitespace-pre-wrap">
                        <h4 className="font-bold mb-1 text-red-200">Execution Failed</h4>
                        {error}
                    </div>
                )}
            </div>
        </GlassPanel>
    );
};

interface BattleScreenProps {
    config: BattleConfig;
    onBattleComplete: (results: BattleResult[]) => void;
    userCode?: string;
    isRunning: boolean;
    isPaused: boolean;
}

const BattleScreen: React.FC<BattleScreenProps> = ({ config, onBattleComplete, userCode, isRunning, isPaused }) => {
    const [commentary, setCommentary] = useState<string[]>([]);
    const commentaryBoxRef = useRef<HTMLDivElement>(null);

    const initialArray = useMemo(() => {
        let size = config.arraySize;
        if ((config.algo1 === 'bogoSort' || config.algo2 === 'bogoSort') && size > 10) {
            size = 10;
        }

        const arr = Array.from({ length: size }, (_, i) => i + 1);
        switch (config.arrayType) {
            case 'random':
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [arr[i], arr[j]] = [arr[j], arr[i]];
                }
                break;
            case 'nearlySorted':
                for (let i = 0; i < Math.floor(size / 10); i++) {
                    const idx1 = Math.floor(Math.random() * size);
                    const idx2 = Math.floor(Math.random() * size);
                    [arr[idx1], arr[idx2]] = [arr[idx2], arr[idx1]];
                }
                break;
            case 'reversed':
                arr.reverse();
                break;
        }
        return arr;
    }, [config.arraySize, config.arrayType, config.algo1, config.algo2]);

    const addCommentary = useCallback((text: string) => {
        setCommentary(prev => [...prev.slice(-100), `> ${text}`]); // Keep last 100 lines
    }, []);
    
    useEffect(() => {
        if (commentaryBoxRef.current) {
            commentaryBoxRef.current.scrollTop = commentaryBoxRef.current.scrollHeight;
        }
    }, [commentary]);
    
    const resultsRef = useRef<BattleResult[]>([]);
    
    const handleArenaFinish = useCallback((result: BattleResult) => {
        resultsRef.current.push(result);
        if (resultsRef.current.length === 2) {
            onBattleComplete(resultsRef.current);
        }
    }, [onBattleComplete]);

    return (
        <div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Arena
                    arenaId={1}
                    algorithmKey={config.algo1}
                    initialArray={initialArray}
                    delay={config.delay}
                    onFinish={handleArenaFinish}
                    userCode={config.algo1 === 'userCode' ? userCode : undefined}
                    addCommentary={addCommentary}
                    isRunning={isRunning}
                    isPaused={isPaused}
                />
                <Arena
                    arenaId={2}
                    algorithmKey={config.algo2}
                    initialArray={initialArray}
                    delay={config.delay}
                    onFinish={handleArenaFinish}
                    userCode={config.algo2 === 'userCode' ? userCode : undefined}
                    addCommentary={addCommentary}
                    isRunning={isRunning}
                    isPaused={isPaused}
                />
            </div>
            <GlassPanel className="p-4 mt-8">
                <h3 className="text-xl font-game text-green-300 mb-2">Live Commentary</h3>
                <div ref={commentaryBoxRef} className="h-40 bg-black/80 border border-green-500/50 rounded p-2 overflow-y-auto text-sm font-mono text-green-300 custom-scrollbar">
                    {commentary.map((line, i) => <p key={i} className="animate-fade-in">{line}</p>)}
                </div>
            </GlassPanel>
        </div>
    );
};


interface ResultsChartProps {
    results: BattleResult[];
}

const ResultsChart: React.FC<ResultsChartProps> = ({ results }) => {
    const chartRef = useRef<HTMLCanvasElement>(null);
    const chartInstance = useRef<Chart | null>(null);

    useEffect(() => {
        if (chartRef.current) {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
            const ctx = chartRef.current.getContext('2d');
            if (ctx) {
                Chart.defaults.font.family = "'Roboto Mono', monospace";
                chartInstance.current = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: results.map(r => r.name.replace(/"/g, "'")),
                        datasets: [
                            {
                                label: 'Time (s)',
                                data: results.map(r => r.time),
                                backgroundColor: 'rgba(0, 255, 255, 0.7)',
                                borderColor: 'rgba(0, 255, 255, 1)',
                                borderWidth: 1,
                                yAxisID: 'y',
                            },
                            {
                                label: 'Comparisons',
                                data: results.map(r => r.comparisons),
                                backgroundColor: 'rgba(255, 255, 0, 0.7)',
                                borderColor: 'rgba(255, 255, 0, 1)',
                                borderWidth: 1,
                                yAxisID: 'y1',
                            },
                            {
                                label: 'Swaps',
                                data: results.map(r => r.swaps),
                                backgroundColor: 'rgba(255, 0, 255, 0.7)',
                                borderColor: 'rgba(255, 0, 255, 1)',
                                borderWidth: 1,
                                yAxisID: 'y1',
                            },
                             {
                                label: 'Writes',
                                data: results.map(r => r.writes),
                                backgroundColor: 'rgba(0, 255, 0, 0.7)',
                                borderColor: 'rgba(0, 255, 0, 1)',
                                borderWidth: 1,
                                yAxisID: 'y1',
                            }
                        ]
                    },
                    options: {
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                beginAtZero: true,
                                title: { display: true, text: 'Time (s)', color: '#e0e0e0', font: { size: 14 } },
                                ticks: { color: '#e0e0e0' },
                                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                beginAtZero: true,
                                title: { display: true, text: 'Operations', color: '#e0e0e0', font: { size: 14 } },
                                ticks: { color: '#e0e0e0' },
                                grid: { drawOnChartArea: false }
                            },
                            x: {
                                ticks: { color: '#e0e0e0', font: { size: 10 } },
                                grid: { color: 'rgba(255, 255, 255, 0.1)' }
                            }
                        },
                        plugins: {
                            legend: { labels: { color: '#e0e0e0', font: { size: 12 } } },
                            tooltip: { mode: 'index', intersect: false }
                        }
                    }
                });
            }
        }
        return () => {
            if (chartInstance.current) {
                chartInstance.current.destroy();
            }
        };
    }, [results]);

    return <canvas ref={chartRef}></canvas>;
};


interface ResultsModalProps {
    results: BattleResult[];
    onClose: () => void;
}

const ResultsModal: React.FC<ResultsModalProps> = ({ results, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
            <GlassPanel className="rounded-lg shadow-2xl p-8 max-w-4xl w-full">
                <h2 className="text-3xl font-game neon-text mb-6 text-center">Battle Report</h2>
                <div className="relative h-96 w-full mx-auto">
                    <ResultsChart results={results} />
                </div>
                <div className="text-center mt-8">
                    <Button onClick={onClose} title="Return to the setup screen to start a new battle (Enter)">New Battle</Button>
                </div>
            </GlassPanel>
        </div>
    );
};


interface ExpandedEditorModalProps {
    initialCode: string;
    onSave: (newCode: string) => void;
    onClose: () => void;
    language: Language;
}

const ExpandedEditorModal: React.FC<ExpandedEditorModalProps> = ({ initialCode, onSave, onClose, language }) => {
    const [code, setCode] = useState(initialCode);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
    const textAreaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);
    const codeBlockRef = useRef<HTMLElement>(null);

    useEffect(() => {
        if (codeBlockRef.current && typeof Prism !== 'undefined') {
            Prism.highlightElement(codeBlockRef.current);
        }
    }, [code, language]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        
        textAreaRef.current?.focus();

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    const handleSave = () => {
        onSave(code);
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setCopyStatus('copied');
            setTimeout(() => setCopyStatus('idle'), 2000);
        }).catch(err => {
            console.error('Failed to copy code: ', err);
        });
    };
    
    const handleScroll = () => {
        if (textAreaRef.current && preRef.current) {
            preRef.current.scrollTop = textAreaRef.current.scrollTop;
            preRef.current.scrollLeft = textAreaRef.current.scrollLeft;
        }
    };

    const handleTextAreaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = e.currentTarget.selectionStart;
            const end = e.currentTarget.selectionEnd;
            const newCode = code.substring(0, start) + '  ' + code.substring(end);
            
            e.currentTarget.value = newCode;
            e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
            
            setCode(newCode);
        }
    }

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
            <GlassPanel className="flex flex-col w-full h-full max-w-6xl max-h-[90vh] p-0">
                <header className="flex justify-between items-center p-4 border-b border-purple-500/50">
                    <h2 className="text-2xl font-game text-cyan-300">Expanded Editor ({language === 'javascript' ? 'JavaScript' : 'Python'})</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors" title="Close (Esc)">
                        <CloseIcon />
                    </button>
                </header>
                <div className="flex-grow p-4">
                    <div className="editor-container w-full h-full bg-gray-900/80 border-2 border-purple-500 rounded">
                        <textarea
                            ref={textAreaRef}
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            onKeyDown={handleTextAreaKeyDown}
                            onScroll={handleScroll}
                            className="custom-scrollbar"
                            spellCheck="false"
                        />
                        <pre ref={preRef} aria-hidden="true" className="custom-scrollbar">
                            <code ref={codeBlockRef} className={`language-${language}`}>
                                {`${code}\n`}
                            </code>
                        </pre>
                    </div>
                </div>
                <footer className="p-4 border-t border-purple-500/50 flex justify-end items-center gap-4">
                    <Button onClick={handleCopy} className="bg-purple-600 border-purple-800 text-white" title="Copy code to clipboard">
                        {copyStatus === 'copied' ? (
                            <><CheckIcon /> Copied!</>
                        ) : (
                            <><ClipboardIcon /> Copy Code</>
                        )}
                    </Button>
                    <Button onClick={handleSave}>Save & Close</Button>
                </footer>
            </GlassPanel>
        </div>
    );
};

// --- APP COMPONENT ---

const App: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>('setup');
    const [config, setConfig] = useState<BattleConfig>({
        algo1: 'bubbleSort',
        algo2: 'quickSort',
        arraySize: 100,
        arrayType: 'random',
        delay: 20,
    });
    const [validationErrors, setValidationErrors] = useState({
        arraySize: '',
        delay: '',
    });
    const [userCode, setUserCode] = useState(DEFAULT_USER_CODE);
    const [language, setLanguage] = useState<Language>('javascript');
    const [transpiledCode, setTranspiledCode] = useState<string | null>(null);
    const [isTranspiling, setIsTranspiling] = useState(false);
    const [transpilationError, setTranspilationError] = useState<string | null>(null);
    const [results, setResults] = useState<BattleResult[]>([]);
    const [mode, setMode] = useState<'battle' | 'sandbox' | 'learn'>('battle');
    const [isSandboxRunning, setIsSandboxRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isEditorExpanded, setIsEditorExpanded] = useState(false);

    // State for Learn DSA mode
    const [dsaTopic, setDsaTopic] = useState<AlgorithmKey | 'none'>('none');
    const [explanation, setExplanation] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    
    useEffect(() => {
        if (language === 'javascript') {
            setUserCode(DEFAULT_USER_CODE);
        } else if (language === 'python') {
            setUserCode(DEFAULT_PYTHON_CODE);
        }
        setTranspilationError(null);
    }, [language]);

    const handleBattleComplete = useCallback((battleResults: BattleResult[]) => {
        setResults(battleResults);
        setGameState('results');
    }, []);

    const handleReset = useCallback(() => {
        setGameState('setup');
        setResults([]);
        setIsSandboxRunning(false);
        setIsPaused(false);
        setTranspiledCode(null);
        setTranspilationError(null);
    }, []);

    const handleStartBattle = useCallback(() => {
        setResults([]);
        setIsSandboxRunning(false);
        setTranspiledCode(null);
        setTranspilationError(null);
        setGameState(mode as GameState);
    }, [mode]);

    const handleRunSandbox = async () => {
        setResults([]);
        setTranspilationError(null);

        if (language === 'javascript') {
            setTranspiledCode(userCode);
            setIsSandboxRunning(true);
            return;
        }

        if (language === 'python') {
            setIsTranspiling(true);
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
                const prompt = `You are an expert code transpiler. Your task is to convert the given Python code into a single, asynchronous JavaScript function that can be executed in a browser environment for a sorting algorithm visualization tool.

                **Requirements for the JavaScript output:**
                1.  The output must be ONLY the JavaScript code for the function, with no extra explanations, formatting, or markdown like \`\`\`javascript.
                2.  The function must be named \`userSort\`.
                3.  The function must be \`async\`.
                4.  The function signature must be exactly: \`async function userSort(arr, update, stats)\`.
                
                **Parameter Explanations:**
                *   \`arr\`: A JavaScript array of numbers to be sorted in place.
                *   \`update\`: An \`async\` callback function to visualize the algorithm's progress. It should be called with \`await\`. It accepts an object with optional keys:
                    *   \`comparing: [index1, index2]\`: To highlight elements being compared.
                    *   \`swapping: [index1, index2]\`: To highlight elements being swapped.
                *   \`stats\`: A JavaScript object to track performance metrics. You must increment its properties:
                    *   \`stats.comparisons++\`
                    *   \`stats.swaps++\`
                    *   \`stats.writes++\` (A single swap is typically two writes)

                **Python to JavaScript Mappings:**
                *   \`len(arr)\` becomes \`arr.length\`.
                *   Python's tuple swap \`arr[i], arr[j] = arr[j], arr[i]\` becomes JavaScript's destructuring assignment \`[arr[i], arr[j]] = [arr[j], arr[i]]\`.
                *   The Python code might use \`await update(...)\`. This should be preserved in JavaScript. The arguments inside update should be mapped to the JS object format (e.g., \`update({'comparing': [i, j]})\` becomes \`update({ comparing: [i, j] })\`).

                **Python code to transpile:**
                \`\`\`python
                ${userCode}
                \`\`\`
                `;

                const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: prompt,
                });
                
                const transpiledJs = response.text.replace(/```javascript|```/g, '').trim();

                if (!transpiledJs.includes('async function userSort')) {
                    throw new Error('Transpilation failed to produce the required "userSort" function. Please check your Python code for syntax errors.');
                }
                
                setTranspiledCode(transpiledJs);
                setIsSandboxRunning(true);

            } catch (e) {
                if (e instanceof Error) {
                    setTranspilationError(`Transpilation Error: ${e.message}`);
                } else {
                    setTranspilationError('An unknown error occurred during transpilation.');
                }
            } finally {
                setIsTranspiling(false);
            }
        }
    };
    
    const handleGenerateExplanation = async () => {
        if (dsaTopic === 'none' || isGenerating) return;

        setIsGenerating(true);
        setExplanation('');
        setGenerationError(null);

        try {
            const algorithm = ALGORITHMS[dsaTopic as Exclude<AlgorithmKey, 'userCode'>];
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const prompt = `
                Provide a clear and concise explanation for the sorting algorithm: **${algorithm.name}**.

                The explanation should be easy for a beginner to understand. Please structure your response as follows:

                1.  **Concept:** A brief, high-level overview of how the algorithm works. Explain its core idea.
                2.  **Step-by-Step Example:** Walk through a simple example, like sorting the array [5, 3, 8, 1]. Show the state of the array after each major step or pass.
                3.  **Performance:**
                    *   **Time Complexity:** State the Best, Average, and Worst-case time complexities (e.g., O(n²)).
                    *   **Space Complexity:** State the space complexity (e.g., O(1)).
                4.  **Strengths & Weaknesses:** List a few key pros and cons of using this algorithm.

                Keep the language simple and direct. Use markdown for formatting, like bolding for titles and code blocks for arrays.
            `;
            
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
            });

            setExplanation(response.text);

        } catch (e) {
            console.error("Error generating explanation:", e);
            if (e instanceof Error) {
                setGenerationError(`Failed to generate explanation: ${e.message}`);
            } else {
                setGenerationError('An unknown error occurred while generating the explanation.');
            }
        } finally {
            setIsGenerating(false);
        }
    };


    const hasErrors = Object.values(validationErrors).some(e => e !== '');
    
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditorExpanded) return;

            const target = event.target as HTMLElement;
            if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) {
                return;
            }

            switch (event.key) {
                case 'Enter':
                    if (gameState === 'setup' && (mode === 'battle' || mode === 'sandbox') && !hasErrors) {
                        event.preventDefault();
                        handleStartBattle();
                    } else if (gameState === 'sandbox' && !isSandboxRunning && !isTranspiling) {
                        event.preventDefault();
                        handleRunSandbox();
                    } else if (gameState === 'results') {
                        event.preventDefault();
                        handleReset();
                    }
                    break;
                case ' ': // Spacebar
                    if (gameState === 'battle' || (gameState === 'sandbox' && isSandboxRunning)) {
                        event.preventDefault();
                        setIsPaused(p => !p);
                    }
                    break;
                case 'r':
                case 'R':
                    if (['battle', 'sandbox', 'results'].includes(gameState)) {
                        event.preventDefault();
                        handleReset();
                    }
                    break;
                default:
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, hasErrors, isSandboxRunning, handleStartBattle, handleReset, isEditorExpanded, isTranspiling, mode]);
    
    const handleModeChange = (newMode: 'battle' | 'sandbox' | 'learn') => {
        if (newMode !== mode) {
            if (gameState !== 'setup') {
                handleReset();
            }
            setMode(newMode);
            // Reset learn state when switching modes
            setDsaTopic('none');
            setExplanation('');
            setGenerationError(null);
        }
    };

    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (gameState !== 'setup') {
            handleReset();
        }

        const { id, value } = e.target;
        
        if (id === 'arraySize' || id === 'delay') {
            const numValue = parseInt(value, 10);
            
            let errorMessage = '';
            if (id === 'arraySize' && (numValue < 10 || numValue > 500)) {
                errorMessage = 'Size must be 10-500.';
            } else if (id === 'delay' && (numValue < 0 || numValue > 200)) {
                errorMessage = 'Delay must be 0-200ms.';
            }
            
            setValidationErrors(prev => ({ ...prev, [id]: errorMessage }));
            setConfig(prev => ({ ...prev, [id]: numValue }));

        } else {
             setConfig(prev => ({ ...prev, [id]: value as AlgorithmKey | ArrayType }));
        }
    };
    
    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (gameState !== 'setup') {
            handleReset();
        }
        const { id, value } = e.target;
        setValidationErrors(prev => ({ ...prev, [id]: '' }));
        setConfig(prev => ({ ...prev, [id]: parseInt(value, 10) }));
    };

    const renderContent = () => {
        switch (gameState) {
            case 'battle':
                return (
                    <>
                        <div className="text-center mb-8 flex justify-center items-center gap-6">
                            <Button onClick={handleReset} title="End the current battle and return to the setup screen (R)">Reset Battle</Button>
                            <LoadingIndicator isPaused={isPaused} />
                            <Button onClick={() => setIsPaused(p => !p)} title={isPaused ? "Resume the simulation (Spacebar)" : "Pause the simulation (Spacebar)"}>
                                {isPaused ? 'Resume' : 'Pause'}
                            </Button>
                        </div>
                        <BattleScreen config={config} onBattleComplete={handleBattleComplete} isRunning={true} isPaused={isPaused}/>
                    </>
                );
            case 'sandbox': {
                 const sandboxConfig: BattleConfig = {
                    ...config,
                    algo1: 'userCode',
                    algo2: config.algo1 === 'userCode' ? 'quickSort' : config.algo1,
                };
                return (
                    <>
                        <div className="text-center mb-8 flex justify-center items-center gap-6">
                            <Button onClick={handleReset} title="Stop the sandbox and return to the setup screen (R)">Reset Battle</Button>
                            {isSandboxRunning && <LoadingIndicator isPaused={isPaused} />}
                            <Button onClick={() => setIsPaused(p => !p)} title={isPaused ? "Resume the simulation (Spacebar)" : "Pause the simulation (Spacebar)"} disabled={!isSandboxRunning}>
                                {isPaused ? 'Resume' : 'Pause'}
                            </Button>
                        </div>
                        <BattleScreen 
                            config={sandboxConfig} 
                            onBattleComplete={handleBattleComplete} 
                            userCode={transpiledCode || userCode} 
                            isRunning={isSandboxRunning}
                            isPaused={isPaused}
                        />
                        {!isSandboxRunning && (
                            <div className="text-center mt-8 animate-fade-in">
                                <Button onClick={handleRunSandbox} disabled={isTranspiling} className="text-lg px-10 py-4 flex items-center gap-2" title="Execute your custom algorithm against the opponent (Enter)">
                                    {isTranspiling ? <><SpinnerIcon /> Transpiling...</> : 'Run Code!'}
                                </Button>
                                {transpilationError && <p className="text-red-400 text-sm mt-4 font-mono">{transpilationError}</p>}
                            </div>
                        )}
                    </>
                );
            }
            case 'results':
                return (
                    <>
                        <div className="opacity-30 pointer-events-none">
                          <BattleScreen config={mode === 'battle' ? config : {...config, algo1: 'userCode', algo2: config.algo1}} onBattleComplete={()=>{}} userCode={mode === 'sandbox' ? (transpiledCode || userCode) : undefined} isRunning={true} isPaused={isPaused} />
                        </div>
                        <ResultsModal results={results} onClose={handleReset} />
                    </>
                );
            case 'setup':
            default:
                const isBogoSelected = config.algo1 === 'bogoSort' || (mode === 'battle' && config.algo2 === 'bogoSort');
                const effectiveArraySize = isBogoSelected && config.arraySize > 10 ? 10 : config.arraySize;

                return (
                    <GlassPanel className="p-8 animate-fade-in">
                        <div className="mb-8 flex justify-center border-b-2 border-purple-500/30">
                            <button onClick={() => handleModeChange('battle')} title="Pit two built-in sorting algorithms against each other" className={`font-game px-6 py-3 text-sm transition-colors flex items-center ${mode === 'battle' ? 'text-cyan-300 border-b-2 border-cyan-300' : 'text-gray-400 hover:text-white'}`}>
                                <SwordsIcon /> Battle Mode
                            </button>
                            <button onClick={() => handleModeChange('sandbox')} title="Test your own custom sorting algorithm against a built-in one" className={`font-game px-6 py-3 text-sm transition-colors flex items-center ${mode === 'sandbox' ? 'text-cyan-300 border-b-2 border-cyan-300' : 'text-gray-400 hover:text-white'}`}>
                                <CodeIcon /> Sandbox
                            </button>
                             <button onClick={() => handleModeChange('learn')} title="Learn about data structures and algorithms" className={`font-game px-6 py-3 text-sm transition-colors flex items-center ${mode === 'learn' ? 'text-cyan-300 border-b-2 border-cyan-300' : 'text-gray-400 hover:text-white'}`}>
                                <BookIcon /> Learn DSA
                            </button>
                        </div>

                        {mode === 'battle' ? (
                        <>
                            <h2 className="text-2xl font-game text-cyan-300 mb-6 text-center">Choose Champions</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                                <div>
                                    <label htmlFor="algo1" className="block mb-2 font-bold text-lg text-yellow-300">Champion 1</label>
                                    <Select id="algo1" value={config.algo1} onChange={handleConfigChange}>
                                        {Object.entries(ALGORITHMS).map(([key, { name }]) => (
                                            <option key={key} value={key}>{name}</option>
                                        ))}
                                    </Select>
                                </div>
                                <div>
                                    <label htmlFor="algo2" className="block mb-2 font-bold text-lg text-fuchsia-300">Champion 2</label>
                                    <Select id="algo2" value={config.algo2} onChange={handleConfigChange}>
                                        {Object.entries(ALGORITHMS).map(([key, { name }]) => (
                                            <option key={key} value={key}>{name}</option>
                                        ))}
                                    </Select>
                                </div>
                            </div>
                        </>
                        ) : mode === 'sandbox' ? (
                        <>
                            <h2 className="text-2xl font-game text-cyan-300 mb-6 text-center">Code Your Champion</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-lg font-bold text-cyan-300">Your Algorithm</h3>
                                        <div className="flex items-center gap-2 text-xs">
                                            <label htmlFor="language-select" className="sr-only">Language</label>
                                            <select id="language-select" value={language} onChange={(e) => setLanguage(e.target.value as Language)} className="bg-gray-900/80 border border-purple-500 rounded py-1 px-2 text-gray-300 text-xs focus:outline-none focus:border-cyan-400">
                                                <option value="javascript">JavaScript</option>
                                                <option value="python">Python</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="relative h-64">
                                        <textarea
                                            value={userCode}
                                            onChange={(e) => setUserCode(e.target.value)}
                                            className="w-full h-full bg-gray-900/80 border-2 border-purple-500 rounded p-2 text-sm font-mono text-white focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400 custom-scrollbar resize-none"
                                            spellCheck="false"
                                        />
                                        <button onClick={() => setIsEditorExpanded(true)} className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-gray-300 hover:text-white hover:bg-black/80 transition-colors" title="Expand Editor">
                                            <ExpandIcon />
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-yellow-300 mb-2">Choose Opponent</h3>
                                    <Select id="algo1" value={config.algo1} onChange={handleConfigChange}>
                                        {Object.entries(ALGORITHMS).map(([key, { name }]) => (
                                            <option key={key} value={key}>{name}</option>
                                        ))}
                                    </Select>
                                    <p className="text-xs text-gray-400 mt-2">Your custom algorithm will face this built-in champion.</p>
                                </div>
                            </div>
                        </>
                        ) : (
                        <>
                            <h2 className="text-2xl font-game text-cyan-300 mb-6 text-center">Learn an Algorithm</h2>
                            <div className="max-w-3xl mx-auto">
                                <div className="flex items-end gap-4">
                                    <div className="flex-grow">
                                        <label htmlFor="dsaTopic" className="block mb-2 font-bold text-lg text-yellow-300">Select Topic</label>
                                        <Select id="dsaTopic" value={dsaTopic} onChange={(e) => setDsaTopic(e.target.value as AlgorithmKey | 'none')}>
                                            <option value="none" disabled>Select an algorithm...</option>
                                            {Object.entries(ALGORITHMS).map(([key, { name }]) => (
                                                <option key={key} value={key}>{name}</option>
                                            ))}
                                        </Select>
                                    </div>
                                    <Button onClick={handleGenerateExplanation} disabled={dsaTopic === 'none' || isGenerating} className="px-4 py-2.5">
                                        {isGenerating ? <><SpinnerIcon /> Generating...</> : 'Explain It!'}
                                    </Button>
                                </div>

                                <div className="mt-6 min-h-[24rem] bg-black/50 border border-purple-500/30 rounded-lg p-4">
                                    {isGenerating ? (
                                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                            <SpinnerIcon />
                                            <p className="mt-2 font-game animate-pulse">Thinking...</p>
                                        </div>
                                    ) : generationError ? (
                                        <div className="text-red-400 font-mono p-4">
                                            <p className="font-bold">Error:</p>
                                            <p>{generationError}</p>
                                        </div>
                                    ) : explanation ? (
                                        <div className="text-gray-300 whitespace-pre-wrap font-mono custom-scrollbar overflow-y-auto h-[24rem] leading-relaxed text-sm p-2">
                                            {explanation}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-gray-500">
                                            <p>Select an algorithm and click "Explain It!" to get started.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                        )}

                        {(mode === 'battle' || mode === 'sandbox') && (
                        <>
                            <h2 className="text-2xl font-game text-green-300 mt-10 mb-6 text-center">Battlefield Setup</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div>
                                    <label htmlFor="arraySize" className="block mb-2 font-bold">Array Size: {effectiveArraySize}</label>
                                    <Slider id="arraySize" min={10} max={500} value={config.arraySize} onChange={handleSliderChange} />
                                    {validationErrors.arraySize && <p className="text-red-400 text-xs mt-1">{validationErrors.arraySize}</p>}
                                    {isBogoSelected && config.arraySize > 10 && <p className="text-yellow-400 text-xs mt-1">Bogo Sort is capped at 10 items for sanity.</p>}
                                </div>
                                <div>
                                    <label htmlFor="arrayType" className="block mb-2 font-bold">Array Type</label>
                                    <Select id="arrayType" value={config.arrayType} onChange={handleConfigChange}>
                                        <option value="random">Random</option>
                                        <option value="nearlySorted">Nearly Sorted</option>
                                        <option value="reversed">Reversed</option>
                                    </Select>
                                </div>
                                <div>
                                    <label htmlFor="delay" className="block mb-2 font-bold">Speed (Delay): {config.delay}ms</label>
                                    <Slider id="delay" min={0} max={200} value={config.delay} onChange={handleSliderChange} />
                                    {validationErrors.delay && <p className="text-red-400 text-xs mt-1">{validationErrors.delay}</p>}
                                </div>
                            </div>

                            <div className="text-center mt-12">
                                <Button onClick={handleStartBattle} disabled={hasErrors} className="text-lg px-10 py-4" title={hasErrors ? 'Please fix errors before starting' : 'Start the simulation! (Enter)'}>
                                    {mode === 'battle' ? 'Start Battle!' : 'Prepare Sandbox!'}
                                </Button>
                            </div>
                        </>
                        )}
                    </GlassPanel>
                );
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <header className="text-center my-6">
                <h1 className="text-4xl sm:text-5xl font-game neon-text">Algo-Arena</h1>
                <p className="text-fuchsia-300 text-sm sm:text-base">The Sorting Showdown</p>
            </header>
            <main>
                {renderContent()}
            </main>
            {isEditorExpanded && (
                <ExpandedEditorModal 
                    initialCode={userCode}
                    onSave={(newCode) => {
                        setUserCode(newCode);
                        setIsEditorExpanded(false);
                    }}
                    onClose={() => setIsEditorExpanded(false)}
                    language={language}
                />
            )}
        </div>
    );
};

export default App;