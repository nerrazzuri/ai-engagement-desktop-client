
const { IntentClassifier } = require('./dist/services/brain/intent/classifier');

console.log("--- DIST TEST START ---");
try {
    const result1 = IntentClassifier.classify("Foundation & concealer from???");
    console.log("Input: Foundation & concealer from???");
    console.log("Result:", JSON.stringify(result1, null, 2));
} catch (e) {
    console.error("Dist Test Error:", e);
}
console.log("--- DIST TEST END ---");
