# 이미지 제작 규칙 — 윤슬세탁소

이 파일은 이 게임에 들어가는 **모든 이미지의 단일 기준**이다.
사람이 읽는 문서이면서, Claude Code가 이미지를 만들 때 따라야 하는 지시서이기도 하다.

> **동기화 규칙**
> 아래 **1. 아트 디렉션**과 **3. 종류별 스펙**을 고치면
> `tools/image-presets.json`의 `style` / `avoid` / `presets`도 **같이** 고쳐야 한다.
> 실제 API로 전송되는 값은 그 JSON 파일이고, 이 문서는 그 이유를 적어두는 곳이다.

---

## 0. 만드는 방법

### A. GPT 웹에서 만들어 붙여넣기 — **현재 쓰는 방식**

API 크레딧이 없을 때의 경로다. 프롬프트는 도구가 만들어 주고, 크기 보정도 도구가 한다.

**1단계 — 붙여넣을 프롬프트를 뽑는다** (API 호출 없음, 무료)

```bash
node tools/genimg.mjs --prompt-only --preset scene -p "좁은 뒷골목, 왼쪽에 세탁소 측면 벽" | clip
```

`| clip`을 붙이면 윈도우 클립보드로 바로 들어간다. 그대로 GPT에 붙여넣는다.
공통 그림체(`style`), 프레이밍 규칙, 금지 항목, **비율 요구**까지 자동으로 포함된다.
`| clip` 없이 실행하면 화면에 출력되니 눈으로 보고 손으로 복사해도 된다.

**2단계 — GPT가 준 이미지를 저장한다**

`assets/_inbox/` 에 넣거나, 그냥 다운로드 폴더에 두면 된다.
이 폴더는 git에 올라가지 않으므로 원본을 쌓아둬도 괜찮다.

**3단계 — 게임 규격으로 보정한다**

```bash
# 가장 최근에 받은 이미지를 배경 규격(1200x800)으로
python tools/fiximg.py --latest --preset scene --name front

# 인물: 흰 배경을 투명하게 지우면서 800x1200으로
python tools/fiximg.py --latest --preset character --name bongsun --cutout

# 소품: 투명 처리 + webp로 용량 절감
python tools/fiximg.py --latest --preset item --name marble --cutout --webp
```

목표 해상도는 `tools/image-presets.json`에서 읽으므로 규격이 한 곳에만 있다.
`--dry-run`을 붙이면 저장하지 않고 무엇을 할지만 보여준다.

> **`--cutout`의 한계**: 네 모서리에서 번져 나가며 단색 배경을 지우는 어림짐작이다.
> GPT가 **흰 배경이나 단색 배경**으로 그려줬을 때만 쓸 수 있다.
> 배경에 그라데이션·질감이 있으면 깔끔하게 지워지지 않는다.
> 결과에 "전체의 N%를 투명화"가 찍히니 그 숫자를 보고 판단한다 —
> 5% 미만이면 배경이 단색이 아닌 것이고, 92% 초과면 인물까지 지워진 것이다.
> `--tol` 로 허용 오차를 조절한다(기본 28).

### B. 터미널에서 바로 생성 — 크레딧 충전 후

`.env`에 키가 들어 있고 **크레딧이 있으면** 이쪽이 훨씬 빠르다. 설정은 이미 끝나 있다.

```bash
node tools/genimg.mjs --presets                                   # 프리셋·단가 확인
node tools/genimg.mjs --dry-run --preset scene -p "세탁소 정면"      # 무료 점검
node tools/genimg.mjs --preset scene -p "세탁소 정면" -o assets/scenes/front.png
```

Claude에게 말로 시켜도 된다 (`game-image` MCP 서버):

```
assets/scenes/front.png 로 세탁소 정면 배경 하나 만들어줘
```

이 경로로 만든 이미지는 해상도가 처음부터 정확하므로 **`fiximg.py`가 필요 없다.**

---

## 1. 아트 디렉션 — 확정 (2026-10-13)

**셀 애니메이션풍**으로 정했다. 도형을 쌓은 느낌이 아니라 **선화 + 2단 셀 음영 + 옷 주름**이 보이는 그림.
인물은 TV 애니메이션의 자연스러운 등신 (성인 약 7등신, 할머니 6.5, 아이 5.5). 다리를 늘린 키다리 체형 금지.

