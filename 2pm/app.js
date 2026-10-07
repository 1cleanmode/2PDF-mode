// ==================== CONFIG ====================
const MAX_FILE_MB = 25;
const MAX_IMAGES = 100;
const QUALITY_PRESETS = {
    1: { label: 'Low',              maxDim: 1200,     format: 'jpeg', jpegQ: 0.60 },
    2: { label: 'Medium',           maxDim: 1800,     format: 'jpeg', jpegQ: 0.75 },
    3: { label: 'High',             maxDim: 2600,     format: 'jpeg', jpegQ: 0.88 },
    4: { label: 'Original',         maxDim: Infinity, format: 'png'  },
    5: { label: 'Screenshot (PNG)', maxDim: Infinity, format: 'png'  }
};

const MIN_PROGRESS_MS = 2500;
const PER_PAGE_MS     = 150;
const MAX_PROGRESS_MS = 6000;

const HERO_LINE_1 = 'Convert anything to PDF.';
const HERO_LINE_2 = 'Upload, convert, rename & download.';
const TYPE_SPEED_MS = 45;
const TYPE_PAUSE_MS = 400;

const THUMB_WIDTH = 60;
const THUMB_HEIGHT = 76;

// ==================== DOM ====================
const dropZone          = document.getElementById('dropZone');
const activeState       = document.getElementById('activeState');
const browseBtn         = document.getElementById('browseBtn');
const addMoreBtn        = document.getElementById('addMoreBtn');
const fileCountBadge    = document.getElementById('fileCountBadge');
const fileInput         = document.getElementById('fileInput');
const previewGrid       = document.getElementById('previewGrid');
const convertBtn        = document.getElementById('convertBtn');
const clearBtn          = document.getElementById('clearBtn');
const undoBtn           = document.getElementById('undoBtn');
const redoBtn           = document.getElementById('redoBtn');
const progressOverlay   = document.getElementById('progressOverlay');
const cancelBtn         = document.getElementById('cancelBtn');
const pageSizeSelect    = document.getElementById('pageSize');
const orientationSelect = document.getElementById('orientation');
const layoutSelect      = document.getElementById('layout');
const marginSelect      = document.getElementById('margin');
const qualityInput      = document.getElementById('quality');
const qualityValue      = document.getElementById('qualityValue');
const themeToggle       = document.getElementById('themeToggle');
const toastContainer    = document.getElementById('toastContainer');
const sortModeSelect    = document.getElementById('sortMode');
const sizeToggle        = document.getElementById('sizeToggle');
const filenameInput     = document.getElementById('filenameInput');
const autoNumberToggle  = document.getElementById('autoNumberToggle');
const loginBtn          = document.getElementById('loginBtn');
const loginMenu         = document.getElementById('loginMenu');
const loginWrap         = loginBtn ? loginBtn.closest('.login-wrap') : null;
const pdfPreviewOverlay = document.getElementById('pdfPreviewOverlay');
const pdfPreviewProgress= document.getElementById('pdfPreviewProgress');
const pdfPreviewBody    = document.getElementById('pdfPreviewBody');
const pdfPreviewActions = document.getElementById('pdfPreviewActions');
const pdfPreviewCanvas  = document.getElementById('pdfPreviewCanvas');
const pdfPreviewThumbs  = document.getElementById('pdfPreviewThumbs');
const pdfPreviewClose   = document.getElementById('pdfPreviewClose');
const pdfPreviewCancel  = document.getElementById('pdfPreviewCancel');
const pdfPreviewDownload= document.getElementById('pdfPreviewDownload');
const modalProgressText = document.getElementById('modalProgressText');
const modalProgressSub  = document.getElementById('modalProgressSub');
const modalProgressFill = document.getElementById('modalProgressFill');
const modalProgressPct  = document.getElementById('modalProgressPct');
const typeLine1         = document.getElementById('typeLine1');
const typeLine2         = document.getElementById('typeLine2');

let items = [];
let dragState = null;
let userTouchedQuality = false;
let cancelRequested = false;

// Preview state
let previewPdfDoc = null;           // pdf.js document
let previewCurrentPage = 1;
let previewPdfBytes = null;         // Uint8Array of the last generated PDF
let previewFilename = '';

