
import { IntentClassifier } from './src/services/brain/intent/classifier';

// Force load to verify
console.log("--- TEST START ---");
const result1 = IntentClassifier.classify("Foundation & concealer from???");
console.log("Input: Foundation & concealer from???");
console.log("Result:", JSON.stringify(result1, null, 2));

const result2 = IntentClassifier.classify("My eyeliner always smudges after a few hours…");
console.log("Input: My eyeliner always smudges...");
console.log("Result:", JSON.stringify(result2, null, 2));

const result3 = IntentClassifier.classify("I’d go for this if there was a smaller size.");
console.log("Input: I’d go for this if there was a smaller size.");
console.log("Result:", JSON.stringify(result3, null, 2));
console.log("--- TEST END ---");
