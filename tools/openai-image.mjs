// OpenAI 이미지 생성 코어 모듈 (의존성 0, Node 18+ 내장 fetch/FormData 사용)
// CLI(genimg.mjs)와 MCP 서버(mcp-image-server.mjs)가 함께 사용한다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRESET_FILE = join(ROOT, "tools", "image-presets.json");
const API = "https://api.openai.com/v1";

// gpt-image-2.5 계열은 임의 해상도를 받는다. 아래는 문서상 제약.
//   16의 배수 / 비율 1:3~3:1 / 최대 변 3840px / 총 픽셀 655,360~8,294,400
const PIXELS_MIN = 655360;
const PIXELS_MAX = 8294400;
const EDGE_MAX = 3840;

const QUALITIES = ["low", "medium", "high", "xhigh", "max", "auto"];
const FORMATS = ["png", "jpeg", "webp"];

// --- API 키 -----------------------------------------------------------------
// 1) 환경변수 OPENAI_API_KEY  2) 프로젝트 루트의 .env 파일
export async function resolveApiKey() {
  const fromEnv = process.env.OPENAI_API_KEY?.trim();
  // "${OPENAI_API_KEY}" 처럼 치환되지 않은 값이 들어오면 무시하고 .env로 넘어간다.
  if (fromEnv && !fromEnv.startsWith("$")) return fromEnv;
  try {
    const env = await readFile(join(ROOT, ".env"), "utf8");
    const hit = env.match(/^\s*OPENAI_API_KEY\s*=\s*(.+)$/m);
    if (hit) return hit[1].trim().replace(/^["']|["']$/g, "");
  } catch {}
  throw new Error(
    "OPENAI_API_KEY를 찾을 수 없습니다. 프로젝트 루트에 .env 파일을 만들고 " +
      "OPENAI_API_KEY=sk-... 한 줄을 넣거나, 환경변수로 설정하세요."
  );
}

// --- 프리셋 -----------------------------------------------------------------
export async function loadPresets() {
  return JSON.parse(await readFile(PRESET_FILE, "utf8"));
}

// 최종 프롬프트 = 장면 설명 + 공통 스타일 + 프리셋 프레이밍 + 금지 항목
export function composePrompt(userPrompt, conf, presetName) {
  const p = presetName ? conf.presets?.[presetName] : null;
  if (presetName && !p) {
    throw new Error(`프리셋 '${presetName}'이 없습니다. 사용 가능: ${Object.keys(conf.presets || {}).join(", ")}`);
  }
  const parts = [userPrompt.trim()];
  if (conf.style?.trim()) parts.push(`STYLE: ${conf.style.trim()}`);
  if (p?.direction?.trim()) parts.push(`FRAMING: ${p.direction.trim()}`);
  if (conf.avoid?.trim()) parts.push(`DO NOT INCLUDE: ${conf.avoid.trim()}`);
  return parts.join("\n\n");
}

function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== "") return v;
  return undefined;
}

// 해상도 검증. 임의 크기를 허용하되 문서상 제약을 로컬에서 먼저 걸러
// 과금되는 요청이 낭비되지 않게 한다.
export function parseSize(size) {
  if (size === "auto") return { auto: true };
  const m = /^(\d+)x(\d+)$/.exec(String(size).trim());
  if (!m) throw new Error(`size 형식이 잘못됐습니다: '${size}'. "너비x높이" (예: 1200x800) 또는 "auto"`);
  const w = +m[1];
  const h = +m[2];
  const px = w * h;
  const ratio = Math.max(w / h, h / w);
  if (w % 16 || h % 16) throw new Error(`size ${w}x${h}: 너비와 높이는 16의 배수여야 합니다.`);
  if (ratio > 3) throw new Error(`size ${w}x${h}: 비율이 1:3~3:1을 벗어납니다 (현재 ${ratio.toFixed(2)}:1).`);
  if (Math.max(w, h) > EDGE_MAX) throw new Error(`size ${w}x${h}: 최대 변은 ${EDGE_MAX}px입니다.`);
  if (px < PIXELS_MIN) throw new Error(`size ${w}x${h}: 총 픽셀이 너무 적습니다 (${px} < ${PIXELS_MIN}).`);
  if (px > PIXELS_MAX) throw new Error(`size ${w}x${h}: 총 픽셀이 너무 많습니다 (${px} > ${PIXELS_MAX}).`);
  return { w, h, px };
}

function validate({ size, quality, format }) {
  if (size) parseSize(size);
  if (quality && !QUALITIES.includes(quality)) {
    throw new Error(`quality는 ${QUALITIES.join(" | ")} 중 하나여야 합니다 (받은 값: ${quality})`);
  }
  if (format && !FORMATS.includes(format)) {
    throw new Error(`format은 ${FORMATS.join(" | ")} 중 하나여야 합니다 (받은 값: ${format})`);
  }
}

// --- 비용 추정 ---------------------------------------------------------------
// gpt-image-1의 공개 수치(1024x1024 high = 4160 출력 토큰, 1536x1024 high = 6240 등)로
// 역산하면 출력 토큰 수가 픽셀 수에 정비례한다. 그 계수를 임의 해상도에 적용한다.
// xhigh / max 의 토큰 계수는 확인하지 못했으므로 추정하지 않고 null을 돌려준다.
const TOKENS_PER_PX = { low: 0.0002594, medium: 0.001007, high: 0.003967 };
const USD_PER_MTOK = {
  "gpt-image-1": 40,
  "gpt-image-2": 30,
  "gpt-image-2.5-flare": 30,
  "gpt-image-2.5-sunburst": 30,
};

