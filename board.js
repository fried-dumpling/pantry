// /board.js
// Firebase-backed feedback board ("의견 게시판").
// Loaded as an ES module (<script type="module" src="board.js">), separate
// from main.js so the receipt-scanning app keeps working even if Firebase
// fails to load for any reason.
//
// Requires a Firestore database to exist in the Firebase project, with
// security rules that allow the "boardPosts" collection to be read and
// created by anyone (see the rules snippet at the bottom of this file / the
// README). Without that, reads/writes will fail with a "permission-denied"
// error even though the code here is correct.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD833ISaAU7k2RJA6we46MYOB0HM5kTWLM",
  authDomain: "pantryanalysis.firebaseapp.com",
  projectId: "pantryanalysis",
  storageBucket: "pantryanalysis.firebasestorage.app",
  messagingSenderId: "965519489394",
  appId: "1:965519489394:web:5475811c0b10de7220c5eb",
  measurementId: "G-0Q5ZED3W5P"
};

const app = initializeApp(firebaseConfig);
try {
  // Analytics can throw in environments that block gtag/measurement
  // (ad blockers, non-HTTPS local previews, etc). It's not essential to the
  // board, so failures here should never break feedback posting.
  getAnalytics(app);
} catch (err) {
  console.warn('Firebase Analytics init skipped:', err);
}

const db = getFirestore(app);
const BOARD_COLLECTION = 'boardPosts';
const MAX_NAME_LENGTH = 20;
const MAX_MESSAGE_LENGTH = 500;

const boardForm = document.getElementById('boardForm');
const boardName = document.getElementById('boardName');
const boardMessage = document.getElementById('boardMessage');
const boardSubmit = document.getElementById('boardSubmit');
const boardStatus = document.getElementById('boardStatus');
const boardList = document.getElementById('boardList');
const boardCount = document.getElementById('boardCount');

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function setBoardStatus(text, isError = false) {
  if (!boardStatus) return;
  boardStatus.textContent = text;
  boardStatus.classList.toggle('error', isError);
}

function formatTimestamp(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '방금 전';
  const d = ts.toDate();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderPosts(snapshot) {
  if (snapshot.empty) {
    boardList.innerHTML = `<li class="board-empty">아직 등록된 의견이 없어요. 첫 의견을 남겨보세요!</li>`;
    boardCount.textContent = '';
    return;
  }

  const rows = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() || {};
    const name = (data.name && String(data.name).trim()) || '익명';
    const message = String(data.message || '');
    if (!message) return;
    rows.push(`
      <li class="board-item">
        <div class="board-item-head">
          <span class="board-item-name">${escapeHtml(name)}</span>
          <span class="board-item-time">${formatTimestamp(data.createdAt)}</span>
        </div>
        <p class="board-item-message">${escapeHtml(message)}</p>
      </li>
    `);
  });

  boardList.innerHTML = rows.join('') || `<li class="board-empty">아직 등록된 의견이 없어요. 첫 의견을 남겨보세요!</li>`;
  boardCount.textContent = `${rows.length}개의 의견`;
}

function listenToBoard() {
  if (!boardList) return;
  try {
    const q = query(collection(db, BOARD_COLLECTION), orderBy('createdAt', 'desc'), limit(50));
    onSnapshot(
      q,
      renderPosts,
      (err) => {
        console.error('Board listen failed:', err);
        boardList.innerHTML = `<li class="board-empty">의견을 불러오지 못했어요. (Firestore 설정을 확인해주세요)</li>`;
      }
    );
  } catch (err) {
    console.error('Board init failed:', err);
    boardList.innerHTML = `<li class="board-empty">의견을 불러오지 못했어요.</li>`;
  }
}

async function handleBoardSubmit(e) {
  e.preventDefault();

  const name = boardName.value.trim().slice(0, MAX_NAME_LENGTH);
  const message = boardMessage.value.trim();

  if (!message) {
    setBoardStatus('의견 내용을 입력해주세요.', true);
    return;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    setBoardStatus(`의견은 ${MAX_MESSAGE_LENGTH}자 이내로 작성해주세요.`, true);
    return;
  }

  boardSubmit.disabled = true;
  setBoardStatus('등록하는 중이에요...');

  try {
    await addDoc(collection(db, BOARD_COLLECTION), {
      name: name || '익명',
      message,
      createdAt: serverTimestamp()
    });
    boardMessage.value = '';
    setBoardStatus('의견이 등록됐어요. 감사합니다!');
  } catch (err) {
    console.error('Board submit failed:', err);
    setBoardStatus('등록 중 오류가 발생했어요. (Firestore 설정을 확인해주세요)', true);
  } finally {
    boardSubmit.disabled = false;
  }
}

if (boardForm) {
  boardForm.addEventListener('submit', handleBoardSubmit);
  listenToBoard();
}