// Undo/redo
const history = { stack: [], cursor: -1 };
const MAX_HISTORY = 50;
function snapshotItems() {
    return items.map(it => ({
        kind: it.kind, file: it.file, bytes: it.bytes,
        dataUrl: it.dataUrl, width: it.width, height: it.height,
        mime: it.mime, rotation: it.rotation,
        name: it.name, lastModified: it.lastModified
    }));
}
function pushHistory() {
    history.stack = history.stack.slice(0, history.cursor + 1);
    history.stack.push(snapshotItems());
    if (history.stack.length > MAX_HISTORY) history.stack.shift();
    history.cursor = history.stack.length - 1;
    updateUndoRedoButtons();
}
function restoreSnapshot(snap) {
    items = snap.map(it => ({ ...it }));
    renderPreviews();
}
function undo() {
    if (history.cursor <= 0) return;
    history.cursor--;
    restoreSnapshot(history.stack[history.cursor]);
    updateUndoRedoButtons();
}
function redo() {
    if (history.cursor >= history.stack.length - 1) return;
    history.cursor++;
    restoreSnapshot(history.stack[history.cursor]);
    updateUndoRedoButtons();
}
function updateUndoRedoButtons() {
    if (!undoBtn || !redoBtn) return;
    undoBtn.disabled = history.cursor <= 0;
    redoBtn.disabled = history.cursor >= history.stack.length - 1;
}
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) { e.preventDefault(); redo(); }
        else            { e.preventDefault(); undo(); }
    } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault(); redo();
    }
});

// ==================== THEME ====================
const THEME_KEY = '2pdfmode-theme';
const THEME_MANUAL_KEY = '2pdfmode-theme-manual';

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}
function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function initTheme() {
    const manual = localStorage.getItem(THEME_MANUAL_KEY) === 'true';
    if (manual) {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored) applyTheme(stored);
    } else {
        applyTheme(systemPrefersDark() ? 'dark' : 'light');
    }
    if (window.matchMedia) {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const listener = (e) => {
            if (localStorage.getItem(THEME_MANUAL_KEY) === 'true') return;
            applyTheme(e.matches ? 'dark' : 'light');
        };
        if (mq.addEventListener) mq.addEventListener('change', listener);
        else if (mq.addListener) mq.addListener(listener);
    }
}
themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
    localStorage.setItem(THEME_MANUAL_KEY, 'true');
    saveSettings();
});

// ==================== SETTINGS ====================
const SETTINGS_KEY = '2pdfmode-settings';
function loadSettings() {
    try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        if (s.pageSize)    pageSizeSelect.value    = s.pageSize;
        if (s.orientation) orientationSelect.value = s.orientation;
        if (s.layout)      layoutSelect.value      = s.layout;
        if (s.margin)      marginSelect.value      = s.margin;
        if (s.quality)     qualityInput.value      = s.quality;
        if (s.sortMode)    sortModeSelect.value    = s.sortMode;
        if (s.thumbSize)   setThumbSize(s.thumbSize, false);
        if (s.filename)    filenameInput.value     = s.filename;
        if (s.userTouchedQuality) userTouchedQuality = true;
        if (s.autoNumber && autoNumberToggle) autoNumberToggle.checked = true;
    } catch (e) {}
    updateQualityLabel();
}
function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            pageSize:    pageSizeSelect.value,
            orientation: orientationSelect.value,
            layout:      layoutSelect.value,
            margin:      marginSelect.value,
            quality:     qualityInput.value,
            sortMode:    sortModeSelect.value,
            thumbSize:   document.querySelector('.size-toggle button.active')?.dataset.size || 'medium',
            filename:    filenameInput.value,
            userTouchedQuality,
            autoNumber:  autoNumberToggle ? autoNumberToggle.checked : false
        }));
    } catch (e) {}
}
[pageSizeSelect, orientationSelect, layoutSelect, marginSelect, sortModeSelect].forEach(el => {
    el.addEventListener('change', saveSettings);
});
qualityInput.addEventListener('input', () => {
    userTouchedQuality = true;
    updateQualityLabel();
    saveSettings();
});
filenameInput.addEventListener('input', saveSettings);
if (autoNumberToggle) {
    autoNumberToggle.addEventListener('change', () => {
        renderPreviews();
        saveSettings();
    });
}
function updateQualityLabel() {
    qualityValue.textContent = QUALITY_PRESETS[qualityInput.value].label;
}

