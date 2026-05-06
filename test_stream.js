const { GoogleGenAI } = require("@google/genai");
const dotenv = require("dotenv");
dotenv.config({ path: "server/.env" });

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContentStream({
      model: "gemini-3.1-flash-lite-preview",
      contents: "Hello",
    });
    for await (const chunk of res) {
      console.log(chunk.text);
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}
run();
