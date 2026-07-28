// /api/generate.js
// Vercel Serverless Function (Node.js runtime).
// Wraps a single Gemini API call: given a YouTube recipe URL and a photo of
// ingredients the user already owns, it asks Gemini to (1) read the recipe's
// ingredient list from the video, (2) identify ingredients visible in the
// photo, and (3) return which required ingredients are already owned vs.
// still need to be bought.
//
// Required environment variable (set in Vercel Project Settings -> Environment Variables):
//   GEMINI_API_KEY   - your Gemini API key. Never hard-code it in source.
//
// Optional environment variable:
//   GEMINI_MODEL     - overrides the default model id (see note below).

const DEFAULT_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
// Note: as of this writing there isn't a plain "gemini-3.1-flash" text/vision
// model id in the Gemini API -- the 3.1 line ships as gemini-3.1-flash-lite
// (multimodal: text/image/video/audio/PDF) plus specialized live/image/tts
// variants. gemini-3.1-flash-lite is used as the closest match by default.
// If you have access to a different/newer flash model (e.g. gemini-3.5-flash
// or gemini-3.6-flash), set GEMINI_MODEL to that id in your Vercel env vars.

const GEMINI_ENDPOINT = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

const SYSTEM_PROMPT = `당신은 요리 재료를 정리해주는 어시스턴트입니다.
다음 두 가지 입력이 주어집니다.
1) 레시피를 설명하는 유튜브 영상
2) 사용자가 현재 가지고 있는 재료들이 찍힌 사진 한 장 이상 (냉장고, 팬트리, 장바구니 등 서로 다른 장소를 찍은 여러 장일 수 있습니다)

작업:
- 영상을 보고 레시피 이름과 필요한 재료 목록(분량 포함, 분량을 알 수 없으면 빈 문자열)을 추출하세요.
- 제공된 모든 사진을 함께 보고, 사진들에 걸쳐 등장하는 재료를 합쳐서 사용자가 실제로 소유한 재료 목록을 추출하세요. 같은 재료가 여러 사진에 나오면 한 번만 표시하세요.
- 필요한 재료 중, 사진 속 재료와 같거나 사실상 동일한 재료(예: "대파"와 "파", "다진 마늘"과 "마늘")는 "보유 재료"로 매칭하세요.
- 매칭되지 않는 필요 재료는 "구매 필요 재료"로 분류하세요. 이때 분량도 함께 제공하세요.
- 소금, 후추, 식용유처럼 사진에 없어도 일반적으로 집에 있을 법한 조미료라도, 사진들 어디에서도 실제로 보이지 않으면 반드시 "구매 필요 재료"로 분류하세요. 임의로 있다고 가정하지 마세요.
- "구매 필요 재료" 각각에 대해, 사용자가 이미 가진 다른 재료로 맛/식감/용도가 충분히 비슷하게 대체할 수 있는지 판단하세요 (예: "생크림" 대신 보유한 "우유+버터", "청주" 대신 보유한 "맛술", "부추" 대신 보유한 "쪽파"). 무리한 대체(예: 핵심 재료를 전혀 다른 재료로 바꾸는 것)는 제안하지 마세요. 확실한 대체재가 있을 때만 substitutions에 넣으세요.
- 대체 가능한 재료가 하나 이상 있다면, 그 대체재들을 모두 반영한 "대체 레시피 버전"을 만드세요 (alternativeRecipe). 이 버전의 requiredIngredients는 원래 레시피에서 대체 가능한 항목을 대체재로 바꾼 전체 재료 목록이고, missingIngredients는 대체를 적용한 뒤에도 여전히 사야 하는 재료만 남긴 목록입니다. 대체 가능한 재료가 하나도 없다면 alternativeRecipe는 null로 두고 substitutions는 빈 배열로 두세요.

아래 JSON 스키마 형식으로만 응답하세요. 다른 설명, 마크다운, 코드펜스(백틱) 없이 순수 JSON 객체만 출력하세요:
{
  "recipeTitle": "string, 레시피/요리 이름",
  "requiredIngredients": [ { "name": "string", "amount": "string" } ],
  "ownedIngredients": [ "string" ],
  "missingIngredients": [ { "name": "string", "amount": "string" } ],
  "substitutions": [
    { "missingIngredient": "string, 원래 구매가 필요했던 재료", "substituteWith": "string, 대체에 쓸 보유 재료", "note": "string, 왜 대체 가능한지 짧은 설명 (맛/식감 차이 등)" }
  ],
  "alternativeRecipe": {
    "title": "string, 대체 재료를 활용한 버전 이름",
    "description": "string, 한두 문장 설명",
    "requiredIngredients": [ { "name": "string", "amount": "string" } ],
    "missingIngredients": [ { "name": "string", "amount": "string" } ]
  } | null
}`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 지원합니다.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: '서버에 GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다. Vercel 프로젝트 설정에서 환경변수를 추가해주세요.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { youtubeUrl, images, imageBase64, mimeType } = body || {};

  if (!youtubeUrl || typeof youtubeUrl !== 'string') {
    return res.status(400).json({ error: 'youtubeUrl 값이 필요합니다.' });
  }
  const ytPattern = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/;
  if (!ytPattern.test(youtubeUrl.trim())) {
    return res.status(400).json({ error: '올바른 유튜브 URL이 아닙니다.' });
  }

  // Accept either the new multi-image `images: [{ mimeType, data }]` shape,
  // or the older single-image `imageBase64` + `mimeType` shape for backward
  // compatibility.
  let imageList = [];
  if (Array.isArray(images) && images.length > 0) {
    imageList = images
      .filter((img) => img && typeof img.data === 'string')
      .map((img) => ({ mimeType: img.mimeType || 'image/jpeg', data: img.data }));
  } else if (imageBase64 && typeof imageBase64 === 'string') {
    imageList = [{ mimeType: mimeType || 'image/jpeg', data: imageBase64 }];
  }

  if (imageList.length === 0) {
    return res.status(400).json({ error: '재료 사진이 최소 한 장 필요합니다.' });
  }

  const MAX_IMAGES = 8;
  if (imageList.length > MAX_IMAGES) {
    return res.status(400).json({ error: `사진은 최대 ${MAX_IMAGES}장까지 지원합니다.` });
  }

  const model = DEFAULT_MODEL;

  const imageParts = imageList.map((img) => ({
    inline_data: {
      mime_type: img.mimeType,
      data: img.data
    }
  }));

  const requestPayload = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          {
            file_data: {
              file_uri: youtubeUrl.trim(),
              mime_type: 'video/*'
            }
          },
          { text: `아래는 사용자가 보유한 재료 사진 ${imageList.length}장입니다.` },
          ...imageParts,
          { text: '위 스키마에 맞는 JSON만 출력하세요.' }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  try {
    const geminiRes = await fetch(GEMINI_ENDPOINT(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestPayload)
    });

    const raw = await geminiRes.text();
    let geminiJson;
    try { geminiJson = JSON.parse(raw); } catch {
      return res.status(502).json({ error: 'Gemini API 응답을 해석할 수 없습니다.', detail: raw.slice(0, 500) });
    }

    if (!geminiRes.ok) {
      const message = geminiJson?.error?.message || 'Gemini API 호출에 실패했습니다.';
      return res.status(geminiRes.status).json({ error: message });
    }

    const candidate = geminiJson?.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const textPart = candidate?.content?.parts?.find((p) => typeof p.text === 'string');

    if (!textPart) {
      return res.status(502).json({
        error: 'Gemini가 결과 텍스트를 반환하지 않았습니다.',
        detail: finishReason || null
      });
    }

    const cleaned = textPart.text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({
        error: 'Gemini 응답을 JSON으로 파싱하지 못했습니다.',
        detail: cleaned.slice(0, 800)
      });
    }

    const altRecipeRaw = parsed.alternativeRecipe;
    const alternativeRecipe = (altRecipeRaw && typeof altRecipeRaw === 'object')
      ? {
          title: altRecipeRaw.title || '대체 재료 버전',
          description: altRecipeRaw.description || '',
          requiredIngredients: Array.isArray(altRecipeRaw.requiredIngredients) ? altRecipeRaw.requiredIngredients : [],
          missingIngredients: Array.isArray(altRecipeRaw.missingIngredients) ? altRecipeRaw.missingIngredients : []
        }
      : null;

    return res.status(200).json({
      recipeTitle: parsed.recipeTitle || '레시피',
      requiredIngredients: Array.isArray(parsed.requiredIngredients) ? parsed.requiredIngredients : [],
      ownedIngredients: Array.isArray(parsed.ownedIngredients) ? parsed.ownedIngredients : [],
      missingIngredients: Array.isArray(parsed.missingIngredients) ? parsed.missingIngredients : [],
      substitutions: Array.isArray(parsed.substitutions) ? parsed.substitutions : [],
      alternativeRecipe
    });
  } catch (err) {
    console.error('Gemini request failed:', err);
    return res.status(500).json({ error: '서버 오류로 분석에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }
};