// ==================== THUMB SIZE ====================
function setThumbSize(size, persist = true) {
    previewGrid.classList.remove('size-small', 'size-medium', 'size-large');
    previewGrid.classList.add('size-' + size);
    sizeToggle.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.size === size);
    });
    if (persist) saveSettings();
}
sizeToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    setThumbSize(btn.dataset.size);
});

// ==================== TOASTS ====================
function toast(message, type = 'info', duration = 4000) {
    const el = document.createElement('div');
    el.className = 'toast' + (type !== 'info' ? ' ' + type : '');
    const icon = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
    el.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    toastContainer.appendChild(el);
    setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 300);
    }, duration);
}

// ==================== LOGIN DROPDOWN ====================
(function initLoginMenu() {
    if (!loginBtn || !loginMenu || !loginWrap) return;
    function openMenu() {
        loginWrap.classList.add('open');
        loginBtn.setAttribute('aria-expanded', 'true');
        loginMenu.setAttribute('aria-hidden', 'false');
    }
    function closeMenu() {
        loginWrap.classList.remove('open');
        loginBtn.setAttribute('aria-expanded', 'false');
        loginMenu.setAttribute('aria-hidden', 'true');
    }
    function toggleMenu(e) {
        e.stopPropagation();
        if (loginWrap.classList.contains('open')) closeMenu();
        else openMenu();
    }
    loginBtn.addEventListener('click', toggleMenu);
    document.addEventListener('click', (e) => {
        if (!loginWrap.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && loginWrap.classList.contains('open')) {
            closeMenu();
            loginBtn.focus();
        }
    });
    loginMenu.querySelectorAll('.login-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const provider = item.dataset.provider || 'this method';
            toast(`${provider} sign-in — Coming soon`, 'info', 3500);
            closeMenu();
        });
    });
})();

// ==================== HERO TYPING ====================
(function initHeroTyping() {
    if (!typeLine1 || !typeLine2) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
        typeLine1.textContent = HERO_LINE_1;
        typeLine2.textContent = HERO_LINE_2;
        return;
    }
    let i = 0, j = 0;
    function typeLine1Step() {
        if (i <= HERO_LINE_1.length) {
            typeLine1.textContent = HERO_LINE_1.slice(0, i);
            i++;
            setTimeout(typeLine1Step, TYPE_SPEED_MS);
        } else {
            setTimeout(typeLine2Step, TYPE_PAUSE_MS);
        }
    }
    function typeLine2Step() {
        if (j <= HERO_LINE_2.length) {
            typeLine2.textContent = HERO_LINE_2.slice(0, j);
            j++;
            setTimeout(typeLine2Step, TYPE_SPEED_MS);
        }
    }
    setTimeout(typeLine1Step, 350);
})();

// ==================== UPLOAD ====================
dropZone.addEventListener('click', (e) => {
    if (e.target.closest('.link-btn')) return;
    fileInput.click();
});
browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
});
addMoreBtn.addEventListener('click', () => fileInput.click());

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    dropZone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
});
['dragover', 'drop'].forEach(evt => {
    window.addEventListener(evt, (e) => {
        if (e.target === dropZone || dropZone.contains(e.target)) return;
        e.preventDefault();
    });
});
dropZone.addEventListener('dragover', () => dropZone.classList.add('drag'));
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', (e) => {
    dropZone.classList.remove('drag');
    if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = '';
});

// ==================== SCREENSHOT DETECTION ====================
function looksLikeScreenshot(width, height, mime) {
    if (!width || !height) return false;
    const w = Math.max(width, height);
    const h = Math.min(width, height);
    const ratio = w / h;
    const screenRatios = [16/9, 16/10, 4/3, 3/2, 21/9, 9/16, 10/16];
    const ratioMatch = screenRatios.some(r => Math.abs(ratio - r) < 0.08);
    const commonWidths = [1280, 1366, 1440, 1536, 1600, 1680, 1920, 2048, 2560, 2880, 3440, 3840, 1080, 1170, 1242, 1284];
    const widthMatch = commonWidths.some(cw => Math.abs(w - cw) < 40);
    const isPng = mime === 'image/png';
    const isBig = w >= 1000 && h >= 600;
    let score = 0;
    if (ratioMatch) score++;
    if (widthMatch) score++;
    if (isPng && isBig) score++;
    return score >= 2;
}

