
// FIX: Import AlgorithmKey to be used in function signatures.
import { UpdateCallback, SortStats, AlgorithmKey } from '../types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const createSorter = (
    sortFunction: (
        arr: number[], 
        update: (h: { comparing?: number[], swapping?: number[] }, s?: Partial<SortStats>) => Promise<void>,
        stats: SortStats
    ) => Promise<void>
) => {
    return async (updateCallback: UpdateCallback, getSpeed: () => number) => {
        const stats: SortStats = { comparisons: 0, swaps: 0, time: 0, writes: 0 };
        const arr = [0]; // Placeholder, will be replaced by initial array in the component
        
        const update = async (highlights: { comparing?: number[], swapping?: number[] } = {}, statUpdate: Partial<SortStats> = {}) => {
            Object.assign(stats, statUpdate);
            await updateCallback([...arr], highlights, stats);
            await sleep(getSpeed());
        };
        
        const startTime = performance.now();
        await sortFunction(arr, update, stats);
        stats.time = performance.now() - startTime;
        
        await updateCallback([...arr], {}, stats); // Final update
        return arr;
    };
};

// All sorting functions are now defined inside this service file
// They are not exported directly, but used by the exported sorters object

const bubbleSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    let n = arr.length;
    let swapped;
    do {
        swapped = false;
        for (let i = 0; i < n - 1; i++) {
            stats.comparisons++;
            await update({ comparing: [i, i + 1] });
            if (arr[i] > arr[i + 1]) {
                stats.swaps++;
                stats.writes += 2;
                [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
                swapped = true;
                await update({ swapping: [i, i + 1] });
            }
        }
        n--;
    } while (swapped);
};

const selectionSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    let n = arr.length;
    for (let i = 0; i < n - 1; i++) {
        let minIdx = i;
        for (let j = i + 1; j < n; j++) {
            stats.comparisons++;
            await update({ comparing: [minIdx, j] });
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        if (minIdx !== i) {
            stats.swaps++;
            stats.writes += 2;
            [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
            await update({ swapping: [i, minIdx] });
        }
    }
};

const insertionSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    let n = arr.length;
    for (let i = 1; i < n; i++) {
        let current = arr[i];
        let j = i - 1;
        await update({ comparing: [i] });
        while (j >= 0 && arr[j] > current) {
            stats.comparisons++;
            stats.swaps++; // Counts as a shift operation
            stats.writes++;
            arr[j + 1] = arr[j];
            await update({ swapping: [j, j + 1] });
            j--;
        }
        if(j >= 0) stats.comparisons++;
        stats.writes++;
        arr[j + 1] = current;
    }
};

const quickSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    const partition = async (low: number, high: number) => {
        let pivot = arr[high];
        let i = low - 1;
        for (let j = low; j < high; j++) {
            stats.comparisons++;
            await update({ comparing: [j, high] });
            if (arr[j] < pivot) {
                i++;
                stats.swaps++;
                stats.writes += 2;
                [arr[i], arr[j]] = [arr[j], arr[i]];
                await update({ swapping: [i, j] });
            }
        }
        stats.swaps++;
        stats.writes += 2;
        [arr[i + 1], arr[high]] = [arr[high], arr[i + 1]];
        await update({ swapping: [i + 1, high] });
        return i + 1;
    };
    const sort = async (low: number, high: number) => {
        if (low < high) {
            let pi = await partition(low, high);
            await sort(low, pi - 1);
            await sort(pi + 1, high);
        }
    };
    await sort(0, arr.length - 1);
};


const mergeSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    const merge = async (l: number, m: number, r: number) => {
        let n1 = m - l + 1;
        let n2 = r - m;
        let L = new Array(n1);
        let R = new Array(n2);
        for (let i = 0; i < n1; i++) L[i] = arr[l + i];
        for (let j = 0; j < n2; j++) R[j] = arr[m + 1 + j];

        let i = 0, j = 0, k = l;
        while (i < n1 && j < n2) {
            stats.comparisons++;
            if (L[i] <= R[j]) {
                arr[k] = L[i++];
            } else {
                arr[k] = R[j++];
            }
            stats.swaps++; // Count as a move
            stats.writes++;
            await update({ comparing: [k] });
            k++;
        }
        while (i < n1) {
            arr[k++] = L[i++];
            stats.swaps++;
            stats.writes++;
            await update({ comparing: [k-1] });
        }
        while (j < n2) {
            arr[k++] = R[j++];
            stats.swaps++;
            stats.writes++;
            await update({ comparing: [k-1] });
        }
    };
    const sort = async (l: number, r: number) => {
        if (l >= r) return;
        let m = l + Math.floor((r - l) / 2);
        await sort(l, m);
        await sort(m + 1, r);
        await merge(l, m, r);
    };
    await sort(0, arr.length - 1);
};


const heapSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    const n = arr.length;
    const heapify = async (size: number, i: number) => {
        let largest = i;
        let l = 2 * i + 1;
        let r = 2 * i + 2;
        if (l < size) {
            stats.comparisons++;
            await update({ comparing: [l, largest] });
            if (arr[l] > arr[largest]) largest = l;
        }
        if (r < size) {
            stats.comparisons++;
            await update({ comparing: [r, largest] });
            if (arr[r] > arr[largest]) largest = r;
        }
        if (largest !== i) {
            stats.swaps++;
            stats.writes += 2;
            [arr[i], arr[largest]] = [arr[largest], arr[i]];
            await update({ swapping: [i, largest] });
            await heapify(size, largest);
        }
    };
    for (let i = Math.floor(n / 2) - 1; i >= 0; i--) {
        await heapify(n, i);
    }
    for (let i = n - 1; i > 0; i--) {
        stats.swaps++;
        stats.writes += 2;
        [arr[0], arr[i]] = [arr[i], arr[0]];
        await update({ swapping: [0, i] });
        await heapify(i, 0);
    }
};

const radixSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    const getMax = () => {
        let max = arr[0];
        for (let i = 1; i < arr.length; i++) if (arr[i] > max) max = arr[i];
        return max;
    };
    const countingSort = async (exp: number) => {
        let output = new Array(arr.length);
        let count = new Array(10).fill(0);
        for (let i = 0; i < arr.length; i++) {
            count[Math.floor(arr[i] / exp) % 10]++;
        }
        for (let i = 1; i < 10; i++) {
            count[i] += count[i - 1];
        }
        for (let i = arr.length - 1; i >= 0; i--) {
            output[count[Math.floor(arr[i] / exp) % 10] - 1] = arr[i];
            count[Math.floor(arr[i] / exp) % 10]--;
        }
        for (let i = 0; i < arr.length; i++) {
            stats.swaps++; // move
            stats.writes++;
            arr[i] = output[i];
            await update({ swapping: [i] });
        }
    };
    const max = getMax();
    for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
        await countingSort(exp);
    }
};

const bucketSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    const n = arr.length;
    if (n <= 0) return;
    const bucketCount = Math.floor(Math.sqrt(n));
    const buckets: number[][] = Array.from({ length: bucketCount }, () => []);
    const max = Math.max(...arr) || 1;
    for (let i = 0; i < n; i++) {
        const bucketIndex = Math.floor((arr[i] / (max + 1)) * bucketCount);
        buckets[bucketIndex].push(arr[i]);
        stats.swaps++; // move
    }
    for (let i = 0; i < bucketCount; i++) {
        // insertion sort on bucket (stats are not tracked for main array)
        for (let j = 1; j < buckets[i].length; j++) {
            let current = buckets[i][j];
            let k = j - 1;
            while (k >= 0 && buckets[i][k] > current) {
                buckets[i][k + 1] = buckets[i][k];
                k--;
            }
            buckets[i][k + 1] = current;
        }
    }
    let index = 0;
    for (let i = 0; i < bucketCount; i++) {
        for (let j = 0; j < buckets[i].length; j++) {
            arr[index++] = buckets[i][j];
            stats.writes++;
            await update({ swapping: [index - 1] });
        }
    }
};

const bogoSortFunc = async (arr: number[], update: Function, stats: SortStats) => {
    const isSorted = () => {
        for (let i = 0; i < arr.length - 1; i++) {
            stats.comparisons++;
            if (arr[i] > arr[i+1]) return false;
        }
        return true;
    };
    const shuffle = async () => {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            stats.swaps++;
            stats.writes += 2;
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        await update({});
    };
    while(!isSorted()) {
        await shuffle();
    }
};

