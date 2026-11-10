document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const statusPanel = document.getElementById('status-panel');
    const fileNameDisplay = document.getElementById('file-name');
    const cancelBtn = document.getElementById('cancel-btn');
    const processBtn = document.getElementById('process-btn');
    const processBtnText = document.getElementById('process-btn-text');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const downloadActions = document.getElementById('download-actions');
    const downloadBtn = document.getElementById('download-btn');
    const reSplitBtn = document.getElementById('re-split-btn');
    const newFileBtn = document.getElementById('new-file-btn');
    const optionCards = document.querySelectorAll('.split-option-card');

    let currentFile = null;
    let resultBlobUrl = null;
    let resultFileName = '';

    // --- ボタンのテキストを更新する関数 ---
    function updateButtonText(mode) {
        if (!processBtnText) return;
        if (mode === '4grid') {
            processBtnText.textContent = '4分割を実行する';
        } else if (mode === '2vertical') {
            processBtnText.textContent = '2分割 (左右) を実行する';
        }
    }

    // --- 実行準備状態に戻す関数 ---
    function resetToReadyState() {
        downloadActions.classList.add('hidden');
        progressContainer.classList.add('hidden');
        processBtn.classList.remove('hidden');
        processBtn.disabled = false;
        progressFill.style.width = '0%';
    }

    // --- 分割パターンのカード選択 ---
    optionCards.forEach(card => {
        card.addEventListener('click', () => {
            optionCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            const radio = card.querySelector('input[type="radio"]');
            if (radio) {
                radio.checked = true;
                updateButtonText(radio.value);
            }

            // カードをクリックした瞬間に再実行モードに
            resetToReadyState();
        });
    });

    // 「別のパターンで分割」ボタン
    if (reSplitBtn) {
        reSplitBtn.addEventListener('click', () => {
            resetToReadyState();
        });
    }

    // 「別のPDFを選択」ボタン
    if (newFileBtn) {
        newFileBtn.addEventListener('click', () => {
            resetAll();
        });
    }

    // --- Drag & Drop Handlers ---
    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        if (dt.files && dt.files.length > 0) {
            handleFile(dt.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // --- File Selection UI State ---
    function handleFile(file) {
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            alert('PDFファイルを選択してください。');
            return;
        }

        currentFile = file;
        fileNameDisplay.textContent = file.name;
        
        dropZone.classList.add('hidden');
        statusPanel.classList.remove('hidden');
        
        const selectedRadio = document.querySelector('input[name="split-mode"]:checked');
        updateButtonText(selectedRadio ? selectedRadio.value : '4grid');
        
        resetToReadyState();
        
        if (resultBlobUrl) {
            URL.revokeObjectURL(resultBlobUrl);
            resultBlobUrl = null;
        }
    }

    function resetAll() {
        currentFile = null;
        fileInput.value = '';
        statusPanel.classList.add('hidden');
        dropZone.classList.remove('hidden');
        if (resultBlobUrl) {
            URL.revokeObjectURL(resultBlobUrl);
            resultBlobUrl = null;
        }
    }

    cancelBtn.addEventListener('click', resetAll);

    // --- Process Button Click ---
    processBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        const selectedRadio = document.querySelector('input[name="split-mode"]:checked');
        const mode = selectedRadio ? selectedRadio.value : '4grid';

        processBtn.disabled = true;
        progressContainer.classList.remove('hidden');
        progressText.textContent = 'PDFを読み込んでいます...';
        progressFill.style.width = '25%';

        try {
            const arrayBuffer = await currentFile.arrayBuffer();
            
            progressText.textContent = '分割処理を実行中...';
            progressFill.style.width = '60%';
            
            // UIを更新するための短い待機
            await new Promise(resolve => setTimeout(resolve, 50));
            
            const processedBytes = await splitPdf(arrayBuffer, mode);
            
            progressText.textContent = '完了処理中...';
            progressFill.style.width = '90%';

            if (resultBlobUrl) {
                URL.revokeObjectURL(resultBlobUrl);
            }
            const blob = new Blob([processedBytes], { type: 'application/pdf' });
            resultBlobUrl = URL.createObjectURL(blob);
            
            // 出力ファイル名の作成
            const originalName = currentFile.name.replace(/\.pdf$/i, '');
            const suffix = mode === '4grid' ? '_4split' : '_2split_LR';

            resultFileName = `${originalName}${suffix}.pdf`;

            progressFill.style.width = '100%';
            setTimeout(() => {
                processBtn.classList.add('hidden');
                progressContainer.classList.add('hidden');
                downloadActions.classList.remove('hidden');
            }, 300);

        } catch (error) {
            console.error("PDF処理エラー:", error);
            const errMsg = error.message || String(error);
            alert('PDFの処理中にエラーが発生しました:\n' + errMsg);
            processBtn.disabled = false;
            progressContainer.classList.add('hidden');
        }
    });

    // --- Download Button Click ---
    downloadBtn.addEventListener('click', () => {
        if (!resultBlobUrl) return;
        const a = document.createElement('a');
        a.href = resultBlobUrl;
        a.download = resultFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    });

    // --- Split Logic (pdf-lib) ---
    async function splitPdf(fileBuffer, mode) {
        if (!window.PDFLib) {
            throw new Error("PDFライブラリ(pdf-lib)の読み込みに失敗しました。インターネット接続をご確認ください。");
        }

        const PDFDocument = window.PDFLib.PDFDocument;
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const originalPageCount = pdfDoc.getPageCount();

        for (let i = 0; i < originalPageCount; i++) {
            const page = pdfDoc.getPages()[i];
            const size = page.getSize();
            const width = size.width;
            const height = size.height;
            const halfWidth = width / 2;
            const halfHeight = height / 2;

            let regions = [];

            if (mode === '4grid') {
                // 4分割 (2x2 グリッド: 左上 → 右上 → 左下 → 右下)
                regions = [
                    { x: 0, y: halfHeight, w: halfWidth, h: halfHeight },         // 左上
                    { x: halfWidth, y: halfHeight, w: halfWidth, h: halfHeight }, // 右上
                    { x: 0, y: 0, w: halfWidth, h: halfHeight },                  // 左下
                    { x: halfWidth, y: 0, w: halfWidth, h: halfHeight }           // 右下
                ];
            } else {
                // 2分割 (左右: 左 → 右)
                regions = [
                    { x: 0, y: 0, w: halfWidth, h: height },                      // 左
                    { x: halfWidth, y: 0, w: halfWidth, h: height }               // 右
                ];
            }

            const embedded = await pdfDoc.embedPage(page);

            for (const r of regions) {
                const newPage = pdfDoc.addPage([r.w, r.h]);
                newPage.drawPage(embedded, {
                    x: -r.x,
                    y: -r.y,
                    width: width,
                    height: height,
                });
            }
        }

        // 元ページを削除
        for (let i = originalPageCount - 1; i >= 0; i--) {
            pdfDoc.removePage(i);
        }

        return await pdfDoc.save();
    }
});