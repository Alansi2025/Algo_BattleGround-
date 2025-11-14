
export type AlgorithmKey = 'bubbleSort' | 'selectionSort' | 'insertionSort' | 'quickSort' | 'mergeSort' | 'heapSort' | 'radixSort' | 'bucketSort' | 'bogoSort' | 'userCode';

export interface Algorithm {
    name: string;
    func: (updateCallback: UpdateCallback, getSpeed: () => number) => Promise<number[]>;
}

export interface SortStats {
    comparisons: number;
    swaps: number;
    writes: number;
    time: number;
}

export interface Highlight {
    comparing?: number[];
    swapping?: number[];
}

// FIX: Add optional errorMessage to the UpdateCallback type definition.
export type UpdateCallback = (arr: number[], highlights: Highlight, stats: Partial<SortStats>, errorMessage?: string) => Promise<void>;

export type ArrayType = 'random' | 'nearlySorted' | 'reversed';

export type GameState = 'setup' | 'battle' | 'sandbox' | 'results';

export interface BattleConfig {
    algo1: AlgorithmKey;
    algo2: AlgorithmKey;
    arraySize: number;
    arrayType: ArrayType;
    delay: number;
}

export interface BattleResult {
    name: string;
    time: number;
    comparisons: number;
    swaps: number;
    writes: number;
}

export type Language = 'javascript' | 'python';
