import type { InterviewQuestion } from "./types";

export const QUESTION_BANK: InterviewQuestion[] = [
  {
    id: "bq-1",
    text: "Tell me about a time you disagreed with a teammate on a technical decision. How did you handle it?",
    category: "behavioral",
  },
  {
    id: "bq-2",
    text: "Describe a project where you had to deal with significant ambiguity. What did you do?",
    category: "behavioral",
  },
  {
    id: "bq-3",
    text: "Tell me about a time you had to deliver a project under a tight deadline. What trade-offs did you make?",
    category: "behavioral",
  },
  {
    id: "bq-4",
    text: "Describe a situation where you identified a problem before anyone else did. What happened?",
    category: "behavioral",
  },
  {
    id: "bq-5",
    text: "Tell me about a time you received critical feedback. How did you respond?",
    category: "behavioral",
  },
  {
    id: "bq-6",
    text: "Describe a time you had to influence others without having direct authority over them.",
    category: "behavioral",
  },
  {
    id: "bq-7",
    text: "Tell me about a technical decision you made that you later regretted. What did you learn?",
    category: "behavioral",
  },
  {
    id: "bq-8",
    text: "Describe a situation where you had to make a decision with incomplete information.",
    category: "behavioral",
  },
  {
    id: "tq-1",
    text: "Walk me through a system you designed. What were the key architectural decisions and why?",
    category: "technical",
  },
  {
    id: "tq-2",
    text: "Tell me about a performance issue you diagnosed and fixed. What was your approach?",
    category: "technical",
  },
];

export function getRandomQuestion(
  excludeIds: string[] = []
): InterviewQuestion {
  const available = QUESTION_BANK.filter((q) => !excludeIds.includes(q.id));
  if (available.length === 0) {
    return QUESTION_BANK[Math.floor(Math.random() * QUESTION_BANK.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}
