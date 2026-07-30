import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../data/g115.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "data/g115.js" });

const banks = context.window.BANK;
if (!Array.isArray(banks) || banks.length !== 1) {
  throw new Error(`Expected one bank, received ${banks?.length ?? "none"}`);
}

const bank = banks[0];
const questions = bank.questions;
const expectedConstructed = new Set([40, 42, 44, 46, 49, 52, 54, 56, 60, 63, 65]);
const expectedAnswerSequence =
  "DADCBBDACBAADDCCDBDCDAADBACCDADBCCBACBD/B/D/A/CD/CB/B/B/BCA/CC/D/";
const disciplines = new Set(["history", "geography", "civics", "integrated"]);
const objectivePatterns = {
  history: /^H[1-9]$/,
  geography: /^G[1-9]$/,
  civics: /^C[1-7]$/,
  integrated: /^S[1-5]$/,
};

if (bank.year !== 115 || bank.era !== "學測" || bank.durationMinutes !== 110) {
  throw new Error("Bank identity or duration is incorrect");
}
if (!Array.isArray(questions) || questions.length !== 65) {
  throw new Error(`Expected 65 questions, received ${questions?.length ?? "none"}`);
}

let selectedCount = 0;
let constructedCount = 0;
let visualReviewCount = 0;
let pendingReviewCount = 0;
const disciplineCounts = {};

for (const [index, question] of questions.entries()) {
  const expectedNumber = index + 1;
  if (question.no !== expectedNumber) {
    throw new Error(`Question number mismatch at index ${index}: ${question.no}`);
  }
  if (question.group && !bank.groups[question.group]) {
    throw new Error(`Question ${question.no} references missing group ${question.group}`);
  }
  if (question.sourceReview !== "verified") pendingReviewCount += 1;
  if (question.needsVisualReview) visualReviewCount += 1;
  if (!disciplines.has(question.discipline)) {
    throw new Error(`Question ${question.no} has invalid discipline`);
  }
  if (!objectivePatterns[question.discipline].test(question.objective)) {
    throw new Error(
      `Question ${question.no} has invalid objective ${question.objective}`,
    );
  }
  if (
    !Array.isArray(question.tags) ||
    question.tags.length < 1 ||
    question.tags.length > 3 ||
    question.tags.some((tag) => typeof tag !== "string" || !tag.trim())
  ) {
    throw new Error(`Question ${question.no} has invalid controlled tags`);
  }
  disciplineCounts[question.discipline] =
    (disciplineCounts[question.discipline] ?? 0) + 1;
  if (question.image) {
    const imagePath = new URL(`../${question.image}`, import.meta.url);
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Question ${question.no} image is missing: ${question.image}`);
    }
  }

  if (expectedConstructed.has(question.no)) {
    constructedCount += 1;
    if (question.type !== "constructed" || question.answer !== undefined) {
      throw new Error(`Question ${question.no} must be constructed-response`);
    }
    if (question.pass !== undefined || question.disc !== undefined) {
      throw new Error(`Question ${question.no} must not invent P/D statistics`);
    }
    if (!question.officialRubric || !question.maxScore) {
      throw new Error(`Question ${question.no} lacks official rubric or score`);
    }
  } else {
    selectedCount += 1;
    if (question.type !== "single" || !/^[A-D]$/.test(question.answer)) {
      throw new Error(`Question ${question.no} has an invalid selected-response answer`);
    }
    if (
      JSON.stringify(Object.keys(question.options)) !==
      JSON.stringify(["A", "B", "C", "D"])
    ) {
      throw new Error(`Question ${question.no} must contain A-D in original order`);
    }
    if (
      typeof question.pass !== "number" ||
      question.pass < 0 ||
      question.pass > 1 ||
      typeof question.disc !== "number"
    ) {
      throw new Error(`Question ${question.no} lacks official selected-item statistics`);
    }
    if (
      JSON.stringify(Object.keys(question.optionStats)) !==
      JSON.stringify(["T", "H", "L"])
    ) {
      throw new Error(`Question ${question.no} lacks T/H/L option analysis`);
    }
    if (typeof question.explain !== "string" || !question.explain.trim()) {
      throw new Error(`Question ${question.no} lacks a self-study explanation`);
    }
  }
}

if (selectedCount !== 54 || constructedCount !== 11) {
  throw new Error(
    `Expected 54 selected and 11 constructed; got ${selectedCount}/${constructedCount}`,
  );
}

const actualAnswerSequence = questions
  .map((question) => question.answer ?? "/")
  .join("");
if (actualAnswerSequence !== expectedAnswerSequence) {
  throw new Error(
    `Official answer sequence mismatch:\nexpected ${expectedAnswerSequence}\nactual   ${actualAnswerSequence}`,
  );
}

for (const [groupId, group] of Object.entries(bank.groups)) {
  if (!group.passage?.trim()) {
    throw new Error(`Group ${groupId} has no passage`);
  }
  if (group.image) {
    const imagePath = new URL(`../${group.image}`, import.meta.url);
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Group ${groupId} image is missing: ${group.image}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      year: bank.year,
      questions: questions.length,
      selected: selectedCount,
      constructed: constructedCount,
      groups: Object.keys(bank.groups).length,
      disciplineCounts,
      pendingSourceReview: pendingReviewCount,
      visualReviewFlags: visualReviewCount,
      status: pendingReviewCount ? "DRAFT_NOT_DEPLOYABLE" : "VERIFIED",
    },
    null,
    2,
  ),
);
