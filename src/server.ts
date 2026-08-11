import express from "express";
import path from "node:path";
import { EventEmitter } from "node:events";
import { exists } from "./utils.js";
import { generateStory } from "./pipeline.js";
import { runTTS } from "./tts/index.js";
import type { ProgressEvent, TtsProgressEvent } from "./types.js";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve("public")));
app.use("/output", express.static(path.resolve("output")));

interface GenerateJob {
  name: string;
  status: "running" | "done" | "error" | "stopped";
  events: ProgressEvent[];
  abortRequested: boolean;
  error?: string;
}
let generateJob: GenerateJob | null = null;
const progressEmitter = new EventEmitter();

interface TTSJob {
  name: string;
  status: "running" | "done" | "error";
  events: TtsProgressEvent[];
  error?: string;
}
let ttsJob: TTSJob | null = null;
const ttsEmitter = new EventEmitter();

// --- routes ---

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Story Generator UI: http://localhost:${PORT}`);
});
