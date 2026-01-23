
import { GoogleGenAI, Type } from "@google/genai";
import { SeparationList, OPItem } from "../types";

// Initialize the Google GenAI client with the API key from environment variables.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeLogisticsEfficiency = async (history: any[]) => {
  const prompt = `
    Analise os seguintes dados históricos de separação logística e forneça insights estratégicos:
    Dados: ${JSON.stringify(history.slice(0, 50))}
    
    Identifique:
    1. Itens com maior recorrência de falta.
    2. Gargalos no fluxo Matriz x Filial.
    3. Recomendações de endereçamento (ABC) baseadas em frequência.
    4. Sugestões de melhoria de produtividade.
    
    Responda em JSON estruturado com campos 'resumo', 'alertas' (array), 'recomendacoes' (array) e 'rankingFaltas' (array).
  `;

  try {
    // Using gemini-3-pro-preview for complex reasoning and strategic analysis tasks.
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            resumo: { type: Type.STRING },
            alertas: { type: Type.ARRAY, items: { type: Type.STRING } },
            recomendacoes: { type: Type.ARRAY, items: { type: Type.STRING } },
            rankingFaltas: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  codigo: { type: Type.STRING },
                  frequencia: { type: Type.NUMBER }
                }
              } 
            }
          }
        }
      }
    });

    // Accessing the text property directly from the GenerateContentResponse.
    const resultText = response.text;
    if (!resultText) {
      throw new Error("No text response received from Gemini API");
    }
    
    return JSON.parse(resultText.trim());
  } catch (error) {
    console.error("AI Analysis Error:", error);
    return null;
  }
};
