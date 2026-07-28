const ytUrlInput = document.getElementById('ytUrl');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const preview = document.getElementById('preview');
const previewCount = document.getElementById('previewCount');
const goBtn = document.getElementById('goBtn');
const statusMsg = document.getElementById('statusMsg');
const printBtn = document.getElementById('printBtn');
const swapBtn = document.getElementById('swapBtn');
const receiptContent = document.getElementById('receiptContent');
const receiptPaper = document.getElementById('receiptPaper');

const DEFAULT_STATUS = 'Gemini로 분석됨 · 결과는 참고용이며 실제 재료 상태와 다를 수 있어요';
const MAX_IMAGES = 8;

const EMPTY_STATE_HTML = `
  <div class="empty-state" id="emptyState">
    <span class="material-symbols-outlined empty-icon">receipt_long</span>
    <p>왼쪽에 유튜브 URL과 재료 사진을 넣고<br/>"영수증 출력하기"를 누르면<br/>여기에 결과가 나와요.</p>
  </div>
`;

// images: [{ id, file, dataUrl, base64, mimeType }]
let images = [];
// last successful API response
let resultData = null;
// 'main' | 'alt'
let currentView = 'main';

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

function setStatus(text, isError=false){
  statusMsg.textContent = text;
  statusMsg.classList.toggle('error', isError);
}

/* ---------- Image upload / preview ---------- */

function renderPreviews(){
  preview.innerHTML = images.map(img => `
    <div class="thumb" data-id="${img.id}">
      <img src="${img.dataUrl}" alt="${escapeHtml(img.file.name)}" />
      <button class="rm" type="button" data-id="${img.id}" title="삭제">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  `).join('');
  previewCount.textContent = images.length ? `${images.length}장 첨부됨 (최대 ${MAX_IMAGES}장)` : '';
}

function addFiles(fileList){
  const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
  const room = MAX_IMAGES - images.length;
  if(room <= 0){
    setStatus(`사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요.`, true);
    return;
  }
  files.slice(0, room).forEach(file => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      images.push({
        id,
        file,
        dataUrl,
        base64: dataUrl.split(',')[1],
        mimeType: file.type
      });
      renderPreviews();
    };
    reader.readAsDataURL(file);
  });
  if(files.length > room){
    setStatus(`사진은 최대 ${MAX_IMAGES}장까지 첨부할 수 있어요. 앞의 ${room}장만 추가했어요.`, true);
  }
}

dropZone.addEventListener('click', (e) => {
  // avoid double-trigger when the native label->input click already fires
  if(e.target.closest('input')) return;
});
fileInput.addEventListener('change', e => {
  addFiles(e.target.files);
  fileInput.value = '';
});

