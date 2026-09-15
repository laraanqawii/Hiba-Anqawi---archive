import { firebaseConfig, FIREBASE_ENABLED } from './firebase-config.js';

/* ======================================================================
   STORE: local (IndexedDB) or cloud (Firebase), same interface for both
   ====================================================================== */

const CATS = [
  { key: 'اختبار', label: 'اختبارات' },
  { key: 'تحضير', label: 'تحضير' },
  { key: 'خطة', label: 'خطط' },
];

let store; // assigned below, either LocalStore or CloudStore instance

/* ---------- Local (IndexedDB) implementation ---------- */
class LocalStore {
  constructor() {
    this.dbPromise = this._openDb();
  }
  _openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('teacher-archive-db', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) {
          db.createObjectStore('items', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async _tx(mode) {
    const db = await this.dbPromise;
    const tx = db.transaction('items', mode);
    return { tx, store: tx.objectStore('items') };
  }
  async getAll() {
    const { store } = await this._tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async addItem(data, file) {
    const id = 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const record = { id, createdAt: Date.now(), ...data };
    if (file) {
      record.fileName = file.name;
      record.fileType = file.type;
      record.fileBlob = file; // stored directly in IndexedDB
    }
    const { tx, store } = await this._tx('readwrite');
    store.put(record);
    await txDone(tx);
    return id;
  }
  async updateItem(id, data, file) {
    const { tx, store } = await this._tx('readwrite');
    const existingReq = store.get(id);
    await reqDone(existingReq);
    const existing = existingReq.result || { id };
    const record = { ...existing, ...data };
    if (file) {
      record.fileName = file.name;
      record.fileType = file.type;
      record.fileBlob = file;
    }
    store.put(record);
    await txDone(tx);
  }
  async deleteItem(id) {
    const { tx, store } = await this._tx('readwrite');
    store.delete(id);
    await txDone(tx);
  }
  fileUrl(item) {
    if (item.fileBlob) return URL.createObjectURL(item.fileBlob);
    return null;
  }
  subscribe(cb) {
    // No realtime updates needed locally; caller re-fetches after each mutation.
    this._cb = cb;
  }
  mode() { return 'local'; }
}

function reqDone(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- Cloud (Firebase) implementation ---------- */
class CloudStore {
  constructor(fb) {
    this.fb = fb; // { db, storage, firestoreFns, storageFns }
    this._items = [];
    this._cb = null;
    this._listen();
  }
  _listen() {
    const { db, firestoreFns } = this.fb;
    const { collection, onSnapshot, query, orderBy } = firestoreFns;
    const q = query(collection(db, 'archive_items'), orderBy('createdAt', 'desc'));
    onSnapshot(q, (snap) => {
      this._items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (this._cb) this._cb(this._items);
    }, (err) => {
      console.error('Firestore listen error', err);
    });
  }
  async getAll() {
    return this._items;
  }
  async _uploadFile(id, file) {
    const { storage, storageFns } = this.fb;
    const { ref, uploadBytes, getDownloadURL } = storageFns;
    const path = `archive_files/${id}/${file.name}`;
    const fileRef = ref(storage, path);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    return { fileName: file.name, fileType: file.type, fileUrl: url, filePath: path };
  }
  async addItem(data, file) {
    const { db, firestoreFns } = this.fb;
    const { collection, addDoc } = firestoreFns;
    const record = { createdAt: Date.now(), ...data };
    const docRef = await addDoc(collection(db, 'archive_items'), record);
    if (file) {
      const fileMeta = await this._uploadFile(docRef.id, file);
      const { updateDoc } = firestoreFns;
      await updateDoc(docRef, fileMeta);
    }
    return docRef.id;
  }
  async updateItem(id, data, file) {
    const { db, firestoreFns } = this.fb;
    const { doc, updateDoc } = firestoreFns;
    const docRef = doc(db, 'archive_items', id);
    let payload = { ...data };
    if (file) {
      const fileMeta = await this._uploadFile(id, file);
      payload = { ...payload, ...fileMeta };
    }
    await updateDoc(docRef, payload);
  }
  async deleteItem(id) {
    const { db, firestoreFns } = this.fb;
    const { doc, deleteDoc } = firestoreFns;
    await deleteDoc(doc(db, 'archive_items', id));
  }
  fileUrl(item) {
    return item.fileUrl || null;
  }
  subscribe(cb) {
    this._cb = cb;
    if (this._items.length) cb(this._items);
  }
  mode() { return 'cloud'; }
}

async function initStore() {
  if (!FIREBASE_ENABLED) {
    return new LocalStore();
  }
  try {
    const [{ initializeApp }, firestoreMod, storageMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js'),
    ]);
    const app = initializeApp(firebaseConfig);
    const db = firestoreMod.getFirestore(app);
    const storage = storageMod.getStorage(app);
    return new CloudStore({
      db, storage,
      firestoreFns: firestoreMod,
      storageFns: storageMod,
    });
  } catch (err) {
    console.error('Firebase init failed, falling back to local storage', err);
    showToast('تعذّر الاتصال بـ Firebase — يعمل الموقع بالوضع المحلي مؤقتًا');
    return new LocalStore();
  }
}

/* ======================================================================
   UI logic (rendering, search, modal) — unchanged in spirit from before
   ====================================================================== */

let items = [];
let activeCat = 'الكل';
let searchTerm = '';
let editingId = null;
let selectedCat = 'اختبار';
let pendingFile = null;

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function showModeBanner(mode) {
  const el = document.getElementById('modeBanner');
  if (!el) return;
  if (mode === 'cloud') {
    el.textContent = '☁️ متصل بأرشيفك السحابي — بياناتك متزامنة من أي جهاز';
    el.style.display = 'block';
  } else {
    el.textContent = '💾 وضع محلي: البيانات محفوظة على هذا المتصفح فقط. لتفعيل الحفظ السحابي راجعي README.md';
    el.style.display = 'block';
  }
}

function renderTabs() {
  const nav = document.getElementById('tabsNav');
  const counts = { 'الكل': items.length };
  CATS.forEach(c => counts[c.key] = items.filter(i => i.category === c.key).length);

  const allTab = `
    <button class="folder-tab ${activeCat === 'الكل' ? 'active' : ''}" data-cat="الكل">
      الكل <span class="count">${counts['الكل']}</span>
    </button>`;
  const catTabs = CATS.map(c => `
    <button class="folder-tab ${activeCat === c.key ? 'active' : ''}" data-cat="${c.key}">
      ${c.label} <span class="count">${counts[c.key]}</span>
    </button>`).join('');

  nav.innerHTML = allTab + catTabs;
  nav.querySelectorAll('.folder-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeCat = btn.dataset.cat;
      renderTabs();
      renderGrid();
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatDate(d) {
  if (!d) return '';
  try {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) { return d; }
}

function renderGrid() {
  const grid = document.getElementById('grid');
  let filtered = items.filter(i => activeCat === 'الكل' || i.category === activeCat);
  if (searchTerm.trim()) {
    const q = searchTerm.trim().toLowerCase();
    filtered = filtered.filter(i =>
      (i.title || '').toLowerCase().includes(q) ||
      (i.content || '').toLowerCase().includes(q) ||
      (i.subject || '').toLowerCase().includes(q)
    );
  }
  filtered.sort((a, b) => (b.date || '').localeCompare(a.date || '') || ((b.createdAt||0) - (a.createdAt||0)));

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        <h2>الدرج فاضي لهلق</h2>
        <p>${items.length === 0 ? 'ابدئي بإضافة أول ملف — اختبار، تحضير، أو خطة.' : 'ما في نتائج مطابقة للبحث أو الفئة المختارة.'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(item => {
    const catLabel = (CATS.find(c => c.key === item.category) || {}).label || item.category;
    const metaBits = [];
    if (item.subject) metaBits.push(escapeHtml(item.subject));
    if (item.date) metaBits.push(formatDate(item.date));
    const fileUrl = store.fileUrl(item);
    return `
      <div class="card" data-cat="${item.category}" data-id="${item.id}">
        <span class="stamp">${catLabel}</span>
        <h3>${escapeHtml(item.title)}</h3>
        ${metaBits.length ? `<div class="meta">${metaBits.map(m => `<span>${m}</span>`).join('')}</div>` : ''}
        ${item.content ? `<p class="snippet">${escapeHtml(item.content)}</p>` : ''}
        ${fileUrl ? `<div class="link-row"><a href="${fileUrl}" target="_blank" rel="noopener">📎 ${escapeHtml(item.fileName || 'فتح الملف المرفق')}</a></div>` : ''}
        ${item.link ? `<div class="link-row"><a href="${escapeHtml(item.link)}" target="_blank" rel="noopener">فتح الرابط ↗</a></div>` : ''}
        <div class="card-actions">
          <button class="icon-btn" data-action="edit" data-id="${item.id}">تعديل</button>
          <button class="icon-btn danger" data-action="delete" data-id="${item.id}">حذف</button>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.id)));
  grid.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => deleteItem(btn.dataset.id)));
}

async function deleteItem(id) {
  const item = items.find(i => i.id === id);
  if (!item) return;
  if (!confirm(`حذف "${item.title}"؟ لا يمكن التراجع عن هذا.`)) return;
  await store.deleteItem(id);
  if (store.mode() === 'local') {
    items = await store.getAll();
    renderTabs(); renderGrid();
  }
  showToast('تم الحذف');
}

function openModal(id) {
  editingId = id || null;
  pendingFile = null;
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('modalTitle');
  document.getElementById('fFile').value = '';
  if (id) {
    const item = items.find(i => i.id === id);
    title.textContent = 'تعديل الملف';
    document.getElementById('fTitle').value = item.title || '';
    document.getElementById('fSubject').value = item.subject || '';
    document.getElementById('fDate').value = item.date || '';
    document.getElementById('fContent').value = item.content || '';
    document.getElementById('fLink').value = item.link || '';
    selectedCat = item.category || 'اختبار';
  } else {
    title.textContent = 'إضافة ملف جديد';
    document.getElementById('fTitle').value = '';
    document.getElementById('fSubject').value = '';
    document.getElementById('fDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('fContent').value = '';
    document.getElementById('fLink').value = '';
    selectedCat = activeCat !== 'الكل' ? activeCat : 'اختبار';
  }
  updateCatPicker();
  overlay.classList.add('open');
  document.getElementById('fTitle').focus();
}

function closeModal() {
  document.getElementById('overlay').classList.remove('open');
  editingId = null;
  pendingFile = null;
}

function updateCatPicker() {
  document.querySelectorAll('.cat-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.cat === selectedCat));
}

async function handleSave() {
  const titleVal = document.getElementById('fTitle').value.trim();
  if (!titleVal) {
    showToast('لازم تكتبي عنوان للملف أولًا');
    document.getElementById('fTitle').focus();
    return;
  }
  const data = {
    category: selectedCat,
    title: titleVal,
    subject: document.getElementById('fSubject').value.trim(),
    date: document.getElementById('fDate').value,
    content: document.getElementById('fContent').value.trim(),
    link: document.getElementById('fLink').value.trim(),
  };
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'جاري الحفظ…';
  try {
    if (editingId) {
      await store.updateItem(editingId, data, pendingFile);
      showToast('تم تحديث الملف');
    } else {
      await store.addItem(data, pendingFile);
      showToast('تمت الإضافة');
    }
    if (store.mode() === 'local') {
      items = await store.getAll();
      renderTabs(); renderGrid();
    }
    closeModal();
  } catch (err) {
    console.error(err);
    showToast('صار خطأ أثناء الحفظ، حاولي مرة ثانية');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'حفظ';
  }
}

function wireEvents() {
  document.getElementById('addBtn').addEventListener('click', () => openModal(null));
  document.getElementById('cancelBtn').addEventListener('click', closeModal);
  document.getElementById('saveBtn').addEventListener('click', handleSave);
  document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
  document.querySelectorAll('.cat-chip').forEach(chip => chip.addEventListener('click', () => { selectedCat = chip.dataset.cat; updateCatPicker(); }));
  document.getElementById('searchInput').addEventListener('input', (e) => { searchTerm = e.target.value; renderGrid(); });
  document.getElementById('fFile').addEventListener('change', (e) => { pendingFile = e.target.files[0] || null; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

(async function main() {
  wireEvents();
  store = await initStore();
  showModeBanner(store.mode());
  if (store.mode() === 'cloud') {
    store.subscribe((list) => {
      items = list;
      renderTabs();
      renderGrid();
    });
  } else {
    items = await store.getAll();
    renderTabs();
    renderGrid();
  }
})();
