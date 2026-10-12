#!/usr/bin/env node
// 최소 stdio MCP 서버 (SDK 의존성 없음). JSON-RPC 2.0, 줄바꿈 구분 JSON.
// 중요: stdout에는 JSON-RPC 메시지만 출력한다. 로그는 모두 stderr로.
import { generate, edit, loadPresets, estimateCost, ROOT } from "./openai-image.mjs";
import { relative, sep } from "node:path";

const SERVER = { name: "game-image", version: "1.0.0" };
const KNOWN_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const rel = (p) => relative(ROOT, p).split(sep).join("/");

// gpt-image-2.5는 임의 해상도를 받으므로 enum이 아니라 문자열로 받고 코어에서 검증한다.
const SIZE_DESC =
  '"너비x높이" 형식. 16의 배수, 비율 1:3~3:1, 최대 변 3840px, 총 픽셀 655,360~8,294,400. ' +
  '예: 1200x800 (이 게임의 viewBox와 동일), 1024x1024, auto. 프리셋 해상도를 덮어쓸 때만 지정한다.';
const QUALITY_ENUM = ["low", "medium", "high", "xhigh", "max", "auto"];

const TOOLS = [
  {
    name: "generate_image",
    description:
      "게임용 이미지를 새로 생성해 프로젝트 안에 PNG로 저장한다. preset을 주면 해상도·투명배경·프레이밍 규칙이 자동 적용된다(scene=1200x800 배경, character=800x1200 투명 전신, item=1024x1024 투명 소품, title=1200x800 타이틀). 공통 그림체는 tools/image-presets.json의 style에서 자동으로 붙으므로 prompt에는 그림체를 쓰지 말고 내용과 구도만 쓴다. 비용이 발생하므로 같은 프롬프트를 반복 호출하지 말 것.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "무엇을 그릴지에 대한 설명. 그림체는 자동으로 붙으니 내용·구도만 쓴다." },
        out: { type: "string", description: "프로젝트 루트 기준 저장 경로. 예: assets/scenes/front.png" },
        preset: { type: "string", enum: ["scene", "character", "item", "title"], description: "이미지 종류 프리셋" },
        size: { type: "string", description: SIZE_DESC },
        quality: { type: "string", enum: QUALITY_ENUM, description: "프리셋 품질을 덮어쓸 때만. 구도 탐색은 low, 확정본은 high. xhigh/max는 단가 미확인." },
        model: { type: "string", description: "기본값은 tools/image-presets.json의 model(gpt-image-2.5-flare). 바꿀 이유가 없으면 생략한다." },
        transparent: { type: "boolean", description: "배경 투명 여부. 프리셋 설정을 덮어쓴다." },
        n: { type: "integer", minimum: 1, maximum: 10, description: "후보 장수. 2 이상이면 파일명에 -1,-2 접미사가 붙는다." },
      },
      required: ["prompt", "out"],
    },
  },
  {
    name: "edit_image",
    description:
      "이미 있는 이미지를 참조해 수정·변형하거나, 여러 이미지를 합성해 새 이미지를 만든다. 같은 캐릭터의 다른 포즈·표정, 같은 배경의 밤/비 버전처럼 일관성이 중요할 때 generate_image보다 이 도구를 쓴다.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "어떻게 바꿀지에 대한 설명" },
        images: { type: "array", items: { type: "string" }, description: "참조할 원본 이미지 경로 (최소 1개)" },
        out: { type: "string", description: "저장 경로" },
        mask: { type: "string", description: "선택. 투명한 영역만 다시 그리는 마스크 PNG 경로" },
        preset: { type: "string", enum: ["scene", "character", "item", "title"] },
        size: { type: "string", description: SIZE_DESC },
        quality: { type: "string", enum: QUALITY_ENUM },
        transparent: { type: "boolean" },
        model: { type: "string", description: "기본값은 editModel(gpt-image-2.5-sunburst). 편집 정밀도가 가장 높은 모델이므로 보통 그대로 쓴다." },
      },
      required: ["prompt", "images", "out"],
    },
  },
  {
    name: "list_image_presets",
    description: "사용 가능한 프리셋과 현재 공통 아트 디렉션(style), 프리셋별 예상 비용을 보여준다. 이미지를 만들기 전에 한 번 확인하면 좋다.",
    inputSchema: { type: "object", properties: {} },
  },
];

