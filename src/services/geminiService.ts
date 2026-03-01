import { GoogleGenAI, Type } from "@google/genai";
import { Track } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function composeMix(tracks: Track[]) {
  const prompt = `
    You are a professional world-class DJ. 
    I have a list of tracks with their BPM (tempo) and Key.
    Your task is to order these tracks to create a smooth, high-energy DJ set.
    
    Rules for the mix:
    1. Start with a medium energy track.
    2. Gradually increase the BPM or energy.
    3. Try to match keys where possible (Camelot wheel logic).
    4. Provide a brief "transition note" for each track explaining why it follows the previous one.

    Tracks:
    ${tracks.map((t, i) => `${i}: ${t.name} by ${t.artists.map(a => a.name).join(', ')} (BPM: ${t.tempo}, Key: ${t.key})`).join('\n')}

    Return the result as a JSON array of objects, each containing:
    - trackId: the ID of the track
    - transitionNote: a short sentence about the mix transition.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            trackId: { type: Type.STRING },
            transitionNote: { type: Type.STRING }
          },
          required: ["trackId", "transitionNote"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return tracks.map(t => ({ trackId: t.id, transitionNote: "Smooth transition." }));
  }
}