// This is a wrapper around the user's code string
const userCodeFunc = (userCode: string) => async (arr: number[], update: Function, stats: SortStats) => {
    let userSortFunction;
    try {
        // Step 1: Compile the function. This can throw a SyntaxError.
        userSortFunction = new Function('return ' + userCode)();
        if (typeof userSortFunction !== 'function') {
            throw new Error("Provided code does not evaluate to a function. Make sure 'async function userSort...' is defined.");
        }
    } catch (e) {
        if (e instanceof Error) {
            // This is most likely a SyntaxError
            const finalErrorMessage = `Compilation Error: ${e.message}`;
            console.error("Error compiling user code:", finalErrorMessage, e);
            throw new Error(finalErrorMessage);
        }
        throw new Error("An unknown compilation error occurred.");
    }
    
    try {
        // Step 2: Execute the compiled function. This can throw a runtime error.
        await userSortFunction(arr, update, stats);
    } catch (e) {
        if (e instanceof Error) {
            let detailedMessage = e.message;
            if (e.stack) {
                // Try to find line and column numbers from stack trace for better feedback
                const match = e.stack.match(/<anonymous>:(\d+):(\d+)/);
                if (match) {
                    const [, line, column] = match;
                    detailedMessage = `${e.message} (at line ${line}, column ${column})`;
                }
            }
            const finalErrorMessage = `Runtime Error: ${detailedMessage}`;
            console.error("Error executing user code:", finalErrorMessage, e);
            throw new Error(finalErrorMessage);
        }
        throw new Error("An unknown runtime error occurred.");
    }
};


// FIX: Correct function overload syntax. Use `export function` for all declarations.
// FIX: Update function overloads to return Promise<SortStats | undefined> to provide final stats to the caller.
export function getAlgorithmRunner(key: 'userCode', userCode: string): (updateCallback: UpdateCallback, getDelay: () => number, getIsPaused?: () => boolean) => (arr: number[]) => Promise<SortStats | undefined>;
export function getAlgorithmRunner(key: Exclude<AlgorithmKey, 'userCode'>): (updateCallback: UpdateCallback, getDelay: () => number, getIsPaused?: () => boolean) => (arr: number[]) => Promise<SortStats | undefined>;
export function getAlgorithmRunner(key: AlgorithmKey, userCode?: string) {
    let sortFunc: (arr: number[], update: Function, stats: SortStats) => Promise<void>;

    switch (key) {
        case 'bubbleSort': sortFunc = bubbleSortFunc; break;
        case 'selectionSort': sortFunc = selectionSortFunc; break;
        case 'insertionSort': sortFunc = insertionSortFunc; break;
        case 'quickSort': sortFunc = quickSortFunc; break;
        case 'mergeSort': sortFunc = mergeSortFunc; break;
        case 'heapSort': sortFunc = heapSortFunc; break;
        case 'radixSort': sortFunc = radixSortFunc; break;
        case 'bucketSort': sortFunc = bucketSortFunc; break;
        case 'bogoSort': sortFunc = bogoSortFunc; break;
        case 'userCode': 
            if(!userCode) throw new Error("User code must be provided for 'userCode' algorithm.");
            sortFunc = userCodeFunc(userCode); 
            break;
        default: throw new Error("Unknown algorithm key");
    }

    return (updateCallback: UpdateCallback, getDelay: () => number, getIsPaused: () => boolean = () => false) => async (initialArray: number[]) => {
        const stats: SortStats = { comparisons: 0, swaps: 0, time: 0, writes: 0 };
        const arr = [...initialArray];
        let pausedTime = 0;
        let pauseStartTime = 0;

        const update = async (highlights: { comparing?: number[], swapping?: number[] } = {}, statUpdate: Partial<SortStats> = {}) => {
            Object.assign(stats, statUpdate);
            await updateCallback([...arr], highlights, stats);
            
            if (getIsPaused()) {
                pauseStartTime = performance.now();
                while (getIsPaused()) {
                    await sleep(50);
                }
                pausedTime += performance.now() - pauseStartTime;
            }

            const delay = getDelay();
            if (delay > 0) await sleep(delay);
        };
        
        const startTime = performance.now();
        try {
            await sortFunc(arr, update, stats);
        } catch (e) {
            console.error(`Error in ${key} sort:`, e);
             if (e instanceof Error) {
                await updateCallback(initialArray, {}, { ...stats, time: performance.now() - startTime - pausedTime }, `Error: ${e.message}`);
             } else {
                await updateCallback(initialArray, {}, { ...stats, time: performance.now() - startTime - pausedTime }, 'An unknown error occurred.');
             }
             return;
        }
        stats.time = performance.now() - startTime - pausedTime;
        
        await updateCallback([...arr], {}, stats); // Final update
        // FIX: Return the final stats object upon successful completion.
        return stats;
    };
}