현재 `tools/image-presets.json`의 `style`:

```
Japanese TV anime cel-shaded illustration, like a slice-of-life anime or visual novel. Clean hand-drawn line art with thin warm dark-brown outlines (#3A2A26) of varying weight, never pure black. Two-tone cel shading with crisp soft-edged shadow shapes, natural cloth folds and wrinkles drawn with lines, subtle highlight on hair. Warm muted palette: slate teal #2F4A52, cream #EFE8D8, sage green #8FA889, warm wood brown #8C6A43, with a sparing rose accent #C8436A. Soft late-autumn daylight from the upper left. Small Korean seaside town in the 2000s, November. Quiet, nostalgic, gentle and slightly melancholy. Painted background art with real perspective and lived-in detail, not flat geometric shapes. Consistent style across every image in the series.
```

인물 고정 외형은 아래 5절 표와 ChatGPT용 주문서(프롬프트 묶음)에 적어 두었다.

채운 내용을 **그대로** `tools/image-presets.json`의 `"style"` 값에 넣는다.
영어로 쓰는 쪽이 모델에 더 잘 먹는다.

아래 6칸을 각각 한 줄로 채우면 그게 곧 `style` 문장이 된다.

| 항목 | 채울 내용 | 현재 |
| --- | --- | --- |
| **매체·기법** | flat vector / 수채 / 유화 / 셀 애니메이션 / 픽셀아트 / 사진풍 중 하나와 붓질 성격 | 미정 |
| **선** | 외곽선 있음·없음, 두께, 색(검정 아님이 보통) | 미정 |
| **색** | 지배색 3~5개를 **HEX로** 명시. 채도·명도 성향 | 미정 |
| **빛** | 광원 방향, 그림자 성격(딱 떨어지는지 번지는지), 시간대 | 미정 |
| **질감** | 종이결·그레인·노이즈 유무와 세기 | 미정 |
| **분위기** | 장르 정서를 형용사 3개로 (예: 고요한, 쓸쓸한, 따뜻한) | 미정 |

작성 예시 — *형식 참고용이며, 이 내용을 그대로 쓰라는 뜻은 아니다*
```
Hand-painted gouache illustration with visible brush texture and no outlines.
Muted palette dominated by #2F4A52 slate, #E4DCC6 cream, #6E9C5E sage, with a single
#C8436A accent used sparingly. Soft overcast daylight from the upper left, gentle
diffused shadows, late-afternoon warmth. Subtle paper grain across the whole image.
Quiet, melancholy, and warm. Consistent style across every image in the series.
```

> `style` 문장 끝에 `Consistent style across every image in the series.` 같은 문장을
> 넣어두면 장면 간 일관성이 조금 더 올라간다.

### 반드시 피할 것 (`avoid`)

현재 `tools/image-presets.json`에 설정된 값:

```
any text, letters, words, numbers, signage copy, watermark, signature, logo,
UI elements, speech bubbles, borders, frames
```

**텍스트를 금지하는 이유**: 간판 글씨("윤슬세탁소", "봉순반찬")는 이미지 안에
그려 넣지 않는다. 한글이 깨져서 나오고, 수정도 불가능하고, 다국어 대응도 막힌다.
**글자는 전부 HTML/CSS 레이어로 이미지 위에 올린다.** 간판이 필요하면
"빈 간판 판(blank signboard panel)"만 그리게 하고 글씨는 코드로 얹는다.

---

## 2. 파일 배치와 이름

```
assets/
  _inbox/      GPT에서 받은 원본 (보정 전, git 제외)
  scenes/      배경         front.png, counter.png, workshop.png, alley.png, home.png, storage.png
  characters/  인물 입상    bongsun.png, doyun.png, yeoreum.png, sangchul.png
  items/       소품 아이콘  marble.png, receipt.png, iron.png
  titles/      표지·엔딩    ch1-cover.png, ch1-ending-a.png
```

**이름 규칙**

