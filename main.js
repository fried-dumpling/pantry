const ytUrlInput = document.getElementById('ytUrl');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const preview = document.getElementById('preview');
const previewCount = document.getElementById('previewCount');
const goBtn = document.getElementById('goBtn');
const statusMsg = document.getElementById('statusMsg');
const receiptWrap = document.getElementById('receiptWrap');
const receiptEl = document.getElementById('receipt');

const MAX_IMAGES = 8;
// images: [{ id, file, dataUrl, base64, mimeType }]
let images = [];

function renderPreviews(){
preview.innerHTML = images.map(img => `
    <div class="thumb" data-id="${img.id}">
    <img src="${img.dataUrl}" alt="${escapeHtml(img.file.name)}" />
    <button class="rm" type="button" data-id="${img.id}" title="삭제">×</button>
    </div>
`).join('');

console.log(preview)
console.log(previewCount)

preview.classList.toggle('show', images.length > 0);
previewCount.classList.toggle('show', images.length > 0);
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
    const dataUrl = reader.result; // data:<mime>;base64,<data>
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

fileInput.addEventListener('change', e => {
addFiles(e.target.files);
fileInput.value = ''; // allow re-selecting the same file(s) later
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

function isValidYoutubeUrl(url){
return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(url.trim());
}

function setStatus(text, isError=false){
statusMsg.textContent = text;
statusMsg.classList.toggle('error', isError);
}

function escapeHtml(str){
return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
}

function renderReceipt(data){
const required = Array.isArray(data.requiredIngredients) ? data.requiredIngredients : [];
const owned = Array.isArray(data.ownedIngredients) ? data.ownedIngredients : [];
const missing = Array.isArray(data.missingIngredients) ? data.missingIngredients : [];

const ownedHtml = owned.length
    ? owned.map(name => `<li><span><span class="mark">✓</span>${escapeHtml(name)}</span></li>`).join('')
    : `<li style="border:none;color:var(--ink-soft)">보유 재료가 확인되지 않았어요</li>`;

const missingHtml = missing.length
    ? missing.map(item => `<li><span><span class="mark">＋</span>${escapeHtml(item.name)}</span><span class="amt">${escapeHtml(item.amount || '')}</span></li>`).join('')
    : `<li style="border:none;color:var(--ink-soft)">추가로 살 재료가 없어요, 바로 요리 시작!</li>`;

receiptEl.innerHTML = `
    <div class="receipt-title">${escapeHtml(data.recipeTitle || '레시피')}</div>
    <div class="receipt-meta">TOTAL ${required.length}개 재료 · 보유 ${owned.length} · 구매 필요 ${missing.length}</div>
    <hr class="divider" />
    <div class="section-label"><span>보유 재료</span><span>OWNED</span></div>
    <ul class="ing owned">${ownedHtml}</ul>
    <hr class="divider" />
    <div class="section-label stamp-row"><span>구매 필요</span><span>TO BUY</span>${missing.length ? '<span class="stamp">구매 필요</span>' : ''}</div>
    <ul class="ing missing">${missingHtml}</ul>
    <div class="total"><span>장보기 목록</span><span>${missing.length}개 항목</span></div>
`;
receiptWrap.classList.add('show');
}

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
receiptWrap.classList.remove('show');
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

    renderReceipt(data);
    setStatus('분석 완료!');
}catch(err){
    console.error(err);
    setStatus(err.message || '분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.', true);
}finally{
    goBtn.disabled = false;
}
}

goBtn.addEventListener('click', handleGenerate);