// ==================== FILE HANDLING ====================
function handleFiles(fileList) {
    const incoming = Array.from(fileList);
    let added = 0, skippedType = 0, skippedSize = 0, skippedCount = 0;
    let screenshotDetected = false;
    const addedItems = [];

    const process = (file, isPdf) => {
        if (isPdf) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const it = {
                    kind: 'pdf', file, bytes: e.target.result,
                    name: file.name, lastModified: file.lastModified
                };
                items.push(it); addedItems.push(it); renderPreviews();
                if (addedItems.length === added) pushHistory();
            };
            reader.readAsArrayBuffer(file);
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                const probe = new Image();
                probe.onload = () => {
                    const w = probe.naturalWidth;
                    const h = probe.naturalHeight;
                    if (!userTouchedQuality && looksLikeScreenshot(w, h, file.type)) {
                        if (qualityInput.value !== '5') {
                            qualityInput.value = '5';
                            updateQualityLabel();
                            saveSettings();
                            if (!screenshotDetected) {
                                screenshotDetected = true;
                                toast('Screenshot detected — quality set to Screenshot (PNG)', 'success', 5000);
                            }
                        }
                    }
                    const it = {
                        kind: 'image', file, dataUrl, width: w, height: h,
                        mime: file.type, rotation: 0,
                        name: file.name, lastModified: file.lastModified
                    };
                    items.push(it); addedItems.push(it); renderPreviews();
                    if (addedItems.length === added) pushHistory();
                };
                probe.onerror = () => {
                    const it = {
                        kind: 'image', file, dataUrl,
                        width: 0, height: 0, mime: file.type, rotation: 0,
                        name: file.name, lastModified: file.lastModified
                    };
                    items.push(it); addedItems.push(it); renderPreviews();
                    if (addedItems.length === added) pushHistory();
                };
                probe.src = dataUrl;
            };
            reader.readAsDataURL(file);
        }
    };

    incoming.forEach(file => {
        if (items.length + added >= MAX_IMAGES) { skippedCount++; return; }
        const isImage = file.type.startsWith('image/');
        const isPdf   = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (!isImage && !isPdf) { skippedType++; return; }
        if (file.size > MAX_FILE_MB * 1024 * 1024) { skippedSize++; return; }
        added++;
        process(file, isPdf);
    });

    if (added === 0) pushHistory();
    if (skippedType)  toast(`${skippedType} file(s) skipped — unsupported type.`, 'error');
    if (skippedSize)  toast(`${skippedSize} file(s) skipped — over ${MAX_FILE_MB}MB.`, 'error');
    if (skippedCount) toast(`${skippedCount} file(s) skipped — ${MAX_IMAGES} item limit.`, 'error');
}

// ==================== SORT ====================
function getSortedItems() {
    const mode = sortModeSelect.value;
    const copy = items.slice();
    if (mode === 'original') return copy;
    if (mode === 'name')      return copy.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
    if (mode === 'name-desc') return copy.sort((a,b) => b.name.localeCompare(a.name, undefined, {numeric:true}));
    if (mode === 'date')      return copy.sort((a,b) => (b.lastModified||0) - (a.lastModified||0));
    if (mode === 'date-asc')  return copy.sort((a,b) => (a.lastModified||0) - (b.lastModified||0));
    return copy;
}
sortModeSelect.addEventListener('change', () => { renderPreviews(); saveSettings(); });

// ==================== STATE TOGGLE ====================
function updateUIState() {
    const hasItems = items.length > 0;
    dropZone.style.display = hasItems ? 'none' : '';
    activeState.style.display = hasItems ? 'flex' : 'none';
    fileCountBadge.textContent = `${items.length} File${items.length !== 1 ? 's' : ''}`;
    fileCountBadge.classList.toggle('has-files', hasItems);
}

// ==================== LABEL ====================
function getDisplayLabel(item, index) {
    if (autoNumberToggle && autoNumberToggle.checked) return `document-${index + 1}`;
    return item.name;
}

