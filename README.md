# 장보기 영수증 · 레시피 재료 스캐너

유튜브 레시피 영상 URL과 보유 재료 사진을 입력하면, Gemini API가 두 입력을 함께
분석해서 **조리 순서**, **보유 재료**, **구매해야 할 재료**를 영수증 형태로
보여주는 웹 앱입니다. 화면 하단에는 Firebase Firestore로 동작하는 실시간
사용자 의견 게시판이 붙어 있습니다.

## 구성

- `index.html` — 프론트엔드 전체 (별도 빌드 과정 없는 순수 HTML/CSS/JS)
- `main.js` — 좌측 입력(URL·사진)과 우측 영수증 렌더링을 담당하는 프론트엔드 로직
- `style.css` — 전체 스타일
- `board.js` — Firebase Firestore 기반 의견 게시판 로직 (ES 모듈로 로드)
- `api/generate.js` — Gemini API 호출을 담당하는 Vercel 서버리스 함수
  (**주의**: 이 저장소에는 `generate.js`가 루트에 있을 수 있는데, Vercel이
  서버리스 함수로 인식하려면 반드시 `api/generate.js` 경로에 있어야
  합니다. 배포 전에 `api/` 폴더 안으로 옮겨주세요.)
- `package.json` — Vercel이 Node 런타임으로 인식하기 위한 최소 설정

API 키는 코드에 없습니다. `api/generate.js`는 `process.env.GEMINI_API_KEY`에서만
키를 읽습니다. Firebase 설정값(`firebaseConfig`)은 클라이언트에 공개되는 값이라
`board.js`에 직접 들어있습니다 (Firebase 웹 SDK 특성상 정상입니다 — 실제 접근
제어는 Firestore 보안 규칙으로 합니다. 아래 "의견 게시판" 섹션 참고).

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
4. 게시판이 동작하려면 Firebase 콘솔에서 Firestore 설정도 따로 해주셔야
   합니다 — 아래 "의견 게시판" 섹션 참고.

## 모델 관련 참고사항

기본 모델은 `gemini-3.1-flash-lite`(텍스트·이미지·영상·오디오·PDF 멀티모달)로
설정되어 있습니다. 다른 모델을 쓰고 싶다면 코드를 수정할 필요 없이 Vercel
환경변수 `GEMINI_MODEL`에 원하는 모델 id(예: `gemini-3.6-flash`)를 넣기만
하면 됩니다 (`api/generate.js` 상단의 `DEFAULT_MODEL` 참고).

## 동작 방식

1. 사용자가 유튜브 URL과 재료 사진을 업로드하고 **"영수증 분석하기"**를
   누르면, 프론트엔드가 이미지를 base64로 변환해 `/api/generate`로
   전송합니다.
2. `api/generate.js`는 Gemini `generateContent` API에 한 번의 요청으로
   - 유튜브 영상 (`file_data.file_uri`)
   - 업로드된 이미지 (`inline_data`)
   - 지시 프롬프트(JSON 스키마 강제)
   를 함께 담아 보냅니다.
3. Gemini가 레시피 조리 단계, 사진 속 보유 재료(필요 분량 포함), 부족한
   재료 목록, 그리고 대체 가능한 재료/대체 레시피를 JSON으로 반환하면
   프론트엔드에 전달됩니다.
4. 분석이 끝나도 영수증은 바로 그려지지 않고, **"영수증 출력"** 버튼을
   눌러야 프린터에서 뽑히는 연출과 함께 표시됩니다. 즉 "분석"과 "출력"이
   분리된 2단계 흐름입니다. "SWAP" 버튼으로 원본 ↔ 대체 레시피 버전을
   같은 자리에서 토글할 수 있습니다.

## 화면 레이아웃 & 디자인

