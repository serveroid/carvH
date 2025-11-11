export type Quest = {
  id: string;
  title: string;
  category: string;
  difficulty: "Beginner" | "Advanced" | "Expert";
  description: string;
  instructions: string;
  evaluationCriteria: string[];
  keywords: string[];
  minAnswerLength: number;
  maxAnswerLength: number;
  previewLimit: number;
  recommendedTimeMinutes: number;
  sampleAnswer: string;
};

export const quests: Quest[] = [
  {
    id: "summarize-news",
    title: "Summarize a news article in 3 sentences",
    category: "Content",
    difficulty: "Beginner",
    description:
      "Extract only the facts and consequences from a news article. Avoid opinions and marketing language. Show that you can retell information concisely and precisely.",
    instructions:
      "Pick a news text (for example from a technology section) and summarize it in exactly three sentences. Keep a factual, neutral tone.",
    evaluationCriteria: ["Structure: exactly 3 sentences", "Contains key facts and impact", "No marketing adjectives"],
    keywords: ["news", "summary", "technology", "launch", "update"],
    minAnswerLength: 160,
    maxAnswerLength: 1200,
    previewLimit: 150,
    recommendedTimeMinutes: 5,
    sampleAnswer:
      "Company X launched a 3D texture generation platform that saves studios up to 40% of asset production time. A pilot rollout is already live inside three North American game studios. The team plans to open the API to external tools in Q2."
  },
  {
    id: "sql-aggregate",
    title: "SQL: calculate revenue by country",
    category: "Data & SQL",
    difficulty: "Advanced",
    description:
      "Verify data-analysis skills. Calculate the total revenue by country and order the result. This is a classic BI dashboard query.",
    instructions:
      "Write SQL that computes SUM(revenue) by country with descending order. Use table sales(country TEXT, revenue NUMERIC).",
    evaluationCriteria: [
      "Uses GROUP BY with an aggregate function",
      "Orders by the aggregate in descending order",
      "Readable query with clear aliases"
    ],
    keywords: ["select", "sum", "revenue", "group by", "order by", "country"],
    minAnswerLength: 80,
    maxAnswerLength: 1000,
    previewLimit: 110,
    recommendedTimeMinutes: 4,
    sampleAnswer:
      "SELECT country, SUM(revenue) AS total_revenue FROM sales GROUP BY country ORDER BY total_revenue DESC;"
  },
  {
    id: "unit-test",
    title: "Write a unit test for a function",
    category: "Engineering",
    difficulty: "Advanced",
    description:
      "Demonstrate the ability to write clear, precise unit tests. The goal is to ensure a function correctly averages scores and rounds the result.",
    instructions:
      "Write a Jest test for calculateAgentScore(answers). It should verify that the function averages the scores and rounds to the nearest integer.",
    evaluationCriteria: ["Arrange-Act-Assert structure", "Covers rounding logic", "Readable with clear fixtures"],
    keywords: ["test", "jest", "expect", "toBe", "describe", "it"],
    minAnswerLength: 120,
    maxAnswerLength: 1800,
    previewLimit: 160,
    recommendedTimeMinutes: 6,
    sampleAnswer:
      "it('returns the rounded average score', () => {\n  const answers = [80, 92, 77];\n  expect(calculateAgentScore(answers)).toBe(83);\n});"
  },
  {
    id: "api-error-handling",
    title: "API: outline an error-handling plan",
    category: "Product Thinking",
    difficulty: "Beginner",
    description:
      "Describe how a service should behave during API outages. Highlight priorities and near-term mitigation steps.",
    instructions:
      "Explain how a handled-service must react if an external payments API returns 500. Specify priority, core actions, and how you communicate with users.",
    evaluationCriteria: ["Includes priority (P0/P1)", "Lists engineering steps", "Provides user-facing messaging"],
    keywords: ["500", "payment", "priority", "notify", "retry"],
    minAnswerLength: 140,
    maxAnswerLength: 1000,
    previewLimit: 150,
    recommendedTimeMinutes: 5,
    sampleAnswer:
      "P0 incident. Immediately place the front-end flow into a “try again later” mode, log every request, and disable automatic charges. Notify customers via banner and email with a promise to update them within 30 minutes."
  },
  {
    id: "prompt-guardrails",
    title: "Design guardrails for an LLM",
    category: "AI Ops",
    difficulty: "Expert",
    description:
      "Propose safeguards that keep an LLM agent from producing unwanted outputs. Provide concrete rules and checks.",
    instructions:
      "Describe guardrails for a support agent that must only reply based on a knowledge base. Give at least three classes of constraints and explain how to enforce them.",
    evaluationCriteria: ["Constraints are clearly defined", "Automatic checks are proposed", "Fallback plan is included"],
    keywords: ["guardrail", "fallback", "moderation", "policy", "control"],
    minAnswerLength: 220,
    maxAnswerLength: 1600,
    previewLimit: 180,
    recommendedTimeMinutes: 8,
    sampleAnswer:
      "1) Topic filter: regex plus a classifier block the LLM from touching finance/medical topics. 2) Link filter: check domains against a whitelist and add a safe disclaimer. 3) Tone monitor: when no answer is found, always fall back to “escalating to a human operator.”"
  },
  {
    id: "debug-log",
    title: "Find a bug via logs",
    category: "Debug",
    difficulty: "Beginner",
    description: "Show that you can read logs without an IDE. Explain what went wrong and how to fix it.",
    instructions:
      "Given the log `TypeError: Cannot read properties of undefined (reading 'length')` at `formatResults(response.items)`, explain the root cause and suggest a fix.",
    evaluationCriteria: ["Correctly identifies the cause", "Provides reproduction steps", "Suggests two possible fixes"],
    keywords: ["undefined", "length", "response", "validation", "check"],
    minAnswerLength: 110,
    maxAnswerLength: 900,
    previewLimit: 150,
    recommendedTimeMinutes: 4,
    sampleAnswer:
      "Cause: the API returned `items: null`, and formatResults never checks for null. Reproduce by calling the API without filters. Fixes: 1) add a guard `if (!Array.isArray(items)) return []`; 2) ensure the backend always returns an array."
  }
];

export const questMap = new Map(quests.map((quest) => [quest.id, quest]));