- 영문 소문자 + 하이픈만. 공백·한글·대문자 금지.
- 변형은 하이픈 접미사로: `alley.png` → `alley-night.png`, `alley-rain.png`
- 표정·포즈 변형: `bongsun.png` → `bongsun-sad.png`, `bongsun-back.png`
- 후보를 여러 장 받으면 `-1 -2` 가 자동으로 붙는다. **채택한 1장만 남기고 나머지는 지운다.**
- 채택본은 접미사 없는 이름으로 바꾼다. 리포지토리에 후보를 쌓아두지 않는다.

| 인물 | 파일명 | 설정 |
| --- | --- | --- |
| 오봉순 (78) | `bongsun.png` | 옆집 반찬가게 할머니, 동네 소식통 |
| 민도윤 (10) | `doyun.png` | 봉순의 손주, 구슬치기 대장이 되고 싶다 |
| 한여름 | `yeoreum.png` | 여름꽃집 사장, 조용하고 친절, 한여름에도 긴 소매 |
| 박상철 | `sangchul.png` | 윤슬시장, 이 골목 출신 |

---

## 3. 종류별 스펙

| 프리셋 | 해상도 | 비율 | 배경 | 품질 | 쓰이는 곳 |
| --- | --- | --- | --- | --- | --- |
| `scene` | **1200×800** | 3:2 | 불투명 | high | `.bg` 배경 |
| `character` | 800×1200 | 2:3 | **투명** | high | `.fig` 인물, `.person .pf` 썸네일 |
| `item` | 1024×1024 | 1:1 | **투명** | medium | `.thing-tile`, `.thing-big` |
| `title` | 1200×800 | 3:2 | 불투명 | high | 장 표지, 엔딩 카드 |

`gpt-image-2.5`는 **임의 해상도**를 받는다 — 16의 배수, 비율 1:3~3:1, 최대 변 3840px,
총 픽셀 655,360~8,294,400. 제약 위반은 API 호출 전에 로컬에서 거부되므로 돈이 새지 않는다.

### scene — 배경

- **1200×800은 게임의 `viewBox="0 0 1200 800"`과 정확히 같은 크기다.** 리샘플링이 전혀 없다. 이 값을 바꾸지 않는다.
- **사람·동물을 그리지 않는다.** 인물은 `character` 레이어로 따로 올린다.
- 화면 **중앙 60%는 비교적 비우고 차분하게** 유지한다. 그 위에 대화 상자와 클릭 핫스팟이 올라간다.
- `preserveAspectRatio="slice"`로 잘려 나가므로 **네 변 80px 안쪽에 중요한 것을 두지 않는다.**
- 카메라는 눈높이, 수평선은 화면 중간 근처.

### character — 인물 입상

- **배경 완전 투명. 바닥·그림자·소품 없음.** (`.fig`가 씬 위에 그대로 얹힌다)
- 정면, 전신, 팔 내린 자연스러운 기본 자세.
- **발이 프레임 아래 변에 닿게** 한다. `.fig{bottom:0}`이라 발밑 여백이 있으면 공중에 뜬다.
- 머리 위에는 약간의 여백.
- 표정·포즈 변형은 **반드시 `edit_image`로 원본을 참조해서** 만든다. `generate_image`로 다시 만들면 얼굴이 딴 사람이 된다.

### item — 소품

- 물체 하나만, 가운데, 투명 배경, 그림자 없음.
- 3/4 시점, 균일한 조명. 물체가 프레임의 80% 정도를 채운다.
- 작게 표시되므로 **디테일보다 실루엣**이 중요하다. 32px로 줄여도 뭔지 알아볼 수 있어야 한다.

### title — 표지

- **왼쪽 위 1/3을 비우고 대비를 낮게** 둔다. 제목·부제를 그 위에 타이포로 얹는다.
- 글자는 절대 그리지 않는다.

---

## 4. 프롬프트 쓰는 법

**그림체는 쓰지 않는다.** `style`이 자동으로 붙는다. 중복으로 적으면 서로 싸운다.
프롬프트에는 **무엇이 어디에 있는지**만 쓴다.

좋은 예
```
좁은 뒷골목. 왼쪽에 세탁소 측면 벽과 환기구, 오른쪽에 쌓인 플라스틱 상자들.
바닥은 젖은 콘크리트. 골목 끝은 밝은 거리로 트여 있다.
```

