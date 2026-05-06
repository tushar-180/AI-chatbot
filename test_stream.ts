import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config({ path: "server/.env" });

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const res = await ai.models.generateContentStream({
      model: "gemini-3.1-flash-lite-preview",
      contents: "Hello"
    } as any);
    for await (const chunk of res) {
      console.log(chunk.text);
    }
  } catch (e) {
    console.error("Error:", e);
  }
}
run();