['dragover','dragenter'].forEach(evt =>
  dropZone.addEventListener(evt, e => { e.preventDefault(); dropZone.classList.add('drag'); })
);
['dragleave','drop'].forEach(evt =>
  dropZone.addEventListener(evt, e => { e.preventDefault(); dropZone.classList.remove('drag'); })
);
dropZone.addEventListener('drop', e => {
  if(e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
});

preview.addEventListener('click', e => {
  const btn = e.target.closest('.rm');
  if(!btn) return;
  images = images.filter(img => img.id !== btn.dataset.id);
  renderPreviews();
});

/* ---------- Receipt rendering ---------- */

function isValidYoutubeUrl(url){
  return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(url.trim());
}

function ingredientRow({ name, amount, mark }){
  return `<li><span>${mark || ''}${escapeHtml(name)}</span>${amount ? `<span class="amt">${escapeHtml(amount)}</span>` : ''}</li>`;
}

function buildReceiptHTML(){
  const data = resultData;
  const owned = Array.isArray(data.ownedIngredients) ? data.ownedIngredients : [];
  const required = Array.isArray(data.requiredIngredients) ? data.requiredIngredients : [];
  const missing = Array.isArray(data.missingIngredients) ? data.missingIngredients : [];
  const substitutions = Array.isArray(data.substitutions) ? data.substitutions : [];
  const alt = data.alternativeRecipe || null;
  const isAlt = currentView === 'alt' && alt;

  const contextLabel = isAlt ? 'SUBSTITUTION MODE' : 'ANALYSIS MODE';
  const contextDesc = isAlt
    ? `대체 재료를 반영한 "${escapeHtml(alt.title || '대체 레시피')}" 버전이에요.`
    : `"${escapeHtml(data.recipeTitle || '레시피')}" 기준으로 부족한 재료를 확인했어요.`;

  const summaryTitle = isAlt ? (alt.title || data.recipeTitle || '레시피') : (data.recipeTitle || '레시피');
  const summaryText = isAlt
    ? (alt.summary || alt.description || '대체재를 반영한 레시피 요약이 제공되지 않았어요.')
    : (data.recipeSummary || '레시피 요약이 제공되지 않았어요.');
  const summaryHtml = `
    <div class="recipe-summary">
      <p class="summary-eyebrow">RECIPE SUMMARY${isAlt ? ' · SUBSTITUTED' : ''}</p>
      <h3 class="summary-title">${escapeHtml(summaryTitle)}</h3>
      <p class="summary-desc">${escapeHtml(summaryText)}</p>
    </div>
  `;

  const inventoryHtml = owned.length
    ? owned.map(name => `
        <li><span>${escapeHtml(name)}</span><span class="material-symbols-outlined owned-check">check_circle</span></li>
      `).join('')
    : `<li class="empty-row">보유 재료가 확인되지 않았어요</li>`;

  let shoppingHtml;
  let shoppingCount;
  let totalCount;

  if(isAlt){
    const altMissing = Array.isArray(alt.missingIngredients) ? alt.missingIngredients : [];
    const altRequired = Array.isArray(alt.requiredIngredients) ? alt.requiredIngredients : [];
    const subRows = substitutions.map(s => `
      <li class="sub-row">
        <span class="sub-label">${escapeHtml(s.missingIngredient || '')} → ${escapeHtml(s.substituteWith || '')}</span>
        <span class="sub-tag">SUBSTITUTED</span>
      </li>
    `).join('');
    const missingRows = altMissing.length
      ? altMissing.map(item => ingredientRow(item)).join('')
      : (subRows ? '' : `<li class="empty-row">구매할 재료가 없어요!</li>`);
    shoppingHtml = subRows + missingRows;
    shoppingCount = altMissing.length;
    totalCount = altRequired.length;
  } else {
    shoppingHtml = missing.length
      ? missing.map(item => ingredientRow(item)).join('')
      : `<li class="empty-row">추가로 살 재료가 없어요, 바로 요리 시작!</li>`;
    shoppingCount = missing.length;
    totalCount = required.length;
  }

  return `
    <div class="receipt-brand">
      <h2>Kitchen Scanner</h2>
      <div class="tag">Artisanal Grocery List</div>
    </div>

    ${summaryHtml}

    <div class="context-box ${isAlt ? 'alt-mode' : ''}">
      <p class="context-label">${contextLabel}</p>
      <p class="context-desc">${contextDesc}</p>
    </div>

    <div class="section">
      <div class="section-head">
        <h3>Inventory</h3>
        <span class="stamp stamp-owned">OWNED</span>
      </div>
      <ul class="ing">${inventoryHtml}</ul>
    </div>

    <div class="section">
      <div class="section-head">
        <h3>To Buy</h3>
        <span class="stamp stamp-tobuy">PENDING</span>
      </div>
      <ul class="ing">${shoppingHtml}</ul>
    </div>

    <div class="total-block">
      <div class="total-row dim">
        <span>Total Items</span>
        <span>${totalCount}개</span>
      </div>
      <div class="total-row main">
        <span class="label">구매 필요</span>
        <span class="value">${shoppingCount}개</span>
      </div>
    </div>

    <div class="receipt-meta">
      <p id="receiptDate"></p>
      <p>Processed by AI Engine</p>
      <p>*** FINISH ***</p>
    </div>
  `;
}

function replayPrintAnimation(){
  receiptPaper.style.animation = 'none';
  void receiptPaper.offsetWidth;
  receiptPaper.style.animation = '';
}

function renderReceipt(){
  if(!resultData){
    receiptContent.innerHTML = EMPTY_STATE_HTML;
    return;
  }
  receiptContent.innerHTML = buildReceiptHTML();
  updateClock();
  replayPrintAnimation();
}

function updateClock(){
  const dateEl = document.getElementById('receiptDate');
  if(!dateEl) return;
  const now = new Date();
  const pad = n => n.toString().padStart(2, '0');
  dateEl.textContent = `${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())}-${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}
setInterval(updateClock, 1000);

/* ---------- Actions ---------- */

printBtn.addEventListener('click', () => {
    if(!resultData) return;
    renderReceipt();
});

swapBtn.addEventListener('click', () => {
  if(!resultData || !resultData.alternativeRecipe) return;
  currentView = currentView === 'main' ? 'alt' : 'main';
  swapBtn.classList.toggle('active', currentView === 'alt');
  renderReceipt();
});

async function handleGenerate(){
  const youtubeUrl = ytUrlInput.value.trim();

  if(!isValidYoutubeUrl(youtubeUrl)){
    setStatus('올바른 유튜브 URL을 입력해주세요.', true);
    return;
  }
  if(images.length === 0){
    setStatus('보유 재료 사진을 한 장 이상 업로드해주세요.', true);
    return;
  }

  goBtn.disabled = true;
  printBtn.disabled = true;
  swapBtn.disabled = true;
  swapBtn.classList.remove('active');
  currentView = 'main';
  resultData = null;
  renderReceipt();
  setStatus(`영상과 사진 ${images.length}장을 분석하는 중이에요... (최대 1분 정도 걸릴 수 있어요)`);

  try{
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtubeUrl,
        images: images.map(img => ({ mimeType: img.mimeType, data: img.base64 }))
      })
    });

    const data = await res.json();

    if(!res.ok){
      throw new Error(data.error || '분석 중 오류가 발생했어요.');
    }

    resultData = data;
    //renderReceipt();
    printBtn.disabled = false;
    swapBtn.disabled = !data.alternativeRecipe;
    setStatus(DEFAULT_STATUS);
  }catch(err){
    console.error(err);
    setStatus(err.message || '분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', true);
  }finally{
    goBtn.disabled = false;
  }
}

goBtn.addEventListener('click', handleGenerate);
