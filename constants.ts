
import { AlgorithmKey } from './types';

export const ALGORITHMS: { [key in Exclude<AlgorithmKey, 'userCode'>]: { name: string, description: string } } = {
    bubbleSort: { 
        name: 'Bubble Sort "The Bumbling Brute"',
        description: "Compares adjacent elements and swaps them if they are in the wrong order. Simple but slow."
    },
    selectionSort: { 
        name: 'Selection Sort "The Methodical Miner"',
        description: "Repeatedly finds the minimum element from the unsorted part and puts it at the beginning."
    },
    insertionSort: { 
        name: 'Insertion Sort "The Patient Card Player"',
        description: "Builds the final sorted array one item at a time. Efficient for small or nearly-sorted datasets."
    },
    quickSort: { 
        name: 'Quick Sort "The Swift Strategist"',
        description: "A fast, recursive 'divide and conquer' algorithm that picks a pivot and partitions the array around it."
    },
    mergeSort: { 
        name: 'Merge Sort "The Divide and Conqueror"',
        description: "Another 'divide and conquer' algorithm. It divides the array into halves, sorts them, and then merges them back."
    },
    heapSort: { 
        name: 'Heap Sort "The Heap King"',
        description: "A comparison-based sorting technique based on a Binary Heap data structure."
    },
    radixSort: { 
        name: 'Radix Sort "The Digital Postman"',
        description: "A non-comparative integer sorting algorithm that sorts data with integer keys by grouping keys by individual digits."
    },
    bucketSort: { 
        name: 'Bucket Sort "The Organized Collector"',
        description: "Distributes elements into a number of buckets. Each bucket is then sorted individually."
    },
    bogoSort: { 
        name: 'Bogo Sort "The Agent of Chaos"',
        description: "Randomly shuffles the array until it is sorted. Do not use for serious work!"
    },
};

export const DEFAULT_USER_CODE = `/**
 * Asynchronously sorts an array of numbers.
 * @param {number[]} arr The array to sort (modify in place).
 * @param {function} update A callback to visualize changes. 
 *   Call it like: await update({ comparing: [i, j] });
 * @param {object} stats An object to track performance. 
 *   Increment stats.comparisons, stats.swaps, and stats.writes.
 */
async function userSort(arr, update, stats) {
  // Your sorting logic here...
  // Example: A simple (and inefficient) Bubble Sort
  let n = arr.length;
  let swapped;
  do {
    swapped = false;
    for (let i = 0; i < n - 1; i++) {
      stats.comparisons++;
      await update({ comparing: [i, i + 1] });

      if (arr[i] > arr[i + 1]) {
        stats.swaps++;
        stats.writes += 2; // A swap involves two array writes
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        swapped = true;
        await update({ swapping: [i, i + 1] });
      }
    }
    n--;
  } while (swapped);
  
  // Important: Finish with a final update to clear highlights
  await update({});
}
`;

export const DEFAULT_PYTHON_CODE = `"""
Asynchronously sorts a list of numbers.
This Python code will be transpiled to JavaScript to run in the browser.

Args:
    arr: The list to sort (will be modified in place).
    update: A function to visualize changes. 
            Call it like: await update({'comparing': [i, j]})
    stats: An object to track performance. 
           Increment stats.comparisons, stats.swaps, etc.
"""
async def user_sort(arr, update, stats):
    # Your sorting logic here...
    # Example: A simple Bubble Sort in Python
    n = len(arr)
    swapped = True
    while swapped:
        swapped = False
        for i in range(n - 1):
            stats.comparisons += 1
            await update({'comparing': [i, i + 1]})

            if arr[i] > arr[i + 1]:
                stats.swaps += 1
                stats.writes += 2
                arr[i], arr[i+1] = arr[i+1], arr[i] # Swap elements
                swapped = True
                await update({'swapping': [i, i + 1]})
        n -= 1
    
    # Important: Finish with a final update to clear highlights
    await update({})
`;
