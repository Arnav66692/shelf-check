"use client";

import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { confirmRead, decodeRgba, normaliseScan } from "@/lib/barcode";

type BarcodeScannerProps = {
  onScan: (digits: string) => void;
  onClose: () => void;
};

type Decode = (frame: CanvasRenderingContext2D, tryRotated: boolean) => Promise<string | null>;

type CameraResult = { ok: true; stream: MediaStream } | { ok: false; message: string };

interface NativeDetector {
  detect(image: HTMLCanvasElement): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const NATIVE_FORMATS = ["upc_a", "ean_13"];
const SCAN_PAUSE_MS = 100;
const LIVE_MAX_SIDE = 1280;
const PHOTO_MAX_SIDE = 1600;
const PHOTO_SHRINKS = [1, 0.8, 0.65];

const MESSAGES = {
  insecure: "The camera needs https or localhost. Use a photo of the barcode.",
  denied: "Camera permission was denied. Use a photo of the barcode.",
  noCamera: "No camera was found. Use a photo of the barcode.",
  cameraFailed: "The camera could not start. Use a photo of the barcode.",
  scannerFailed: "The scanner stopped working. Close it and type the code on the label.",
  photoEmpty: "Could not find a barcode in that photo.",
  photoUnreadable: "That photo could not be opened.",
} as const;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newFrame(): CanvasRenderingContext2D {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot draw to a canvas.");
  return context;
}

function paint(frame: CanvasRenderingContext2D, source: HTMLVideoElement | ImageBitmap, width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  frame.canvas.width = Math.max(1, Math.round(width * scale));
  frame.canvas.height = Math.max(1, Math.round(height * scale));
  frame.drawImage(source, 0, 0, frame.canvas.width, frame.canvas.height);
}

async function createNativeDecode(): Promise<Decode | null> {
  const Native = (window as Window & { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Native) return null;
  const supported = await Native.getSupportedFormats().catch((): string[] => []);
  // Some detectors only list ean_13 and report a UPC-A as an EAN-13 with a leading 0, which normaliseScan undoes.
  if (!supported.includes("ean_13")) return null;
  const detector = new Native({ formats: NATIVE_FORMATS.filter((format) => supported.includes(format)) });
  return async (frame) => {
    const found = await detector.detect(frame.canvas);
    const valid = new Set(found.flatMap((barcode) => normaliseScan(barcode.rawValue)?.digits ?? []));
    return valid.size === 1 ? [...valid][0] : null;
  };
}

async function createDecode(): Promise<Decode> {
  const native = await createNativeDecode();
  if (native) return native;
  return (frame, tryRotated) => {
    const { data, width, height } = frame.getImageData(0, 0, frame.canvas.width, frame.canvas.height);
    return decodeRgba(data, width, height, { tryRotated });
  };
}

function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return MESSAGES.denied;
  if (name === "NotFoundError" || name === "OverconstrainedError") return MESSAGES.noCamera;
  return MESSAGES.cameraFailed;
}

async function openCamera(): Promise<CameraResult> {
  if (!window.isSecureContext) return { ok: false, message: MESSAGES.insecure };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, message: MESSAGES.noCamera };
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: LIVE_MAX_SIDE } },
    });
    return { ok: true, stream };
  } catch (error) {
    return { ok: false, message: cameraMessage(error) };
  }
}

function startCamera(
  video: HTMLVideoElement,
  loadDecode: () => Promise<Decode>,
  onRead: (digits: string) => void,
  onProblem: (message: string) => void,
): () => void {
  let stopped = false;
  let stream: MediaStream | null = null;

  const stop = () => {
    stopped = true;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  };

  const run = async () => {
    const camera = await openCamera();
    if (!camera.ok) {
      if (!stopped) onProblem(camera.message);
      return;
    }
    stream = camera.stream;
    if (stopped) {
      stop();
      return;
    }
    video.srcObject = stream;
    await video.play();
    const decode = await loadDecode();
    const frame = newFrame();
    let pending: string | null = null;
    while (!stopped) {
      if (video.videoWidth > 0) {
        paint(frame, video, video.videoWidth, video.videoHeight, LIVE_MAX_SIDE);
        const raw = await decode(frame, false);
        if (stopped) return;
        if (raw !== null) {
          const read = confirmRead(pending, raw);
          pending = read.pending;
          if (read.confirmed !== null) {
            onRead(read.confirmed);
            return;
          }
        }
      }
      await pause(SCAN_PAUSE_MS);
    }
  };

  run().catch(() => {
    if (stopped) return;
    stop();
    onProblem(MESSAGES.scannerFailed);
  });

  return stop;
}

async function readPhoto(file: File, decode: Decode): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  try {
    const frame = newFrame();
    let pending: string | null = null;
    // A photo is one picture, so it is read at several sizes to get two separate reads that must agree.
    for (const shrink of PHOTO_SHRINKS) {
      paint(frame, bitmap, bitmap.width, bitmap.height, PHOTO_MAX_SIDE * shrink);
      const raw = await decode(frame, true);
      if (raw === null) continue;
      const read = confirmRead(pending, raw);
      if (read.confirmed !== null) return read.confirmed;
      pending = read.pending;
    }
    return null;
  } finally {
    bitmap.close();
  }
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const titleId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const stopCameraRef = useRef<(() => void) | null>(null);
  const decodeRef = useRef<Promise<Decode> | null>(null);
  const finishedRef = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  function loadDecode(): Promise<Decode> {
    decodeRef.current ??= createDecode().catch((error: unknown) => {
      decodeRef.current = null;
      throw error;
    });
    return decodeRef.current;
  }

  function stopScanning() {
    finishedRef.current = true;
    stopCameraRef.current?.();
  }

  function deliver(digits: string) {
    if (finishedRef.current) return;
    stopScanning();
    onScan(digits);
  }

  function close() {
    stopScanning();
    onClose();
  }

  const cameraRead = useEffectEvent(deliver);
  const cameraDecode = useEffectEvent(loadDecode);

  useEffect(() => {
    closeRef.current?.focus();
    const video = videoRef.current;
    if (!video) return;
    finishedRef.current = false;
    const stop = startCamera(
      video,
      () => cameraDecode(),
      (digits) => cameraRead(digits),
      (problem) => setMessage(problem),
    );
    stopCameraRef.current = stop;
    return () => {
      finishedRef.current = true;
      stopCameraRef.current = null;
      stop();
    };
  }, []);

  async function handlePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setMessage(null);
    try {
      const digits = await readPhoto(file, await loadDecode());
      if (digits === null) setMessage(MESSAGES.photoEmpty);
      else deliver(digits);
    } catch {
      setMessage(MESSAGES.photoUnreadable);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close();
  }

  return (
    <section className="facts" role="dialog" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <h2 id={titleId} className="facts-title">
        Scan the barcode
      </h2>
      <video
        ref={videoRef}
        className="mt-3 block w-full aspect-[4/3] object-cover bg-black border border-[var(--rule)] rounded-[6px]"
        aria-label="Live camera view for scanning the barcode"
        playsInline
        muted
        autoPlay
      />
      {message && (
        <p role="alert" className="mt-3 font-bold text-stop">
          {message}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className="btn btn-quiet" onClick={() => photoRef.current?.click()}>
          Use a photo of the barcode
        </button>
        <input ref={photoRef} type="file" accept="image/*" hidden aria-label="Photo of the barcode" onChange={handlePhoto} />
        <button ref={closeRef} type="button" className="btn" onClick={close}>
          Close
        </button>
      </div>
    </section>
  );
}