// ==================== RENDER ====================
function renderPreviews() {
    updateUIState();
    if (items.length === 0) { previewGrid.innerHTML = ''; return; }
    previewGrid.innerHTML = '';
    const sorted = getSortedItems();

    sorted.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';
        div.dataset.index = index;

        if (item.kind === 'image') {
            const imgEl = document.createElement('img');
            imgEl.src = item.dataUrl;
            imgEl.alt = getDisplayLabel(item, index);
            if (item.rotation) imgEl.style.transform = `rotate(${item.rotation}deg)`;
            div.appendChild(imgEl);

            const rotateBtn = document.createElement('button');
            rotateBtn.className = 'rotate';
            rotateBtn.title = 'Rotate 90°';
            rotateBtn.textContent = '↻';
            rotateBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                item.rotation = (item.rotation + 90) % 360;
                renderPreviews();
                pushHistory();
            });
            div.appendChild(rotateBtn);
        } else {
            const thumb = document.createElement('div');
            thumb.className = 'pdf-thumb';
            thumb.innerHTML = `📄<span>${getDisplayLabel(item, index)}</span>`;
            div.appendChild(thumb);
        }

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove';
        removeBtn.title = 'Remove';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            items.splice(items.indexOf(item), 1);
            renderPreviews();
            pushHistory();
        });
        div.appendChild(removeBtn);

        const pageNum = document.createElement('div');
        pageNum.className = 'page-number';
        pageNum.textContent = `Page ${index + 1}`;
        div.appendChild(pageNum);

        if (dragState && dragState.item === item) div.classList.add('dragging');
        div.addEventListener('pointerdown', handlePointerDown, { capture: true });
        previewGrid.appendChild(div);
    });
}

// ==================== REORDER ====================
function handlePointerDown(e) {
    if (e.target.closest('.remove, .rotate')) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();

    let el = this;
    const startX = e.clientX;
    const startY = e.clientY;
    const startIndex = +el.dataset.index;
    const sorted = getSortedItems();
    const draggedItem = sorted[startIndex];
    if (!draggedItem) return;

    dragState = { item: draggedItem, startX, startY, started: false, ghostEl: null, pointerId: e.pointerId };

    function onMove(ev) {
        if (!dragState) return;
        const dx = ev.clientX - dragState.startX;
        const dy = ev.clientY - dragState.startY;
        if (!dragState.started && Math.hypot(dx, dy) > 3) {
            dragState.started = true;
            const rect = el.getBoundingClientRect();
            const ghost = el.cloneNode(true);
            ghost.classList.add('drag-ghost');
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            ghost.style.left = rect.left + 'px';
            ghost.style.top = rect.top + 'px';
            ghost.style.position = 'fixed';
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '9999';
            ghost.style.opacity = '0.95';
            ghost.style.transform = 'scale(1.05)';
            document.body.appendChild(ghost);
            dragState.ghostEl = ghost;
            el.style.opacity = '0.35';
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
        }
        if (!dragState.started) return;
        const rect = el.getBoundingClientRect();
        dragState.ghostEl.style.left = (rect.left + dx) + 'px';
        dragState.ghostEl.style.top  = (rect.top  + dy) + 'px';
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const targetEl = under && under.closest && under.closest('.preview-item');
        if (!targetEl) return;
        if (targetEl === el) return;
        const targetIndex = +targetEl.dataset.index;
        const currentIndex = +el.dataset.index;
        if (targetIndex === currentIndex) return;
        swapInArray(currentIndex, targetIndex);
        renderPreviews();
        const newEl = previewGrid.querySelector(`.preview-item[data-index="${targetIndex}"]`);
        if (newEl) { el = newEl; el.style.opacity = '0.35'; }
    }

    function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        if (dragState && dragState.ghostEl) dragState.ghostEl.remove();
        document.querySelectorAll('.preview-item.dragging').forEach(x => x.classList.remove('dragging'));
        document.querySelectorAll('.preview-item').forEach(x => x.style.opacity = '');
        const didReorder = dragState && dragState.started;
        dragState = null;
        renderPreviews();
        if (didReorder) pushHistory();
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
}

function swapInArray(a, b) {
    if (a === b) return;
    if (sortModeSelect.value !== 'original') {
        items = getSortedItems();
        sortModeSelect.value = 'original';
        saveSettings();
    }
    const tmp = items[a]; items[a] = items[b]; items[b] = tmp;
}

// ==================== CLEAR ====================
clearBtn.addEventListener('click', () => {
    if (items.length === 0) return;
    if (confirm('Remove all items?')) {
        items = [];
        renderPreviews();
        pushHistory();
    }
});