function rateFor(model) {
  if (USD_PER_MTOK[model] !== undefined) return USD_PER_MTOK[model];
  // 날짜 접미사가 붙은 변형(gpt-image-2.5-flare-2026-09-08 등)을 접두사로 매칭
  const hit = Object.keys(USD_PER_MTOK).find((k) => model?.startsWith(k));
  return hit ? USD_PER_MTOK[hit] : null;
}

/** 1장당 예상 비용(USD). 추정 불가하면 null. */
export function estimateCost(size, quality, n = 1, model = "gpt-image-2.5-flare") {
  const rate = rateFor(model);
  const perPx = TOKENS_PER_PX[quality];
  if (rate === null || perPx === undefined) return null; // auto/xhigh/max 또는 미지의 모델
  let dims;
  try {
    dims = parseSize(size);
  } catch {
    return null;
  }
  if (dims.auto) return null;
  return +(((dims.px * perPx * rate) / 1e6) * n).toFixed(3);
}

// --- HTTP -------------------------------------------------------------------
async function callApi(path, body, apiKey, isForm = false) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: isForm
      ? { Authorization: `Bearer ${apiKey}` }
      : { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`API 응답 파싱 실패 (HTTP ${res.status}): ${text.slice(0, 400)}`);
  }
  if (!res.ok) {
    const msg = json?.error?.message || text.slice(0, 400);
    throw new Error(`OpenAI API 오류 (HTTP ${res.status}): ${msg}`);
  }
  return json;
}

// 결과 저장: 여러 장이면 -1, -2 ... 접미사를 붙인다.
async function saveAll(data, outPath, format) {
  const abs = resolve(ROOT, outPath);
  await mkdir(dirname(abs), { recursive: true });
  const written = [];
  for (let i = 0; i < data.length; i++) {
    const b64 = data[i]?.b64_json;
    if (!b64) throw new Error("응답에 이미지 데이터(b64_json)가 없습니다.");
    let target = abs;
    if (data.length > 1) {
      const ext = extname(abs) || `.${format}`;
      target = join(dirname(abs), `${basename(abs, ext)}-${i + 1}${ext}`);
    }
    await writeFile(target, Buffer.from(b64, "base64"));
    written.push(target);
  }
  return written;
}

/** 새 이미지 생성 (POST /v1/images/generations) */
export async function generate(opts) {
  const conf = await loadPresets();
  const preset = opts.preset ? conf.presets?.[opts.preset] : null;
  if (opts.preset && !preset) {
    throw new Error(`프리셋 '${opts.preset}'이 없습니다. 사용 가능: ${Object.keys(conf.presets || {}).join(", ")}`);
  }

  const size = pick(opts.size, preset?.size, "1024x1024");
  const quality = pick(opts.quality, preset?.quality, "medium");
  const format = pick(opts.format, preset?.format, "png");
  const transparent = opts.transparent ?? preset?.transparent ?? false;
  const model = pick(opts.model, preset?.model, conf.model, "gpt-image-2.5-flare");
  const n = Math.max(1, Math.min(10, Number(opts.n) || 1));
  validate({ size, quality, format });
  if (transparent && format === "jpeg") throw new Error("투명 배경은 png 또는 webp만 지원합니다 (jpeg 불가).");
  if (!opts.out) throw new Error("out(저장 경로)이 필요합니다. 예: assets/scenes/front.png");

  const body = {
    model,
    prompt: composePrompt(opts.prompt, conf, opts.preset),
    n,
    size,
    quality,
    output_format: format,
    background: transparent ? "transparent" : "opaque",
  };

  const json = await callApi("/images/generations", body, await resolveApiKey());
  const files = await saveAll(json.data || [], opts.out, format);
  return {
    files, size, quality, format, transparent, model, n,
    cost: estimateCost(size, quality, n, model),
    prompt: body.prompt,
  };
}

/**
 * 기존 이미지 수정/확장 (POST /v1/images/edits)
 * images: 참조로 넣을 이미지 경로 배열. mask: 투명 영역만 다시 그리는 마스크(선택).
 */
export async function edit(opts) {
  const conf = await loadPresets();
  const preset = opts.preset ? conf.presets?.[opts.preset] : null;
  const size = pick(opts.size, preset?.size, "1024x1024");
  const quality = pick(opts.quality, preset?.quality, "medium");
  // 편집은 정밀도가 중요하므로 editModel(기본 sunburst)을 쓴다.
  const model = pick(opts.model, conf.editModel, conf.model, "gpt-image-2.5-sunburst");
  validate({ size, quality });

  const imgs = (Array.isArray(opts.images) ? opts.images : [opts.images]).filter(Boolean);
  if (!imgs.length) throw new Error("images(원본 이미지 경로)가 최소 1개 필요합니다.");
  if (!opts.out) throw new Error("out(저장 경로)이 필요합니다.");

  const form = new FormData();
  form.append("model", model);
  form.append("prompt", composePrompt(opts.prompt, conf, opts.preset));
  form.append("size", size);
  form.append("quality", quality);
  if (opts.transparent ?? preset?.transparent) form.append("background", "transparent");

  for (const p of imgs) {
    const abs = resolve(ROOT, p);
    form.append("image[]", new Blob([await readFile(abs)]), basename(abs));
  }
  if (opts.mask) {
    const abs = resolve(ROOT, opts.mask);
    form.append("mask", new Blob([await readFile(abs)]), basename(abs));
  }

  const json = await callApi("/images/edits", form, await resolveApiKey(), true);
  const files = await saveAll(json.data || [], opts.out, "png");
  return { files, size, quality, model, sources: imgs, cost: estimateCost(size, quality, 1, model) };
}
