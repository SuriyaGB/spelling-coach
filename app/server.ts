import { createServer } from "node:http";
import { URL } from "node:url";
import {
  buildSpellingCoachInput,
  buildWordPrecomputeInput,
  buildWordResponse,
  CoachingRequestSchema,
  LevelQuerySchema,
} from "./inputBuilder.js";
import { CustomWordImportRequestSchema, importCustomWords } from "./customWordImport.js";
import { getConfiguredModelName } from "./modelConfig.js";
import { hasWordTeachingPrecompute, runSplitSpellingCoachAgent, warmWordTeachingPrecompute } from "./optimizedCoach.js";
import { generatePronunciationAudio } from "./pronunciation.js";
import {
  isSpellingRulePromptHintsEnabled,
  isSpellingRuleShortlistEnabled,
} from "./referenceData.js";
import { runSpellingCoachAgent } from "./runAgent.js";
import {
  getCustomWordListById,
  getWordByText,
  listCustomWordLists,
  pickNextWord,
} from "./wordCatalog.js";

const PORT = Number(process.env.PORT ?? 3000);

function sendJson(response: import("node:http").ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendAudio(
  response: import("node:http").ServerResponse,
  statusCode: number,
  audio: Uint8Array,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "audio/mpeg",
    "Content-Length": audio.byteLength,
    "Cache-Control": "public, max-age=3600",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(Buffer.from(audio));
}

function collectBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

const server = createServer(async (request, response) => {
  if (!request.url || !request.method) {
    sendJson(response, 400, { error: "Invalid request." });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://localhost:${PORT}`);

  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      const runtime =
        process.env.SPELLING_COACH_RUNTIME === "direct"
          ? "direct"
          : "deep_agent";
      const audioCaching =
        process.env.SPELLING_COACH_AUDIO_CACHE === "off" ? "off" : "on";
      const ttsInstructions =
        process.env.SPELLING_COACH_TTS_INSTRUCTIONS === "on" ? "on" : "off";
      const spellingRuleShortlist = isSpellingRuleShortlistEnabled()
        ? "on"
        : "off";
      const spellingRulePromptHints = isSpellingRulePromptHintsEnabled()
        ? "on"
        : "off";

      sendJson(response, 200, {
        ok: true,
        runtime,
        model: getConfiguredModelName(),
        featureFlags: {
          audioCaching,
          ttsInstructions,
          spellingRuleShortlist,
          spellingRulePromptHints,
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/words/next") {
      const query = LevelQuerySchema.parse({
        level: url.searchParams.get("level"),
        customListId: url.searchParams.get("customListId") ?? undefined,
        exclude: url.searchParams.get("exclude") ?? undefined,
      });
      const word = pickNextWord(query.level, query.exclude, query.customListId);
      const precomputeInput = buildWordPrecomputeInput(word.word);
      const precomputeStart = performance.now();
      void warmWordTeachingPrecompute(precomputeInput)
        .then(() => {
          console.log(
            `[spelling-coach precompute timing] word="${word.word}" total=${(performance.now() - precomputeStart).toFixed(1)}ms`,
          );
        })
        .catch((error) => {
          console.error("Word teaching precompute failed:", error);
        });
      sendJson(response, 200, buildWordResponse(word));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/custom-lists") {
      sendJson(response, 200, {
        lists: listCustomWordLists(),
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/api/custom-lists/")
    ) {
      const parts = url.pathname.split("/");
      const listId = decodeURIComponent(parts[3] ?? "");

      if (!listId) {
        sendJson(response, 400, { error: "Custom list id is required." });
        return;
      }

      const list = getCustomWordListById(listId);
      if (!list) {
        sendJson(response, 404, {
          error: `Unknown custom list: ${listId}`,
        });
        return;
      }

      sendJson(response, 200, {
        list: {
          id: list.id,
          name: list.name,
          wordCount: list.words.length,
          words: list.words.map((word) => buildWordResponse(word)),
        },
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/api/words/") &&
      url.pathname.endsWith("/pronunciation")
    ) {
      const parts = url.pathname.split("/");
      const encodedWord = parts[3];
      const word = decodeURIComponent(encodedWord ?? "");

      if (!word) {
        sendJson(response, 400, { error: "Word is required." });
        return;
      }

      const wordEntry = getWordByText(word);
      if (!wordEntry) {
        sendJson(response, 404, { error: `Unknown word: ${word}` });
        return;
      }

      const audio = await generatePronunciationAudio(wordEntry.word);
      sendAudio(response, 200, audio);
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/spelling-coach/preview-input"
    ) {
      const rawBody = await collectBody(request);
      const requestBody = CoachingRequestSchema.parse(JSON.parse(rawBody));
      sendJson(response, 200, buildSpellingCoachInput(requestBody));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/spelling-coach") {
      const rawBody = await collectBody(request);
      const requestBody = CoachingRequestSchema.parse(JSON.parse(rawBody));
      const coachInput = buildSpellingCoachInput(requestBody);
      const result = hasWordTeachingPrecompute(coachInput)
        ? await runSplitSpellingCoachAgent(coachInput)
        : await runSpellingCoachAgent(coachInput);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/words/import-custom") {
      const rawBody = await collectBody(request);
      const requestBody = CustomWordImportRequestSchema.parse(JSON.parse(rawBody));
      const result = await importCustomWords(requestBody);
      sendJson(response, 200, {
        list: result.list,
        importedCount: result.importedCount,
        skippedExistingCount: result.skippedExistingCount,
        words: result.words.map((word) => buildWordResponse(word)),
      });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error("Spelling coach API error:", error);
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`Spelling coach API listening on http://localhost:${PORT}`);
});