나쁜 예
```
수채화 느낌으로 예쁘게 뒷골목 그려줘 (← 그림체 중복, 공간 정보 없음)
```

**체크리스트**

1. 장소가 어디이고 무엇이 보이는가 — 왼쪽/가운데/오른쪽에 뭐가 있는지 적는다.
2. 시간대와 날씨 — 광원을 바꾸므로 명시한다.
3. 비어 있어야 하는 영역 — "오른쪽 아래는 비워 둘 것"처럼 적는다.
4. 한국의 1990~2000년대 동네라는 **시대·지역 단서**를 넣는다. 안 넣으면 서양 배경이 나온다.
5. 3문장 안으로 끝낸다. 길어지면 모델이 앞부분을 흘린다.

---

## 5. 일관성 유지 (가장 중요)

이미지 생성은 **매번 다른 그림을 준다.** 일관성은 저절로 생기지 않는다.

1. **`style`을 고정한다.** 한 장(chapter) 작업 중에는 `tools/image-presets.json`의 `style`을 건드리지 않는다. 고치면 그 전에 만든 이미지 전부와 어긋난다.
2. **기준 이미지(앵커)를 먼저 만든다.** 가장 중요한 배경 1장과 주요 인물 1명을 먼저 확정한다. 이게 나머지의 기준이 된다.
3. **변형은 처음부터 다시 만들지 말고 원본을 고친다.** 같은 인물의 다른 표정, 같은 배경의 밤 버전 — 새로 생성하면 얼굴이 딴 사람이 된다.
   - **GPT 웹**: 이전에 받은 이미지를 **같은 대화에 다시 올리고** "이 그림 그대로, 표정만 슬프게" 식으로 요청한다. 새 대화에서 글로만 설명하면 반드시 달라진다.
   - **API**: `edit_image`에 원본 경로를 넣는다. 편집 전용으로 가장 강력한 `gpt-image-2.5-sunburst`가 쓰인다.
4. **인물은 외형을 글로 고정해둔다.** 아래 표를 채우고, 그 인물을 그릴 때마다 같은 문장을 붙인다.

| 인물 | 고정 외형 설명 (채울 것) |
| --- | --- |
| 오봉순 | 작은 키, 약간 굽은 등, 은회색 생머리를 뒤로 단정히 빗어 낮게 쪽진 머리(곱슬 금지), 자두색 카디건, 크림색 앞치마 |
| 민도윤 | 확실히 남자아이. 짧은 검은 머리, 볼에 반창고, 겨자색 후드티(모자는 등 뒤), 청바지, 운동화 |
| 한여름 | 30세 전후, 어깨 길이 검은 머리 낮게 묶음, 손목까지 내린 크림색 긴소매, 세이지색 앞치마 |
| 박상철 | 60세 전후, 단정한 회색 머리, 회색 코트+정장, 빈 명찰, 정치인 미소 |

5. **장 전체를 한 번에 돌리지 않는다.** 1장 만들고 게임에 끼워 보고 판단한 다음 다음 장으로 간다.

---

## 6. 모델과 비용

### 쓰는 모델

| 용도 | 모델 | 성격 |
| --- | --- | --- |
| 새로 생성 (`model`) | `gpt-image-2.5-flare` | "빠른 일상용 고품질 생성" |
| 수정·편집 (`editModel`) | `gpt-image-2.5-sunburst` | "가장 강력한 모델", 정밀 편집용 |

둘 다 출력 토큰 **$30/1M**로 단가가 같다. 그래서 역할만 나눠 두었다 —
새 이미지는 빠른 `flare`, 일관성이 걸린 변형은 정밀한 `sunburst`.
구형 `gpt-image-1`은 $40/1M로 **더 비싸고 더 낡았으니** 쓰지 않는다.

### 1장당 예상 비용

`low`/`medium`/`high`는 출력 토큰 수가 픽셀 수에 정비례한다(gpt-image-1 공개 수치에서 역산).
그 계수를 임의 해상도에 적용해 CLI와 MCP가 자동으로 추정값을 보여준다.