// --- 도구 실행 --------------------------------------------------------------
async function runTool(name, args = {}) {
  if (name === "list_image_presets") {
    const conf = await loadPresets();
    const lines = [
      `생성 모델: ${conf.model}`,
      `편집 모델: ${conf.editModel}`,
      `공통 스타일(style): ${conf.style?.trim() || "(비어 있음 — IMAGE_RULES.md 1번 항목을 채워야 그림체가 통일됩니다)"}`,
      `금지 항목(avoid): ${conf.avoid?.trim() || "(없음)"}`,
      "",
      "프리셋:",
    ];
    for (const [k, p] of Object.entries(conf.presets)) {
      const cost = estimateCost(p.size, p.quality, 1, p.model || conf.model);
      lines.push(`  - ${k}: ${p.size}, ${p.quality}, ${p.transparent ? "투명 배경" : "불투명"}, 저장 위치 ${p.dir}/, 약 $${cost ?? "?"}/장`);
      lines.push(`      프레이밍: ${p.direction}`);
    }
    return lines.join("\n");
  }

  if (name === "generate_image") {
    const r = await generate(args);
    return [
      `생성 완료: ${r.files.map(rel).join(", ")}`,
      `${r.model} / ${r.size} / ${r.quality} / ${r.transparent ? "투명 배경" : "불투명"} / ${r.n}장 / 예상 비용 약 $${r.cost ?? "추정 불가"}`,
      "",
      "실제로 전송된 프롬프트:",
      r.prompt,
    ].join("\n");
  }

  if (name === "edit_image") {
    const r = await edit(args);
    return [
      `수정 완료: ${r.files.map(rel).join(", ")}`,
      `원본: ${r.sources.join(", ")}`,
      `${r.size} / ${r.quality} / 예상 비용 약 $${r.cost ?? "?"}`,
    ].join("\n");
  }

  throw new Error(`알 수 없는 도구: ${name}`);
}

// --- JSON-RPC ---------------------------------------------------------------
function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize": {
      const want = params?.protocolVersion;
      return ok(id, {
        protocolVersion: KNOWN_PROTOCOLS.includes(want) ? want : KNOWN_PROTOCOLS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return;
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: TOOLS });
    case "prompts/list":
      return ok(id, { prompts: [] });
    case "resources/list":
      return ok(id, { resources: [] });
    case "tools/call": {
      const toolName = params?.name;
      try {
        const text = await runTool(toolName, params?.arguments || {});
        return ok(id, { content: [{ type: "text", text }] });
      } catch (e) {
        // 도구 실패는 프로토콜 오류가 아니라 isError 결과로 돌려준다.
        return ok(id, { content: [{ type: "text", text: `오류: ${e.message}` }], isError: true });
      }
    }
    default:
      if (isNotification) return;
      return fail(id, -32601, `지원하지 않는 메서드: ${method}`);
  }
}

let buf = "";
let pending = 0;        // 처리 중인 요청 수
let stdinEnded = false; // stdin이 닫혔는지

// 진행 중인 요청을 모두 끝낸 뒤에 종료한다 (파이프 입력에서 응답이 잘리는 것 방지).
function maybeExit() {
  if (stdinEnded && pending === 0) process.exit(0);
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      process.stderr.write(`[game-image] JSON 파싱 실패: ${line.slice(0, 200)}\n`);
      continue;
    }
    pending++;
    handle(msg)
      .catch((e) => {
        process.stderr.write(`[game-image] 처리 중 오류: ${e.stack || e.message}\n`);
        if (msg.id !== undefined && msg.id !== null) fail(msg.id, -32603, e.message);
      })
      .finally(() => { pending--; maybeExit(); });
  }
});
process.stdin.on("end", () => { stdinEnded = true; maybeExit(); });
process.stderr.write("[game-image] MCP 서버 시작\n");
