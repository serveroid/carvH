import OpenAI from "openai";
import { AppConfig } from "./config";
import { Quest } from "./quests";
import { EvaluationResult } from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ");

const heuristicsEvaluate = (quest: Quest, answer: string): EvaluationResult => {
  const normalizedAnswer = normalize(answer);

  const keywordMatches = quest.keywords.reduce((acc, keyword) => {
    return normalizedAnswer.includes(keyword.toLowerCase()) ? acc + 1 : acc;
  }, 0);

  const keywordCoverage = quest.keywords.length
    ? (keywordMatches / quest.keywords.length) * 100
    : 50;

  const lengthScore = (() => {
    if (answer.length < quest.minAnswerLength) {
      return Math.max(0, (answer.length / quest.minAnswerLength) * 40);
    }
    const optimalRange = quest.maxAnswerLength - quest.minAnswerLength || quest.minAnswerLength;
    const clampedLength = Math.min(answer.length, quest.maxAnswerLength);
    const relative = clampedLength - quest.minAnswerLength;
    return clamp((relative / optimalRange) * 40 + 30, 0, 45);
  })();

  const formatPenalty = answer.includes("lorem ipsum") ? -30 : 0;

  const rawScore = clamp(lengthScore + keywordCoverage * 0.6 + formatPenalty, 0, 100);
  const reasoningParts: string[] = [];

  if (keywordMatches === quest.keywords.length) {
    reasoningParts.push("All keywords found");
  } else if (keywordMatches > 0) {
    reasoningParts.push(`Detected ${keywordMatches}/${quest.keywords.length} keywords`);
  } else {
    reasoningParts.push("No keywords detected");
  }

  if (answer.length < quest.minAnswerLength) {
    reasoningParts.push("Answer is below the minimum length");
  } else if (answer.length > quest.maxAnswerLength) {
    reasoningParts.push("Answer exceeds the length limit; only the first part was scored");
  } else {
    reasoningParts.push("Answer length within limits");
  }

  return {
    score: Math.round(rawScore),
    reasoning: reasoningParts.join(". "),
    usedLLM: false
  };
};

const openaiEvaluate = async (quest: Quest, answer: string, apiKey: string): Promise<EvaluationResult> => {
  const client = new OpenAI({ apiKey });

  const prompt = `You are scoring a user submission for a quest.
Quest: ${quest.title}
Instructions: ${quest.instructions}

Score the answer from 0 to 100. Provide a very short explanation (<= 100 characters).
Return JSON {"score": number, "reasoning": string}.`;

  const requestPayload = {
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: "You are a strict but fair judge. Keep responses brief."
      },
      {
        role: "user",
        content: `User answer:\n${answer}`
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "agentquest_score",
        schema: {
          type: "object",
          properties: {
            score: {
              type: "integer",
              minimum: 0,
              maximum: 100
            },
            reasoning: {
              type: "string",
              maxLength: 120
            }
          },
          required: ["score", "reasoning"]
        }
      }
    }
  };

  const response = await client.responses.create(requestPayload as unknown as any);

  const outputText = response.output_text;
  if (!outputText) {
    throw new Error("OpenAI response missing output_text");
  }

  const parsed = JSON.parse(outputText) as { score: number; reasoning: string };

  return {
    score: clamp(parsed.score),
    reasoning: parsed.reasoning,
    usedLLM: true
  };
};

export const evaluateAnswer = async (quest: Quest, answer: string): Promise<EvaluationResult> => {
  if (AppConfig.openAIApiKey) {
    try {
      return await openaiEvaluate(quest, answer, AppConfig.openAIApiKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      const fallback = heuristicsEvaluate(quest, answer);
      return {
        ...fallback,
        reasoning: `LLM evaluation unavailable (${message}). ${fallback.reasoning}`,
        usedLLM: false
      };
    }
  }

  return heuristicsEvaluate(quest, answer);
};