| 해상도 | low | medium | high |
| --- | --- | --- | --- |
| 1200×800 (scene/title) | $0.007 | $0.029 | **$0.114** |
| 800×1200 (character) | $0.007 | $0.029 | **$0.114** |
| 1024×1024 (item) | $0.008 | **$0.032** | $0.125 |

> `xhigh`와 `max`는 `gpt-image-2.5` 전용 품질 등급인데 **토큰 계수를 확인하지 못했다.**
> 추정하지 않고 "추정 불가"로 표시한다. 쓸 거라면 1장 돌려보고
> OpenAI 사용량 대시보드에서 실제 금액을 확인한 뒤 판단한다.
>
> API 탐색 중 `quality` 검증 오류는 `low/medium/high/auto`만 나열했는데
> 문서에는 `xhigh`/`max`도 있다고 돼 있다. 공용 스키마 메시지인 것으로 보이나
> **실제 수용 여부는 크레딧을 넣고 확인해야 한다.**

**규칙**

- **구도를 탐색할 때는 `quality: "low"`** 로 돌린다. 1200×800에서 low는 $0.007, high는 $0.114 — **16배** 차이다. 마음에 드는 구도가 나오면 같은 프롬프트를 `high`로 한 번 더 돌린다.
- 프롬프트가 확실치 않으면 `--dry-run`으로 먼저 확인한다. 공짜다.
- `n`은 2~3을 넘기지 않는다.
- 같은 프롬프트를 반복 호출하지 않는다. 결과가 나아지지 않는다.
- 해상도 제약 위반은 로컬에서 먼저 걸러지므로 잘못된 요청에 돈이 들지 않는다.

---

## 7. 게임에 넣기

배경을 PNG로 바꿀 때는 기존 인라인 SVG를 지우지 말고 **`<image>`로 감싸 교체**한다.
SVG 레이어 구조(`#hot` 핫스팟, `#fx` 효과)를 그대로 쓸 수 있어서 가장 안전하다.

```js
// BG 객체의 각 항목을 이렇게 바꾼다
front: () => `<svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice"
    xmlns="http://www.w3.org/2000/svg">
  <image href="assets/scenes/front.png" x="0" y="0" width="1200" height="800"
         preserveAspectRatio="xMidYMid slice"/>
</svg>`,
```

- 좌표계가 `1200×800`으로 유지되므로 **기존 핫스팟 좌표를 다시 계산할 필요가 없다.**
- 셔터 열림 같은 **상태별 변화는 PNG를 여러 장** 만들어 바꿔 끼운다 (`front.png` / `front-open.png`).
- `file://`로 열어도 상대 경로 `assets/...`는 동작한다. 단일 HTML 배포가 필요하면 base64로 인라인해야 하는데, 파일이 몇 MB로 불어나므로 그때 따로 판단한다.
- 인물은 `.fig`가 `<img>`를 받게 바꾸거나, 씬 SVG 안에 `<image>`로 넣는다.

### 넣은 뒤 확인할 것

- [ ] 다크 모드에서 너무 밝지 않은지 (배경 PNG는 테마를 따라가지 않는다)
- [ ] 핫스팟 위치가 새 배경의 사물과 맞는지
- [ ] 투명 PNG 인물의 외곽에 흰 테두리가 남지 않았는지
- [ ] 총 용량. 배경 1장이 1~2MB다. 6장이면 10MB를 넘길 수 있다 — 필요하면 webp로 변환한다.

---

## 8. 설정 파일 위치

| 파일 | 역할 |
| --- | --- |
| `IMAGE_RULES.md` | 이 문서. 규칙의 근거 |
| `tools/image-presets.json` | 실제 적용되는 `model` / `editModel` / `style` / `avoid` / 프리셋 |
| `tools/fiximg.py` | **GPT에서 받은 이미지를 게임 규격으로 보정** (크기·투명·webp) |
| `tools/openai-image.mjs` | API 호출 코어 |
| `tools/genimg.mjs` | 터미널 CLI (`--prompt-only`로 붙여넣기용 프롬프트 출력) |
| `tools/mcp-image-server.mjs` | MCP 서버 (Claude가 쓰는 도구) |
| `.mcp.json` | MCP 서버 등록 |
| `.env` | API 키. **git에 올라가지 않음** |
