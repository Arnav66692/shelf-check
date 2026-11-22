const ORT_VERSION = "1.20.1";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
const MODEL_URL = "/matcher/dinov2s-run3.q8.onnx";
const SIZE = 336;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const CACHE = "shelf-check-matcher-v2";

importScripts(`${ORT_BASE}ort.webgpu.min.js`);
ort.env.wasm.wasmPaths = ORT_BASE;
ort.env.wasm.numThreads = Math.min(4, self.navigator.hardwareConcurrency || 1);

let ready = null;

function post(type, payload) {
  self.postMessage({ type, ...payload });
}

async function fetchWithProgress(url) {
  const cache = await caches.open(CACHE).catch(() => null);
  const cached = cache ? await cache.match(url) : null;
  if (cached) {
    post("progress", { stage: "model", loaded: 1, total: 1, cached: true });
    return new Uint8Array(await cached.arrayBuffer());
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not download ${url}`);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post("progress", { stage: "model", loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (cache) await cache.put(url, new Response(bytes)).catch(() => undefined);
  return bytes;
}

async function load() {
  const [modelBytes, meta, gallery, owners] = await Promise.all([
    fetchWithProgress(MODEL_URL),
    fetch("/matcher/products.json").then((r) => r.json()),
    fetch("/matcher/gallery.i8").then((r) => r.arrayBuffer()),
    fetch("/matcher/owners.u16").then((r) => r.arrayBuffer()),
  ]);
  const providers = self.navigator.gpu ? ["webgpu", "wasm"] : ["wasm"];
  let session;
  let backend = providers[0];
  try {
    session = await ort.InferenceSession.create(modelBytes, { executionProviders: providers });
  } catch {
    backend = "wasm";
    session = await ort.InferenceSession.create(modelBytes, { executionProviders: ["wasm"] });
  }
  return { session, backend, meta, gallery: new Int8Array(gallery), owners: new Uint16Array(owners) };
}

async function toPixels(blob) {
  const bitmap = await createImageBitmap(blob);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  const { data } = context.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const pixels = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) pixels[c * plane + i] = (data[i * 4 + c] / 255 - MEAN[c]) / STD[c];
  }
  return pixels;
}

function rank(state, vector, count) {
  const { gallery, owners, meta } = state;
  const dim = meta.dim;
  const best = new Float32Array(meta.products.length).fill(-9);
  for (let image = 0; image < owners.length; image++) {
    let score = 0;
    const base = image * dim;
    for (let d = 0; d < dim; d++) score += gallery[base + d] * vector[d];
    score /= 127;
    const owner = owners[image];
    if (score > best[owner]) best[owner] = score;
  }
  const order = Array.from(best.keys()).sort((a, b) => best[b] - best[a]).slice(0, count);
  return order.map((index) => ({ ...meta.products[index], score: best[index] }));
}

let latest = 0;
let queue = Promise.resolve();

async function handle(id, blob) {
  if (id !== latest) return;
  try {
    const started = performance.now();
    if (!ready) ready = load();
    const state = await ready;
    if (id !== latest) return;
    post("progress", { id, stage: "read" });
    const pixels = await toPixels(blob);
    const ranStart = performance.now();
    const output = await state.session.run({ pixels: new ort.Tensor("float32", pixels, [1, 3, SIZE, SIZE]) });
    const vector = output.embedding.data;
    const modelMs = performance.now() - ranStart;
    post("progress", { id, stage: "compare", products: state.meta.products.length });
    const matches = rank(state, vector, 5);
    post("done", { id, matches, backend: state.backend, modelMs, totalMs: performance.now() - started });
  } catch (error) {
    ready = null;
    post("error", { id, message: error instanceof Error ? error.message : String(error) });
  }
}

self.onmessage = (event) => {
  const { id, blob } = event.data;
  latest = id;
  queue = queue.then(() => handle(id, blob));
};
