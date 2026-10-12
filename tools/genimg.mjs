#!/usr/bin/env node
// 터미널에서 이미지 생성/수정하는 CLI.
//   node tools/genimg.mjs --preset scene -p "비 오는 밤 골목" -o assets/scenes/alley-rain.png
//   node tools/genimg.mjs --preset character -p "78세 반찬가게 할머니" -o assets/characters/bongsun.png
//   node tools/genimg.mjs --edit assets/scenes/alley.png -p "밤으로 바꿔줘" -o assets/scenes/alley-night.png
import { generate, edit, loadPresets, estimateCost, composePrompt } from "./openai-image.mjs";
import { relative, sep } from "node:path";
import { ROOT } from "./openai-image.mjs";

const HELP = `
genimg — OpenAI 이미지 생성 CLI

사용법
  node tools/genimg.mjs --preset <이름> -p "<설명>" -o <저장경로> [옵션]
  node tools/genimg.mjs --edit <원본...> -p "<수정 내용>" -o <저장경로> [옵션]

필수
  -p, --prompt <글>     무엇을 그릴지 한국어/영어 설명
  -o, --out <경로>      저장 경로 (예: assets/scenes/front.png)

옵션
  --preset <이름>       scene | character | item | title  (해상도·투명도·프레이밍 자동)
  --edit <경로...>      기존 이미지를 참조/수정. 여러 개 지정 가능
  --mask <경로>         투명한 부분만 다시 그림 (--edit과 함께)
  --size <크기>         "너비x높이" 또는 auto. 16의 배수, 비율 1:3~3:1, 최대 변 3840px,
                        총 픽셀 655,360~8,294,400. 예: 1200x800
  --quality <등급>      low | medium | high | xhigh | max | auto
  --model <모델>        기본값은 image-presets.json의 model
  --format <포맷>       png | jpeg | webp
  --transparent         배경 투명 (png/webp만)
  --opaque              프리셋의 투명 설정을 끔
  -n <개수>             후보 장수 (기본 1, 최대 10). 2 이상이면 -1,-2 접미사
  --dry-run             호출하지 않고 최종 프롬프트와 예상 비용만 출력
  --prompt-only         GPT 웹에 붙여넣을 프롬프트만 출력 (API 호출 없음, 무료)
                        윈도우에서 클립보드로:  ... --prompt-only ... | clip
  --presets             프리셋 목록 보기
  -h, --help            이 도움말
`;

function parseArgs(argv) {
  const o = { images: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "-p": case "--prompt": o.prompt = next(); break;
      case "-o": case "--out": o.out = next(); break;
      case "--preset": o.preset = next(); break;
      case "--mask": o.mask = next(); break;
      case "--size": o.size = next(); break;
      case "--quality": o.quality = next(); break;
      case "--format": o.format = next(); break;
      case "--model": o.model = next(); break;
      case "-n": case "--n": o.n = next(); break;
      case "--transparent": o.transparent = true; break;
      case "--opaque": o.transparent = false; break;
      case "--dry-run": o.dryRun = true; break;
      case "--prompt-only": o.promptOnly = true; break;
      case "--presets": o.showPresets = true; break;
      case "-h": case "--help": o.help = true; break;
      case "--edit":
        // --edit 뒤에 오는 옵션(-로 시작)까지의 경로들을 모두 수집
        while (argv[i + 1] && !argv[i + 1].startsWith("-")) o.images.push(argv[++i]);
        o.isEdit = true;
        break;
      default:
        if (a.startsWith("-")) throw new Error(`알 수 없는 옵션: ${a}`);
        o.prompt = o.prompt ? `${o.prompt} ${a}` : a;
    }
  }
  return o;
}

const rel = (p) => relative(ROOT, p).split(sep).join("/");

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || process.argv.length <= 2) { console.log(HELP); return; }

  const conf = await loadPresets();

  if (o.showPresets) {
    console.log(`\n생성 모델: ${conf.model}`);
    console.log(`편집 모델: ${conf.editModel}`);
    console.log(`공통 스타일: ${conf.style?.trim() ? conf.style : "(비어 있음 — IMAGE_RULES.md 1번 항목을 채우세요)"}\n`);
    for (const [name, p] of Object.entries(conf.presets)) {
      const cost = estimateCost(p.size, p.quality, 1, p.model || conf.model);
      console.log(`  ${name.padEnd(10)} ${p.size.padEnd(10)} ${p.quality.padEnd(6)} ${(p.transparent ? "투명" : "불투명").padEnd(6)} → ${p.dir}/  (약 $${cost ?? "?"}/장)`);
    }
    console.log("");
    return;
  }

  if (!o.prompt) throw new Error("-p \"설명\" 이 필요합니다. --help 참고");

  // 경고는 stderr로 보내므로 --prompt-only 를 clip에 파이프해도 섞이지 않는다.
  if (!conf.style?.trim()) {
    console.error("⚠ image-presets.json의 style이 비어 있습니다. 채우지 않으면 장마다 그림체가 흔들립니다.\n");
  }

  // GPT 웹에 붙여넣을 프롬프트만 출력한다. API를 부르지 않으므로 비용이 없다.
  // 웹에서는 해상도를 지정할 수 없으니 비율과 배경 요구를 말로 덧붙인다.
  if (o.promptOnly) {
    const p = o.preset ? conf.presets[o.preset] : null;
    const extra = [];
    if (p?.size && p.size !== "auto") {
      const [w, h] = p.size.split("x").map(Number);
      const g = (a, b) => (b ? g(b, a % b) : a);
      const d = g(w, h);
      const shape = w > h ? "landscape" : w < h ? "portrait" : "square";
      extra.push(`ASPECT RATIO: ${w / d}:${h / d} ${shape}. Do not crop or letterbox.`);
    }
    if (p?.transparent) {
      extra.push("BACKGROUND: fully transparent PNG. If transparency is unavailable, use a flat pure-white background with no shadow and no gradient.");
    }
    process.stdout.write([composePrompt(o.prompt, conf, o.preset), ...extra].join("\n\n") + "\n");
    return;
  }

  if (!o.out) throw new Error("-o 저장경로 가 필요합니다. 예: -o assets/scenes/front.png");

  if (o.dryRun) {
    const p = o.preset ? conf.presets[o.preset] : {};
    const size = o.size ?? p?.size ?? "1024x1024";
    const quality = o.quality ?? p?.quality ?? "medium";
    const model = o.model ?? p?.model ?? (o.isEdit ? conf.editModel : conf.model);
    console.log("── 최종 프롬프트 ──────────────────────────────");
    console.log(composePrompt(o.prompt, conf, o.preset));
    console.log("───────────────────────────────────────────────");
    const cost = estimateCost(size, quality, Number(o.n) || 1, model);
    console.log(`model=${model} size=${size} quality=${quality} n=${o.n ?? 1}  예상 비용 ≈ $${cost ?? "추정 불가"}`);
    return;
  }

  const t0 = Date.now();
  const r = o.isEdit ? await edit(o) : await generate(o);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`✓ ${r.files.length}장 생성 (${secs}초)`);
  for (const f of r.files) console.log(`  ${rel(f)}`);
  console.log(`  ${r.model} · ${r.size} · ${r.quality} · ${r.transparent ? "투명 배경" : "불투명"} · 예상 비용 ≈ $${r.cost ?? "추정 불가"}`);
}

main().catch((e) => {
  console.error("");
  console.error("✗ " + e.message);
  console.error("");
  // process.exit()는 열려 있는 소켓 핸들 때문에 Windows에서 libuv assertion을 일으킨다.
  process.exitCode = 1;
});