// ==================== PROGRESS HELPERS ====================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function setModalProgress(pct, subText) {
    const clamped = Math.max(0, Math.min(100, pct));
    modalProgressFill.style.width = clamped + '%';
    modalProgressPct.textContent = Math.round(clamped) + '%';
    if (subText) modalProgressSub.textContent = subText;
}

// ==================== CANCEL (unused now, hidden overlay) ====================
cancelBtn.addEventListener('click', () => {
    cancelRequested = true;
});

// ==================== CONVERT (opens preview modal immediately) ====================
convertBtn.addEventListener('click', () => {
    if (items.length === 0) return;
    cancelRequested = false;

    // Open the modal immediately in progress state
    pdfPreviewOverlay.classList.add('active');
    pdfPreviewProgress.style.display = 'flex';
    pdfPreviewBody.style.display = 'none';
    pdfPreviewActions.style.display = 'none';

    modalProgressText.textContent = 'Cooking your PDF';
    setModalProgress(0, 'Preparing…');

    // Clear previous preview state
    if (previewPdfDoc) { try { previewPdfDoc.destroy(); } catch (e) {} previewPdfDoc = null; }
    previewCurrentPage = 1;
    previewPdfBytes = null;
    pdfPreviewThumbs.innerHTML = '';
    pdfPreviewCanvas.getContext('2d').clearRect(0, 0, pdfPreviewCanvas.width, pdfPreviewCanvas.height);

    setTimeout(() => generatePDF(), 80);
});

