import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const sourceFiles = fs
  .readdirSync(dataDir)
  .filter((name) => /^g\d{2,3}\.js$/.test(name))
  .sort();
const context = { window: {} };

for (const sourceFile of sourceFiles) {
  const source = fs.readFileSync(path.join(dataDir, sourceFile), "utf8");
  vm.runInNewContext(source, context, { filename: `data/${sourceFile}` });
}

const banks = context.window.BANK;
if (!Array.isArray(banks) || banks.length !== sourceFiles.length) {
  throw new Error(
    `Expected ${sourceFiles.length} banks, received ${banks?.length ?? "none"}`,
  );
}

const disciplines = new Set(["history", "geography", "civics", "integrated"]);
const objectivePatterns = {
  history: /^H[1-9]$/,
  geography: /^G[1-9]$/,
  civics: /^C[1-7]$/,
  integrated: /^S[1-5]$/,
};
const seenYears = new Set();
const reports = [];

for (const bank of banks) {
  if (seenYears.has(bank.year)) {
    throw new Error(`Duplicate bank year ${bank.year}`);
  }
  seenYears.add(bank.year);
  const expectedDuration = bank.year >= 111 ? 110 : 100;
  if (bank.era !== "學測" || bank.durationMinutes !== expectedDuration) {
    throw new Error(`${bank.year} bank identity or duration is incorrect`);
  }

  const metadataPath = path.join(
    root,
    "sources",
    String(bank.year),
    "official-metadata.json",
  );
  if (!fs.existsSync(metadataPath)) {
    throw new Error(`${bank.year} lacks official-metadata.json`);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const questions = bank.questions;
  const expectedConstructed = new Set(metadata.constructedQuestionNumbers);
  if (!Array.isArray(questions) || questions.length !== metadata.questionCount) {
    throw new Error(
      `${bank.year} expected ${metadata.questionCount} questions, ` +
        `received ${questions?.length ?? "none"}`,
    );
  }

  let selectedCount = 0;
  let constructedCount = 0;
  let visualReviewCount = 0;
  let pendingReviewCount = 0;
  const disciplineCounts = {};

  for (const [index, question] of questions.entries()) {
    const expectedNumber = index + 1;
    const official = metadata.questions[String(expectedNumber)];
    if (question.no !== expectedNumber) {
      throw new Error(
        `${bank.year} question number mismatch at index ${index}: ${question.no}`,
      );
    }
    if (!official) {
      throw new Error(`${bank.year}-${question.no} lacks official metadata`);
    }
    if (question.group && !bank.groups[question.group]) {
      throw new Error(
        `${bank.year}-${question.no} references missing group ${question.group}`,
      );
    }
    if (question.sourceReview !== "verified") pendingReviewCount += 1;
    if (question.needsVisualReview) visualReviewCount += 1;
    if (!disciplines.has(question.discipline)) {
      throw new Error(`${bank.year}-${question.no} has invalid discipline`);
    }
    if (!objectivePatterns[question.discipline].test(question.objective)) {
      throw new Error(
        `${bank.year}-${question.no} has invalid objective ${question.objective}`,
      );
    }
    if (
      !Array.isArray(question.tags) ||
      question.tags.length < 1 ||
      question.tags.length > 3 ||
      question.tags.some((tag) => typeof tag !== "string" || !tag.trim())
    ) {
      throw new Error(`${bank.year}-${question.no} has invalid controlled tags`);
    }
    if (typeof question.stem !== "string" || !question.stem.trim()) {
      throw new Error(`${bank.year}-${question.no} has an empty stem`);
    }
    disciplineCounts[question.discipline] =
      (disciplineCounts[question.discipline] ?? 0) + 1;
    if (question.image) {
      const imagePath = path.join(root, question.image);
      if (!fs.existsSync(imagePath)) {
        throw new Error(
          `${bank.year}-${question.no} image is missing: ${question.image}`,
        );
      }
    }

    if (expectedConstructed.has(question.no)) {
      constructedCount += 1;
      if (
        question.type !== "constructed" ||
        question.answer !== undefined ||
        official.answer !== null
      ) {
        throw new Error(
          `${bank.year}-${question.no} must be constructed-response`,
        );
      }
      if (question.pass !== undefined || question.disc !== undefined) {
        throw new Error(
          `${bank.year}-${question.no} must not invent P/D statistics`,
        );
      }
      if (
        !question.maxScore ||
        question.officialRubric !== official.officialRubric
      ) {
        throw new Error(
          `${bank.year}-${question.no} official rubric does not match source metadata`,
        );
      }
    } else {
      selectedCount += 1;
      const optionKeys = Object.keys(question.options);
      const expectedKeys =
        bank.year === 90 && (question.no <= 12 || question.no >= 51)
          ? ["A", "B", "C", "D", "E"]
          : ["A", "B", "C", "D"];
      let answerMatches = false;
      if (official.answer === null) {
        answerMatches =
          question.type === "single" &&
          JSON.stringify(question.acceptedAnswers) === JSON.stringify(expectedKeys);
      } else if (Array.isArray(official.answer)) {
        answerMatches =
          question.type === "single" &&
          question.answer === official.answer[0] &&
          JSON.stringify(question.acceptedAnswers) ===
            JSON.stringify(official.answer);
      } else if (official.answer.length > 1) {
        answerMatches =
          question.type === "multiple" && question.answer === official.answer;
      } else {
        answerMatches =
          question.type === "single" && question.answer === official.answer;
      }
      if (!answerMatches) {
        throw new Error(
          `${bank.year}-${question.no} selected-response answer mismatch`,
        );
      }
      if (JSON.stringify(optionKeys) !== JSON.stringify(expectedKeys)) {
        throw new Error(
          `${bank.year}-${question.no} has incorrect option order`,
        );
      }
      if (metadata.statisticsAvailable === false) {
        if (
          question.pass !== undefined ||
          question.disc !== undefined ||
          question.optionStats !== undefined ||
          question.statisticsAvailable !== false
        ) {
          throw new Error(`${bank.year}-${question.no} invents unavailable statistics`);
        }
      } else {
        if (
          question.pass !== official.scoreRate / 100 ||
          question.disc !== official.discrimination
        ) {
          throw new Error(
            `${bank.year}-${question.no} official P/D statistics mismatch`,
          );
        }
        if (
          JSON.stringify(question.optionStats) !==
          JSON.stringify(official.optionAnalysis)
        ) {
          throw new Error(
            `${bank.year}-${question.no} official option analysis mismatch`,
          );
        }
      }
      if (typeof question.explain !== "string" || !question.explain.trim()) {
        throw new Error(
          `${bank.year}-${question.no} lacks a self-study explanation`,
        );
      }
    }
  }

  if (
    selectedCount !== metadata.selectedCount ||
    constructedCount !== metadata.constructedCount
  ) {
    throw new Error(
      `${bank.year} expected ${metadata.selectedCount}/${metadata.constructedCount} ` +
        `selected/constructed; got ${selectedCount}/${constructedCount}`,
    );
  }

  for (const [groupId, group] of Object.entries(bank.groups)) {
    if (!group.passage?.trim()) {
      throw new Error(`${bank.year} group ${groupId} has no passage`);
    }
    if (group.image) {
      const imagePath = path.join(root, group.image);
      if (!fs.existsSync(imagePath)) {
        throw new Error(
          `${bank.year} group ${groupId} image is missing: ${group.image}`,
        );
      }
    }
  }

  reports.push({
    year: bank.year,
    questions: questions.length,
    selected: selectedCount,
    constructed: constructedCount,
    groups: Object.keys(bank.groups).length,
    disciplineCounts,
    pendingSourceReview: pendingReviewCount,
    visualReviewFlags: visualReviewCount,
    status:
      pendingReviewCount || visualReviewCount
        ? "DRAFT_NOT_DEPLOYABLE"
        : "VERIFIED",
  });
}

reports.sort((a, b) => b.year - a.year);
console.log(
  JSON.stringify(
    {
      years: reports,
      totals: {
        years: reports.length,
        questions: reports.reduce((sum, report) => sum + report.questions, 0),
        selected: reports.reduce((sum, report) => sum + report.selected, 0),
        constructed: reports.reduce((sum, report) => sum + report.constructed, 0),
      },
      status: reports.every((report) => report.status === "VERIFIED")
        ? "VERIFIED"
        : "DRAFT_NOT_DEPLOYABLE",
    },
    null,
    2,
  ),
);
