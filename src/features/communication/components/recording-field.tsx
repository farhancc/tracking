"use client";

import { Mic, Square, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type State =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "recorded"; blob: Blob; url: string; seconds: number }
  | { kind: "uploading" }
  | { kind: "attached"; id: string; url: string }
  | { kind: "error"; message: string };

const MAX_SECONDS = 10 * 60;

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

/**
 * Records audio in the browser (or takes an audio file), uploads it to
 * /api/v1/communication/recordings and puts the recording id in a hidden
 * input named `name`, so the surrounding Server Action form submits it.
 */
export function RecordingField({ name = "recordingId", label = "Audio recording (optional)" }: { name?: string; label?: string }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const wrapper = useRef<HTMLDivElement>(null);

  // Reset when the surrounding form resets after a successful submit.
  useEffect(() => {
    const form = wrapper.current?.closest("form");
    if (!form) return;
    const onReset = () => setState({ kind: "idle" });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  useEffect(() => {
    if (state.kind !== "recording") return;
    const t = setInterval(() => {
      const s = Math.round((Date.now() - state.startedAt) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return () => clearInterval(t);
  }, [state]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMime();
      const r = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
      chunks.current = [];
      const startedAt = Date.now();
      r.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || mimeType || "audio/webm" });
        setState({ kind: "recorded", blob, url: URL.createObjectURL(blob), seconds: Math.round((Date.now() - startedAt) / 1000) });
      };
      recorder.current = r;
      r.start(1000);
      setElapsed(0);
      setState({ kind: "recording", startedAt });
    } catch {
      setState({ kind: "error", message: "Microphone not available. Allow microphone access, or upload an audio file instead." });
    }
  }

  async function upload(blob: Blob, seconds: number | null, filename: string) {
    setState({ kind: "uploading" });
    const body = new FormData();
    body.append("file", blob, filename);
    if (seconds) body.append("durationSeconds", String(seconds));
    const res = await fetch("/api/v1/communication/recordings", { method: "POST", body });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setState({ kind: "error", message: json?.error?.message ?? "Upload failed." });
      return;
    }
    setState({ kind: "attached", id: json.data.id, url: `/api/v1/communication/recordings/${json.data.id}` });
  }

  return (
    <div ref={wrapper} className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
      <span className="text-sm font-medium">{label}</span>
      <input type="hidden" name={name} value={state.kind === "attached" ? state.id : ""} />
      {state.kind === "idle" || state.kind === "error" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={start}>
            <Mic aria-hidden /> Record
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border px-4 text-sm hover:bg-accent">
            <Upload className="size-4" aria-hidden /> Upload audio
            <input
              type="file"
              accept="audio/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f, null, f.name);
              }}
            />
          </label>
          {state.kind === "error" ? <p className="w-full text-xs text-destructive">{state.message}</p> : null}
        </div>
      ) : null}
      {state.kind === "recording" ? (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm text-destructive" aria-live="polite">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
            Recording {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
          <Button type="button" className="h-11" onClick={() => recorder.current?.stop()}>
            <Square aria-hidden /> Stop
          </Button>
        </div>
      ) : null}
      {state.kind === "recorded" ? (
        <div className="flex flex-col gap-2">
          <audio controls src={state.url} className="w-full" />
          <div className="flex gap-2">
            <Button type="button" className="h-10" onClick={() => upload(state.blob, state.seconds, "recording.webm")}>
              <Upload aria-hidden /> Attach recording
            </Button>
            <Button type="button" variant="ghost" className="h-10" onClick={() => setState({ kind: "idle" })}>
              <Trash2 aria-hidden /> Discard
            </Button>
          </div>
        </div>
      ) : null}
      {state.kind === "uploading" ? <p className="text-sm text-muted-foreground">Uploading…</p> : null}
      {state.kind === "attached" ? (
        <div className="flex flex-col gap-1">
          <audio controls src={state.url} className="w-full" preload="metadata" />
          <p className="text-xs text-success">Recording attached. Save the form to keep it.</p>
        </div>
      ) : null}
    </div>
  );
}