- 왼쪽에는 **제목 + 입력**(유튜브 URL, 재료 사진, 분석 버튼), 오른쪽에는
  **영수증 결과**가 나오는 2단 구성입니다 (1024px 이하에서는 1단 레이아웃으로
  전환). 제목("AI GROCERY ASSISTANT" 라벨은 `h1` 위에 떠 있는 형태로
  배치되어 있어, 오른쪽 "영수증 출력 / SWAP" 버튼의 윗줄이 제목("장보기
  영수증")의 윗줄과 정확히 맞춰집니다.
- 왼쪽 입력 영역(URL~분석 버튼)은 대부분의 화면에서 스크롤 없이 한 화면에
  들어오도록 여백을 조정했습니다.
- 영수증은 실제 프린터에서 뽑힌 영수증처럼 상단에 검은 "프린터 헤드" 슬롯이
  있고, 하단은 손으로 찢은 듯한 톱니(지그재그) 모양의 절취선(`clip-path`)
  으로 마감됩니다. 프린터 헤드는 스크롤되는 영수증 용지와 별도의 고정
  영역(`.receipt-frame` > `.printer-head-wrap`)에 있어서, 용지를 아무리
  스크롤해도 헤드 위로 삐져나오거나 헤드가 함께 밀려 올라가지 않습니다.
  가로 스크롤도 발생하지 않도록 처리되어 있습니다.
- 영수증 위 우측에는 두 개의 알약형(pill) 버튼이 있습니다.
  - **영수증 출력**: 분석이 끝난 뒤 이 버튼을 눌러야 영수증이 프린터에서
    뽑히는 연출과 함께 표시됩니다(실제 브라우저 인쇄가 아니라, 화면에
    렌더링하는 연출용 버튼입니다). 결과가 없으면 비활성화됩니다.
  - **SWAP**: 같은 자리에서 **기존 레시피 영수증 ↔ 대체 레시피 영수증**을
    전환합니다. `alternativeRecipe`가 없으면 비활성화되고, 있을 때만
    눌러서 전환할 수 있습니다.
- SWAP으로 대체 레시피 보기로 전환하면 "TO BUY" 목록 상단에 대체 매핑
  (`원래 재료 → 대체 재료`, `SUBSTITUTED` 태그)이 먼저 나오고, 그 아래에
  대체 적용 후에도 여전히 사야 하는 재료가 이어서 나옵니다.
- 결과가 없을 때는 영수증 자리에 안내 문구가 있는 빈 상태가 표시됩니다.

## 영수증에 표시되는 내용

- **레시피 조리 단계**: 영수증 상단에 번호가 매겨진 조리 순서 목록
  (`recipeSteps`)이 표시됩니다. 재료 이름만 나열하는 요약이 아니라, 손질
  방법·불 세기·시간 등 실제 조리 순서를 문장으로 정리한 내용입니다.
- **Inventory (보유 재료)**: 사진에서 인식된 보유 재료와, 그 재료가 이
  레시피에서 얼마나 필요한지(분량)가 함께 표시됩니다.
- **To Buy (구매 필요 재료)**: 부족한 재료와 필요 분량이 표시됩니다.
  대체 레시피 보기에서는 "원래 재료 → 대체 재료" 매핑이 먼저 나옵니다.
- 총 개수를 보여주는 "TOTAL ITEMS / 구매 필요 N개" 영역은 표시하지
  않습니다 (레시피 단계와 재료 목록 자체가 핵심 정보라 생략했습니다).

## 대체 재료 · 대체 레시피

구매가 필요한 재료 중 사용자가 이미 보유한 다른 재료로 맛/식감/용도가
충분히 비슷하게 대체할 수 있는 항목이 있으면, Gemini가 다음을 함께
반환합니다.

- `substitutions`: `[{ missingIngredient, substituteWith, note }]` — 원래
  사야 했던 재료와 그것을 대신할 보유 재료, 대체 이유를 짧게 설명한 목록
- `alternativeRecipe`: `{ title, description, steps, requiredIngredients,
  missingIngredients } | null` — 대체재를 모두 반영한 레시피 버전. 대체
  가능한 재료가 하나도 없으면 `null`입니다. `steps`는 원래 조리 단계를
  바탕으로, 대체재를 "얼마나(분량)" · "어떻게(간 것/다진 것/깍둑썰기 등
  손질 방식)" 넣어야 원래 맛에 가깝게 재현되는지까지 구체적으로 다시
  작성됩니다 — 단순히 재료 이름만 바꿔 적지 않도록 프롬프트에 명시했습니다.

프론트엔드는 SWAP 버튼으로 두 버전을 전환할 때만 이 정보를 보여줍니다.
대체 판단 기준(어디까지 허용할지)은 `api/generate.js`의 `SYSTEM_PROMPT`에서
조정할 수 있습니다.

## 의견 게시판 (Firebase Firestore)

화면 하단에 사용자 의견을 남기고 볼 수 있는 게시판(`board.js`)이 있습니다.
Firebase Firestore의 `boardPosts` 컬렉션에 실시간으로 읽고 쓰는 방식이며,
`index.html`에 `<script type="module" src="board.js">`로 로드됩니다 (기존
영수증 기능인 `main.js`와는 완전히 분리되어 있어, Firebase에 문제가 생겨도
레시피 분석 기능에는 영향이 없습니다).

- 닉네임(선택, 비우면 "익명")과 의견(필수, 최대 500자)을 입력해 등록하면
  `addDoc`으로 `boardPosts` 컬렉션에 `{ name, message, createdAt }` 문서가
  추가됩니다.
- 목록은 `onSnapshot`으로 최신순 50개를 실시간 구독합니다. 다른 사용자가
  글을 남기면 새로고침 없이 바로 반영됩니다.
- 입력값은 렌더링 전 이스케이프 처리되어 있어 XSS로부터 안전합니다.

**중요 — Firestore 데이터베이스 및 보안 규칙 설정이 반드시 필요합니다.**
`board.js`에는 Firebase 프로젝트 설정(`firebaseConfig`)이 이미 포함되어
있지만, 아래 두 가지를 Firebase 콘솔에서 직접 해주셔야 실제로 동작합니다.

1. **Firestore 데이터베이스 생성**: Firebase 콘솔 → Firestore Database →
   데이터베이스 만들기 (아직 만들지 않았다면).
2. **보안 규칙 설정**: 기본(프로덕션 모드) 규칙은 모든 읽기/쓰기를 차단하므로,
   `boardPosts` 컬렉션만 익명으로 읽고 쓸 수 있도록 규칙을 아래처럼
   설정해야 합니다 (Firestore Database → 규칙 탭).

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /boardPosts/{postId} {
         allow read: if true;
         allow create: if request.resource.data.message is string
                       && request.resource.data.message.size() > 0
                       && request.resource.data.message.size() <= 500
                       && request.resource.data.name is string
                       && request.resource.data.name.size() <= 20;
         allow update, delete: if false;
       }
     }
   }
   ```

   이 규칙은 누구나 글을 읽고 새 글을 작성할 수 있게 하되, 수정·삭제는
   막고 메시지 길이를 서버 쪽에서도 한 번 더 검증합니다. 완전히 공개된
   익명 게시판이라 스팸/도배에 취약할 수 있으니, 운영 단계에서는 Firebase
   App Check나 reCAPTCHA, 또는 간단한 요청 빈도 제한을 추가하는 것을
   권장합니다.

## 알아두면 좋은 점 / 한계

- 보유 재료 사진은 여러 장(기본 최대 8장) 동시 업로드가 가능합니다.
  냉장고, 팬트리, 장바구니처럼 서로 다른 장소를 나눠 찍어도 Gemini가
  모든 사진을 함께 보고 재료를 합산해 판단합니다. 최대 장수는
  `main.js`의 `MAX_IMAGES`와 `api/generate.js`의 `MAX_IMAGES`
  상수에서 조정할 수 있습니다.
- 이미지는 base64로 인라인 전송되므로, 사진 장수와 해상도가 많아질수록
  요청 크기가 커집니다. Gemini API의 인라인 요청 크기 제한(약 20MB)과
  Vercel 서버리스 함수의 요청 바디 크기 제한을 넘지 않도록 너무 큰 원본
  사진을 다수 올리는 경우 주의하세요.
- 유튜브 URL을 영상 입력으로 직접 넘기는 기능은 Gemini API의 프리뷰
  기능이며, 비공개(private) 영상이나 매우 긴 영상에는 제한이 있을 수
  있습니다.
- 조미료처럼 사진에 안 보이는 재료는 "구매 필요"로 분류되도록 프롬프트에
  명시했습니다. 필요하면 `api/generate.js`의 `SYSTEM_PROMPT`를 조정하세요.
- 재료 매칭(예: "대파" ≒ "파")은 Gemini가 한 번의 호출 안에서 판단합니다.
  더 엄격하거나 더 느슨한 매칭이 필요하면 프롬프트 문구를 수정하면 됩니다.
- `/api/generate`, Firestore `boardPosts` 컬렉션 모두 별도 인증이나
  요청 빈도 제한이 없습니다. 공개 배포 시 제3자가 무제한으로 호출해
  Gemini API 비용을 소모시키거나 게시판에 스팸을 남길 수 있으니, 트래픽이
  늘어나면 Vercel/Firebase 양쪽에 방어 장치를 추가하는 것을 권장합니다.