// ==================== BUILD PDF ====================
async function generatePDF() {
    const totalPages = items.length;
    const totalDuration = Math.min(MAX_PROGRESS_MS, MIN_PROGRESS_MS + totalPages * PER_PAGE_MS);
    const perPageDelay = totalDuration / totalPages;

    const { PDFDocument } = window.PDFLib || {};
    if (!PDFDocument) {
        closePdfPreview();
        toast('PDF library not loaded. Check your internet connection.', 'error');
        return;
    }

    const pageSize    = pageSizeSelect.value;
    const orientation = orientationSelect.value;
    const layoutMode  = layoutSelect.value;
    const marginMm    = parseFloat(marginSelect.value);
    const preset      = QUALITY_PRESETS[qualityInput.value];
    const sorted      = getSortedItems();
    const useNative   = pageSize === 'native';

    const MM_TO_PT = 72 / 25.4;
    const standardSizes = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6] };

    const outDoc = await PDFDocument.create();

    for (let i = 0; i < sorted.length; i++) {
        if (cancelRequested) {
            closePdfPreview();
            toast('Conversion cancelled', 'info');
            return;
        }
        const item = sorted[i];
        const pageStart = Date.now();

        if (item.kind === 'image') {
            const processed = await processImage(item, preset);
            const imgBytes = dataUrlToUint8Array(processed.dataUrl);
            let embedded;
            if (processed.format === 'png') embedded = await outDoc.embedPng(imgBytes);
            else embedded = await outDoc.embedJpg(imgBytes);

            let pw, ph;
            if (useNative) {
                pw = processed.width; ph = processed.height;
                if (orientation === 'landscape' && ph > pw) { [pw, ph] = [ph, pw]; }
            } else {
                const base = standardSizes[pageSize] || standardSizes.a4;
                let [wm, hm] = base;
                if (orientation === 'landscape') { [wm, hm] = [hm, wm]; }
                pw = wm * MM_TO_PT; ph = hm * MM_TO_PT;
            }

            const page = outDoc.addPage([pw, ph]);
            if (useNative) {
                page.drawImage(embedded, { x: 0, y: 0, width: pw, height: ph });
            } else {
                const marginPt = marginMm * MM_TO_PT;
                const maxW = pw - marginPt * 2;
                const maxH = ph - marginPt * 2;
                const ratio = processed.width / processed.height;
                let drawW, drawH;
                if (layoutMode === 'fill') {
                    if (ratio > maxW / maxH) { drawH = maxH; drawW = drawH * ratio; }
                    else                     { drawW = maxW; drawH = drawW / ratio; }
                } else {
                    if (ratio > maxW / maxH) { drawW = maxW; drawH = drawW / ratio; }
                    else                     { drawH = maxH; drawW = drawH * ratio; }
                }
                const x = (pw - drawW) / 2;
                const y = (ph - drawH) / 2;
                page.drawImage(embedded, { x, y, width: drawW, height: drawH });
            }
        } else if (item.kind === 'pdf') {
            try {
                const srcDoc = await PDFDocument.load(item.bytes, { ignoreEncryption: true });
                const srcIndices = srcDoc.getPageIndices();
                const copied = await outDoc.copyPages(srcDoc, srcIndices);
                copied.forEach(p => outDoc.addPage(p));
            } catch (err) {
                console.warn('PDF merge failed for', item.name, err);
                toast(`Couldn't merge "${item.name}"`, 'error');
            }
        }

        const elapsed = Date.now() - pageStart;
        const remaining = Math.max(0, perPageDelay - elapsed);
        if (remaining > 0) await sleep(remaining);

        if (cancelRequested) {
            closePdfPreview();
            toast('Conversion cancelled', 'info');
            return;
        }
        const pct = ((i + 1) / sorted.length) * 100;
        setModalProgress(pct, `Converting page ${i + 1} of ${sorted.length}`);
    }

    modalProgressText.textContent = 'Rendering preview…';
    setModalProgress(100, 'Finalizing…');
    await sleep(200);

    const pdfBytes = await outDoc.save();

    let base = (filenameInput.value || '').trim();
    if (!base) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        base = `2pdfmode-${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    }
    base = base.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_');
    previewFilename = `${base}.pdf`;
    previewPdfBytes = pdfBytes;

    await renderPreview(pdfBytes);
}

// ==================== PREVIEW RENDER (pdf.js) ====================
async function renderPreview(pdfBytes) {
    // Wait for pdf.js to be ready
    const waitForPdfJs = () => new Promise((resolve) => {
        if (window.pdfjsLib) return resolve();
        let tries = 0;
        const t = setInterval(() => {
            tries++;
            if (window.pdfjsLib) { clearInterval(t); resolve(); }
            else if (tries > 100) { clearInterval(t); resolve(); }
        }, 50);
    });
    await waitForPdfJs();

    if (!window.pdfjsLib) {
        pdfPreviewProgress.style.display = 'none';
        pdfPreviewBody.style.display = 'flex';
        pdfPreviewActions.style.display = 'flex';
        toast('PDF renderer failed to load — preview unavailable, but download still works.', 'error', 6000);
        return;
    }

    try {
        // pdf.js modifies the underlying buffer, so pass a copy
        const bytesCopy = new Uint8Array(pdfBytes);
        previewPdfDoc = await window.pdfjsLib.getDocument({ data: bytesCopy }).promise;

        // Hide progress, show body + actions
        pdfPreviewProgress.style.display = 'none';
        pdfPreviewBody.style.display = 'flex';
        pdfPreviewActions.style.display = 'flex';

        // Render first page
        await renderPreviewPage(1);

        // Build thumbnail strip
        pdfPreviewThumbs.innerHTML = '';
        for (let p = 1; p <= previewPdfDoc.numPages; p++) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pdf-preview-thumb';
            btn.dataset.page = p;
            btn.title = `Page ${p}`;
            btn.addEventListener('click', () => {
                renderPreviewPage(p);
                pdfPreviewThumbs.querySelectorAll('.pdf-preview-thumb').forEach(x => x.classList.remove('active'));
                btn.classList.add('active');
            });

            const num = document.createElement('span');
            num.className = 'pdf-preview-thumb-num';
            num.textContent = p;
            btn.appendChild(num);

            pdfPreviewThumbs.appendChild(btn);

            // Generate a small thumbnail image
            renderThumbnailForPage(p, btn);
        }

        // Mark first thumbnail active
        const firstThumb = pdfPreviewThumbs.querySelector('.pdf-preview-thumb');
        if (firstThumb) firstThumb.classList.add('active');

    } catch (err) {
        console.error('Preview render failed', err);
        pdfPreviewProgress.style.display = 'none';
        pdfPreviewBody.style.display = 'flex';
        pdfPreviewActions.style.display = 'flex';
        toast('Preview failed to render, but download still works.', 'error', 5000);
    }
}

async function renderPreviewPage(pageNum) {
    if (!previewPdfDoc) return;
    previewCurrentPage = pageNum;
    const page = await previewPdfDoc.getPage(pageNum);
    const viewportBase = page.getViewport({ scale: 1 });

    // Fit to stage width (max 1000px)
    const stage = pdfPreviewCanvas.parentElement;
    const maxWidth = Math.min(stage.clientWidth - 48, 1000);
    const scale = maxWidth / viewportBase.width;
    const viewport = page.getViewport({ scale });

    const canvas = pdfPreviewCanvas;
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;
}

async function renderThumbnailForPage(pageNum, btn) {
    try {
        const page = await previewPdfDoc.getPage(pageNum);
        const viewportBase = page.getViewport({ scale: 1 });
        const scale = Math.min(THUMB_WIDTH / viewportBase.width, THUMB_HEIGHT / viewportBase.height);
        const viewport = page.getViewport({ scale });

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = viewport.width;
        tmpCanvas.height = viewport.height;
        const tmpCtx = tmpCanvas.getContext('2d');
        await page.render({ canvasContext: tmpCtx, viewport }).promise;

        const img = document.createElement('img');
        img.src = tmpCanvas.toDataURL('image/jpeg', 0.7);
        img.alt = `Page ${pageNum}`;
        btn.insertBefore(img, btn.firstChild);
    } catch (e) {
        // Silent fail — thumbnail just won't render
    }
}

// ==================== PREVIEW CLOSE / DOWNLOAD ====================
function closePdfPreview() {
    pdfPreviewOverlay.classList.remove('active');
    pdfPreviewProgress.style.display = 'flex';
    pdfPreviewBody.style.display = 'none';
    pdfPreviewActions.style.display = 'none';
    pdfPreviewThumbs.innerHTML = '';
    if (previewPdfDoc) { try { previewPdfDoc.destroy(); } catch (e) {} previewPdfDoc = null; }
    previewPdfBytes = null;
    previewFilename = '';
    previewCurrentPage = 1;
    const ctx = pdfPreviewCanvas.getContext('2d');
    ctx.clearRect(0, 0, pdfPreviewCanvas.width, pdfPreviewCanvas.height);
}

pdfPreviewClose.addEventListener('click', closePdfPreview);
pdfPreviewCancel.addEventListener('click', closePdfPreview);
pdfPreviewOverlay.addEventListener('click', (e) => {
    if (e.target === pdfPreviewOverlay) closePdfPreview();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pdfPreviewOverlay.classList.contains('active')) closePdfPreview();
});

pdfPreviewDownload.addEventListener('click', () => {
    if (!previewPdfBytes) {
        toast('Nothing to download yet.', 'error');
        return;
    }
    const blob = new Blob([previewPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = previewFilename || '2pdfmode-document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('PDF downloaded!', 'success');
    closePdfPreview();
});

// ==================== HELPERS ====================
function dataUrlToUint8Array(dataUrl) {
    const base64 = dataUrl.split(',')[1];
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// ==================== IMAGE PROCESSOR ====================
function processImage(item, preset) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const rot = item.rotation || 0;
            const swap = rot === 90 || rot === 270;
            let srcW = swap ? img.height : img.width;
            let srcH = swap ? img.width  : img.height;
            let scale = 1;
            if (preset.maxDim !== Infinity) {
                const longest = Math.max(srcW, srcH);
                if (longest > preset.maxDim) scale = preset.maxDim / longest;
            }
            const outW = Math.max(1, Math.round(srcW * scale));
            const outH = Math.max(1, Math.round(srcH * scale));
            const canvas = document.createElement('canvas');
            canvas.width = outW; canvas.height = outH;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, outW, outH);
            ctx.save();
            ctx.translate(outW / 2, outH / 2);
            ctx.rotate((rot * Math.PI) / 180);
            const drawW = swap ? outH : outW;
            const drawH = swap ? outW : outH;
            ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
            let dataUrl;
            if (preset.format === 'png') dataUrl = canvas.toDataURL('image/png');
            else dataUrl = canvas.toDataURL('image/jpeg', preset.jpegQ);
            resolve({ dataUrl, width: outW, height: outH, format: preset.format });
        };
        img.onerror = () => {
            resolve({ dataUrl: item.dataUrl, width: item.width || 800, height: item.height || 600, format: 'jpeg' });
        };
        img.src = item.dataUrl;
    });
}

// ==================== BOOT ====================
initTheme();
loadSettings();
renderPreviews();
pushHistory();