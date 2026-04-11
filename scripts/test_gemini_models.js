
const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GEMINI_API_KEY || "";
const genai = new GoogleGenerativeAI(API_KEY);

async function main() {
    try {
        const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("Checking if gemini-1.5-flash works...");
        // Just prompt
        // But list models is better. SDK isn't exposing listModels easily on client?
        // Actually the error suggestion says "Call ListModels".

        // Using fetch for list models raw rest api if SDK doesn't have it handy in this version
        // But let's try to just use a known stable one `gemini-1.5-flash-001` or `gemini-pro`.
        // Let's try to run a simple generateContent with gemini-1.5-flash-001

        const validModels = ["gemini-1.5-flash-001", "gemini-1.5-flash-002", "gemini-1.5-pro", "gemini-pro-vision"];

        for (const mName of validModels) {
            console.log(`Testing ${mName}...`);
            try {
                const m = genai.getGenerativeModel({ model: mName });
                const result = await m.generateContent("Hello");
                console.log(`SUCCESS: ${mName}`);
                return;
            } catch (e) {
                console.log(`FAILED: ${mName} - ${e.message}`);
            }
        }

    } catch (e) {
        console.error(e);
    }
}

main();
