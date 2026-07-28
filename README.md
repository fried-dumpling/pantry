# 장보기 영수증 · 레시피 재료 스캐너

유튜브 레시피 영상 URL과 보유 재료 사진을 입력하면, Gemini API가 두 입력을 함께
분석해서 **보유 재료**와 **구매해야 할 재료**를 영수증 형태로 보여주는 웹 앱입니다.

## 구성

- `index.html` — 프론트엔드 전체 (별도 빌드 과정 없는 순수 HTML/CSS/JS)
- `api/generate.js` — Gemini API 호출을 담당하는 Vercel 서버리스 함수
- `package.json` — Vercel이 Node 런타임으로 인식하기 위한 최소 설정

API 키는 코드에 없습니다. `api/generate.js`는 `process.env.GEMINI_API_KEY`에서만
키를 읽습니다.

## 로컬에서 확인하기

```bash
npm i -g vercel
vercel dev
```

`vercel dev`를 실행하면 `/api/generate`가 서버리스 함수로 로컬 실행되고,
`index.html`이 정적 파일로 서빙됩니다.

## Vercel 배포 방법

1. 이 폴더를 GitHub 저장소로 올리거나, `vercel` CLI로 바로 배포합니다.
   ```bash
   vercel
   ```
2. Vercel 대시보드 → 프로젝트 → **Settings → Environment Variables**로 이동해서
   아래 값을 추가합니다.
   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | 발급받은 Gemini API 키 |
   | `GEMINI_MODEL` (선택) | 사용할 모델 id. 지정하지 않으면 기본값 사용 |
3. 환경변수를 추가한 뒤 **Redeploy**를 눌러 반영합니다.

## 모델 관련 참고사항

요청하신 "gemini 3.1 flash"라는 이름의 모델은 현재 Gemini API에 텍스트/비전용
단일 모델 id로는 존재하지 않습니다 (2026년 7월 기준). 3.1 세대는
`gemini-3.1-flash-lite`(텍스트·이미지·영상·오디오·PDF 멀티모달)와
`gemini-3.1-flash-live-preview`(실시간 음성 전용) 등으로 나뉘어 있어서,
이 프로젝트는 기본값으로 `gemini-3.1-flash-lite`를 사용하도록 설정했습니다.

다른 모델을 쓰고 싶다면 코드를 수정할 필요 없이 Vercel 환경변수
`GEMINI_MODEL`에 원하는 모델 id(예: `gemini-3.5-flash`, `gemini-3.6-flash`)를
넣기만 하면 됩니다. (`api/generate.js` 상단의 `DEFAULT_MODEL` 참고)

## 동작 방식

1. 사용자가 유튜브 URL과 재료 사진을 업로드하면 프론트엔드가 이미지를
   base64로 변환해 `/api/generate`로 전송합니다.
2. `api/generate.js`는 Gemini `generateContent` API에 한 번의 요청으로
   - 유튜브 영상 (`file_data.file_uri`)
   - 업로드된 이미지 (`inline_data`)
   - 지시 프롬프트(JSON 스키마 강제)
   를 함께 담아 보냅니다.
3. Gemini가 레시피 재료, 사진 속 보유 재료, 그리고 이 둘을 비교해 부족한
   재료 목록을 JSON으로 반환하면 그대로 프론트엔드에 전달해 영수증 UI로
   렌더링합니다.

## 화면 레이아웃 & 디자인

- 화면을 좌우로 나눠서 **왼쪽에는 입력**(유튜브 URL, 재료 사진), **오른쪽에는
  영수증 결과**가 나오도록 구성했습니다. (1024px 이하에서는 1단 레이아웃으로
  전환)
- 영수증은 실제 프린터에서 뽑힌 영수증처럼 상단에 검은 "프린터 헤드" 바가
  있고, 하단은 손으로 찢은 듯한 톱니(지그재그) 모양의 절취선(`clip-path`)
  으로 마감됩니다.
- 영수증 위 우측에는 두 개의 알약형(pill) 버튼이 있습니다.
  - **PRINT**: `window.print()`를 호출해 현재 영수증을 인쇄합니다. 결과가
    없으면 비활성화됩니다.
  - **SWAP**: 같은 자리에서 **기존 레시피 영수증 ↔ 대체 레시피 영수증**을
    전환합니다. `alternativeRecipe`가 없으면 비활성화되고, 있을 때만
    눌러서 전환할 수 있습니다. (이전 버전처럼 두 카드를 세로로 나열하는
    대신, Stitch 시안대로 하나의 영수증 안에서 토글합니다.)
- SWAP으로 대체 레시피 보기로 전환하면 "TO BUY" 목록 상단에 대체 매핑
  (`원래 재료 → 대체 재료`, `SUBSTITUTED` 태그)이 먼저 나오고, 그 아래에
  대체 적용 후에도 여전히 사야 하는 재료가 이어서 나옵니다.
- 결과가 없을 때는 영수증 자리에 안내 문구가 있는 빈 상태가 표시됩니다.

## 대체 재료 · 대체 레시피

구매가 필요한 재료 중 사용자가 이미 보유한 다른 재료로 맛/식감/용도가
충분히 비슷하게 대체할 수 있는 항목이 있으면, Gemini가 다음 두 가지를
함께 반환합니다.

- `substitutions`: `[{ missingIngredient, substituteWith, note }]` — 원래
  사야 했던 재료와 그것을 대신할 보유 재료, 대체 이유를 짧게 설명한 목록
- `alternativeRecipe`: `{ title, description, requiredIngredients,
  missingIngredients } | null` — 대체재를 모두 반영한 레시피 버전. 대체
  가능한 재료가 하나도 없으면 `null`입니다.

프론트엔드는 대체 항목이 있을 때만 영수증 하단에 "대체 가능한 재료"
목록과 "대체 레시피" 카드를 자동으로 보여줍니다. 대체 판단 기준(어디까지
허용할지)은 `api/generate.js`의 `SYSTEM_PROMPT`에서 조정할 수 있습니다.

## 알아두면 좋은 점 / 한계

- 보유 재료 사진은 여러 장(기본 최대 8장) 동시 업로드가 가능합니다.
  냉장고, 팬트리, 장바구니처럼 서로 다른 장소를 나눠 찍어도 Gemini가
  모든 사진을 함께 보고 재료를 합산해 판단합니다. 최대 장수는
  `index.html`의 `MAX_IMAGES`와 `api/generate.js`의 `MAX_IMAGES`
  상수에서 조정할 수 있습니다.
- 이미지는 base64로 인라인 전송되므로, 사진 장수와 해상도가 많아질수록
  요청 크기가 커집니다. Gemini API의 인라인 요청 크기 제한(약 20MB)을
  넘지 않도록 너무 큰 원본 사진을 다수 올리는 경우 주의하세요.
- 유튜브 URL을 영상 입력으로 직접 넘기는 기능은 Gemini API의 프리뷰
  기능이며, 비공개(private) 영상이나 매우 긴 영상에는 제한이 있을 수
  있습니다.
- 조미료처럼 사진에 안 보이는 재료는 "구매 필요"로 분류되도록 프롬프트에
  명시했습니다. 필요하면 `api/generate.js`의 `SYSTEM_PROMPT`를 조정하세요.
- 재료 매칭(예: "대파" ≒ "파")은 Gemini가 한 번의 호출 안에서 판단합니다.
  더 엄격하거나 더 느슨한 매칭이 필요하면 프롬프트 문구를 수정하면 됩니다.
