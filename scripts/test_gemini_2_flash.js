
const { GoogleGenerativeAI } = require("@google/generative-ai");

const API_KEY = process.env.GEMINI_API_KEY || "";
const genai = new GoogleGenerativeAI(API_KEY);

async function main() {
    console.log("Testing gemini-2.0-flash...");
    try {
        const model = genai.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent("Explain what League of Legends is in one sentence.");
        console.log("Response received:");
        console.log(result.response.text());
        console.log("SUCCESS: gemini-2.0-flash is working.");
    } catch (e) {
        console.error("FAILED: gemini-2.0-flash");
        console.error(e.message);
        if (e.response) {
            console.error("Error details:", JSON.stringify(e.response, null, 2));
        }
    }
}

main();
