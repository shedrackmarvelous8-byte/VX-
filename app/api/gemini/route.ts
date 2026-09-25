import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

// Initialize the Gemini client server-side
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export async function POST(req: NextRequest) {
  try {
    const { prompt, systemInstruction, mode } = await req.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Determine target instruction or system context based on mode
    let targetInstruction = systemInstruction || "You are a professional software engineer and architect.";
    if (mode === "idea") {
      targetInstruction += " Keep suggestions creative, modern, feasible, and highly detailed.";
    } else if (mode === "refine") {
      targetInstruction += " Refine and clean up the user's rough prompt, outputting ONLY the polished prompt inside a markdown block.";
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: targetInstruction,
        temperature: 0.7,
      },
    });

    const resultText = response.text || "No response received from the model.";

    return NextResponse.json({ text: resultText });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error calling Gemini API" },
      { status: 500 }
    );
  }
}
