// إعداد PDF.js - استخدام worker من نفس الـ CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// المتغيرات العامة
let pdfDoc = null;
let pdfLibDoc = null;
let currentPage = 1;
let scale = 1.5;
let selectedElement = null;
let originalPdfBytes = null;
let modifications = [];
let signaturePad = null;

// عناصر الواجهة
const fileInput = document.getElementById('fileInput');
const imageInput = document.getElementById('imageInput');
const imageToPdfInput = document.getElementById('imageToPdfInput');
const pdfContainer = document.getElementById('pdfContainer');
const status = document.getElementById('status');
const pageInfo = document.getElementById('pageInfo');
const zoomLevel = document.getElementById('zoomLevel');

console.log('✅ تم تحميل الصفحة');
console.log('PDF.js version:', pdfjsLib.version);

// ========== فتح ملف PDF ==========
document.getElementById('openFile').addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log('📄 الملف:', file.name);
    console.log('📦 الحجم:', file.size, 'bytes');
    console.log('🏷️ النوع:', file.type);

    showLoading('جاري التحقق من الملف...');
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        console.log('📊 حجم البيانات:', uint8Array.length, 'bytes');
        
        // التحقق من ترويسة PDF
        const header = String.fromCharCode(
            uint8Array[0], uint8Array[1], uint8Array[2], uint8Array[3], uint8Array[4]
        );
        console.log('🔍 الترويسة:', header);
        
        if (header !== '%PDF-') {
            hideLoading();
            let errorMsg = '⚠️ هذا الملف ليس PDF صالح!\n\n';
            
            if (header.includes('PK')) {
                errorMsg += 'يبدو أنه ملف ZIP أو DOCX (Word)\n';
            } else if (header.includes('Rar')) {
                errorMsg += 'يبدو أنه ملف RAR\n';
            } else if (header.includes('PNG')) {
                errorMsg += 'يبدو أنه ملف PNG\n';
            } else if (header.includes('GIF')) {
                errorMsg += 'يبدو أنه ملف GIF\n';
            } else if (header.includes('JFIF')) {
                errorMsg += 'يبدو أنه ملف JPEG\n';
            } else {
                errorMsg += 'الترويسة: ' + header + '\n';
            }
            
            errorMsg += '\nالرجاء اختيار ملف PDF حقيقي.';
            alert(errorMsg);
            fileInput.value = '';
            return;
        }
        
        console.log('✅ الملف PDF صالح، جاري التحميل...');
        updateStatus('جاري تحميل PDF...');
        
        // تحميل PDF.js
        pdfDoc = await pdfjsLib.getDocument({
            data: uint8Array.slice(),
            useWorkerFetch: false,
            isEvalSupported: false,
            useSystemFonts: true,
        }).promise;
        
        console.log('✅ PDF.js - عدد الصفحات:', pdfDoc.numPages);
        
        // تحميل pdf-lib
        pdfLibDoc = await PDFLib.PDFDocument.load(uint8Array.slice(), {
            ignoreEncryption: true,
        });
        
        console.log('✅ pdf-lib تم التحميل');
        
        originalPdfBytes = uint8Array.slice();
        currentPage = 1;
        modifications = [];
        
        await renderPage(currentPage);
        updateStatus('تم تحميل الملف بنجاح ✓');
        updatePageInfo();
        hideLoading();
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        hideLoading();
        
        let errorMsg = '⚠️ فشل في فتح الملف\n\n';
        if (error.message.includes('password')) {
            errorMsg += 'الملف محمي بكلمة مرور!';
        } else if (error.message.includes('corrupt')) {
            errorMsg += 'الملف تالف!';
        } else {
            errorMsg += error.message;
        }
        
        alert(errorMsg);
        fileInput.value = '';
    }
});

// ========== عرض الصفحة ==========
async function renderPage(num) {
    if (!pdfDoc) {
        console.log('⚠️ pdfDoc غير محمل');
        return;
    }
    
    console.log('📄 عرض الصفحة:', num);
    
    try {
        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale });
        
        console.log('📏 الأبعاد:', viewport.width, 'x', viewport.height);
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.id = 'pdfCanvas';
        
        const existingElements = Array.from(pdfContainer.querySelectorAll('.editable-element'));
        
        pdfContainer.innerHTML = '';
        pdfContainer.appendChild(canvas);
        pdfContainer.style.width = viewport.width + 'px';
        pdfContainer.style.height = viewport.height + 'px';
        
        existingElements.forEach(el => {
            pdfContainer.appendChild(el);
        });
        
        console.log('🎨 جاري الرسم...');
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
        
        console.log('✅ تم الرسم');
        applyModifications(num);
    } catch (error) {
        console.error('❌ خطأ في العرض:', error);
        alert('خطأ في عرض الصفحة: ' + error.message);
    }
}

// ========== إضافة صورة ==========
document.getElementById('addImage').addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    console.log('🖼️ صورة:', file.name);

    const reader = new FileReader();
    reader.onload = function(event) {
        const img = document.createElement('div');
        img.className = 'editable-element';
        img.dataset.type = 'image';
        img.dataset.page = currentPage;
        img.dataset.src = event.target.result;
        
        const imgElement = document.createElement('img');
        imgElement.src = event.target.result;
        imgElement.style.width = '200px';
        imgElement.style.height = 'auto';
        
        img.innerHTML = `
            <div class="resize-handle tl"></div>
            <div class="resize-handle tr"></div>
            <div class="resize-handle bl"></div>
            <div class="resize-handle br"></div>
        `;
        img.insertBefore(imgElement, img.firstChild);
        
        img.style.left = '100px';
        img.style.top = '100px';
        
        pdfContainer.appendChild(img);
        makeDraggable(img);
        makeResizable(img, true);
        
        saveModification('add', 'image', {
            page: currentPage,
            src: event.target.result,
            left: 100,
            top: 100,
            width: 200,
            height: imgElement.offsetHeight
        });
        
        updateStatus('تم إضافة الصورة ✓');
    };
    reader.readAsDataURL(file);
});

// ========== إضافة نص ==========
document.getElementById('addText').addEventListener('click', () => {
    const textDiv = document.createElement('div');
    textDiv.className = 'editable-element text-element';
    textDiv.dataset.type = 'text';
    textDiv.dataset.page = currentPage;
    textDiv.contentEditable = true;
    textDiv.textContent = 'اكتب هنا...';
    textDiv.style.left = '100px';
    textDiv.style.top = '100px';
    
    const font = document.getElementById('fontSelect').value;
    const size = document.getElementById('fontSize').value;
    const color = document.getElementById('fontColor').value;
    const weight = document.getElementById('fontWeight').value;
    
    textDiv.style.fontFamily = `'${font}', sans-serif`;
    textDiv.style.fontSize = size + 'px';
    textDiv.style.color = color;
    textDiv.style.fontWeight = weight;
    
    pdfContainer.appendChild(textDiv);
    makeDraggable(textDiv);
    textDiv.focus();
    
    saveModification('add', 'text', {
        page: currentPage,
        text: 'اكتب هنا...',
        left: 100,
        top: 100,
        font: font,
        size: size,
        color: color,
        weight: weight
    });
    
    updateStatus('تم إضافة نص ✓');
});

// ========== السحب ==========
function makeDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    element.onmousedown = dragMouseDown;
    
    function dragMouseDown(e) {
        if (e.target.classList.contains('resize-handle')) return;
        if (element.contentEditable === 'true' && document.activeElement === element) return;
        
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        
        if (selectedElement) selectedElement.classList.remove('selected');
        selectedElement = element;
        element.classList.add('selected');
        
        if (element.classList.contains('text-element')) {
            updateFormatToolbar(element);
        }
    }
    
    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        
        const newTop = element.offsetTop - pos2;
        const newLeft = element.offsetLeft - pos1;
        
        element.style.top = newTop + "px";
        element.style.left = newLeft + "px";
        
        updateModificationPosition(element, newLeft, newTop);
    }
    
    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}

// ========== تغيير الحجم ==========
function makeResizable(element, maintainAspectRatio = false) {
    const handles = element.querySelectorAll('.resize-handle');
    
    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = element.offsetWidth;
            const startHeight = element.offsetHeight;
            const img = element.querySelector('img');
            const aspectRatio = startWidth / startHeight;
            
            function doResize(e) {
                let width = startWidth + (e.clientX - startX);
                let height = startHeight + (e.clientY - startY);
                
                if (maintainAspectRatio && img) {
                    height = width / aspectRatio;
                }
                
                if (width < 50) width = 50;
                if (height < 50) height = 50;
                
                if (img) {
                    img.style.width = width + 'px';
                    img.style.height = maintainAspectRatio ? 'auto' : height + 'px';
                }
                
                element.style.width = width + 'px';
                element.style.height = maintainAspectRatio ? 'auto' : height + 'px';
                
                updateModificationSize(element, width, height);
            }
            
            function stopResize() {
                document.removeEventListener('mousemove', doResize);
                document.removeEventListener('mouseup', stopResize);
            }
            
            document.addEventListener('mousemove', doResize);
            document.addEventListener('mouseup', stopResize);
        });
    });
}

// ========== تحليل OCR ==========
document.getElementById('ocrButton').addEventListener('click', async () => {
    if (!selectedElement || !selectedElement.querySelector('img')) {
        alert('الرجاء تحديد صورة أولاً');
        return;
    }
    
    showLoading('جاري تحليل الصورة...');
    
    const img = selectedElement.querySelector('img');
    
    try {
        const result = await Tesseract.recognize(img.src, 'ara+eng', {
            logger: m => console.log(m)
        });
        
        const text = result.data.text;
        
        const textDiv = document.createElement('div');
        textDiv.className = 'editable-element text-element';
        textDiv.dataset.type = 'text';
        textDiv.dataset.page = currentPage;
        textDiv.contentEditable = true;
        textDiv.textContent = text;
        
        const font = document.getElementById('fontSelect').value;
        const size = document.getElementById('fontSize').value;
        const color = document.getElementById('fontColor').value;
        
        textDiv.style.left = selectedElement.style.left;
        textDiv.style.top = (parseInt(selectedElement.style.top) + selectedElement.offsetHeight + 20) + 'px';
        textDiv.style.fontFamily = `'${font}', sans-serif`;
        textDiv.style.fontSize = size + 'px';
        textDiv.style.color = color;
        
        pdfContainer.appendChild(textDiv);
        makeDraggable(textDiv);
        
        saveModification('add', 'text', {
            page: currentPage,
            text: text,
            left: parseInt(selectedElement.style.left),
            top: parseInt(selectedElement.style.top) + selectedElement.offsetHeight + 20,
            font: font,
            size: size,
            color: color
        });
        
        hideLoading();
        updateStatus('تم التحليل ✓');
    } catch (error) {
        hideLoading();
        updateStatus('خطأ في التحليل');
        console.error(error);
    }
});

// ========== تحويل الصور إلى PDF ==========
document.getElementById('imageToPdf').addEventListener('click', () => {
    imageToPdfInput.click();
});

imageToPdfInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files.length) return;
    
    showLoading('جاري إنشاء PDF...');
    
    try {
        const { PDFDocument } = PDFLib;
        const newPdfDoc = await PDFDocument.create();
        
        for (const file of files) {
            const imgBytes = await file.arrayBuffer();
            let image;
            
            if (file.type === 'image/png') {
                image = await newPdfDoc.embedPng(imgBytes);
            } else {
                image = await newPdfDoc.embedJpg(imgBytes);
            }
            
            const page = newPdfDoc.addPage([image.width, image.height]);
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: image.width,
                height: image.height,
            });
        }
        
        const pdfBytes = await newPdfDoc.save();
        downloadPdf(pdfBytes, 'images-to-pdf.pdf');
        hideLoading();
        updateStatus('تم إنشاء PDF ✓');
    } catch (error) {
        hideLoading();
        alert('خطأ: ' + error.message);
        console.error(error);
    }
});

// ========== إضافة صفحة ==========
document.getElementById('addPage').addEventListener('click', async () => {
    if (!pdfLibDoc) {
        alert('الرجاء فتح ملف PDF أولاً');
        return;
    }
    
    showLoading('جاري إضافة الصفحة...');
    
    try {
        pdfLibDoc.addPage([595.28, 841.89]);
        
        const savedBytes = await pdfLibDoc.save();
        pdfDoc = await pdfjsLib.getDocument({
            data: savedBytes,
            useWorkerFetch: false,
            isEvalSupported: false,
        }).promise;
        
        currentPage = pdfDoc.numPages;
        await renderPage(currentPage);
        updatePageInfo();
        hideLoading();
        updateStatus('تم إضافة صفحة ✓');
    } catch (error) {
        hideLoading();
        alert('خطأ: ' + error.message);
        console.error(error);
    }
});

// ========== حذف صفحة ==========
document.getElementById('deletePage').addEventListener('click', async () => {
    if (!pdfLibDoc) {
        alert('الرجاء فتح ملف PDF أولاً');
        return;
    }
    
    if (pdfLibDoc.getPageCount() <= 1) {
        alert('لا يمكن حذف الصفحة الوحيدة');
        return;
    }
    
    if (!confirm(`حذف الصفحة ${currentPage}؟`)) return;
    
    showLoading('جاري الحذف...');
    
    try {
        pdfLibDoc.removePage(currentPage - 1);
        
        const savedBytes = await pdfLibDoc.save();
        pdfDoc = await pdfjsLib.getDocument({
            data: savedBytes,
            useWorkerFetch: false,
            isEvalSupported: false,
        }).promise;
        
        if (currentPage > pdfDoc.numPages) {
            currentPage = pdfDoc.numPages;
        }
        
        await renderPage(currentPage);
        updatePageInfo();
        hideLoading();
        updateStatus('تم الحذف ✓');
    } catch (error) {
        hideLoading();
        alert('خطأ: ' + error.message);
        console.error(error);
    }
});

// ========== تدوير الصفحة ==========
document.getElementById('rotatePage').addEventListener('click', async () => {
    if (!pdfLibDoc) {
        alert('الرجاء فتح ملف PDF أولاً');
        return;
    }
    
    showLoading('جاري التدوير...');
    
    try {
        const page = pdfLibDoc.getPage(currentPage - 1);
        const currentRotation = page.getRotation().angle;
        page.setRotation(PDFLib.degrees(currentRotation + 90));
        
        const savedBytes = await pdfLibDoc.save();
        pdfDoc = await pdfjsLib.getDocument({
            data: savedBytes,
            useWorkerFetch: false,
            isEvalSupported: false,
        }).promise;
        
        await renderPage(currentPage);
        hideLoading();
        updateStatus('تم التدوير ✓');
    } catch (error) {
        hideLoading();
        alert('خطأ: ' + error.message);
        console.error(error);
    }
});

// ========== تغيير الاتجاه ==========
document.getElementById('toggleOrientation').addEventListener('click', async () => {
    if (!pdfLibDoc) {
        alert('الرجاء فتح ملف PDF أولاً');
        return;
    }
    
    showLoading('جاري تغيير الاتجاه...');
    
    try {
        const page = pdfLibDoc.getPage(currentPage - 1);
        const { width, height } = page.getSize();
        
        page.setSize(height, width);
        
        const savedBytes = await pdfLibDoc.save();
        pdfDoc = await pdfjsLib.getDocument({
            data: savedBytes,
            useWorkerFetch: false,
            isEvalSupported: false,
        }).promise;
        
        await renderPage(currentPage);
        hideLoading();
        updateStatus('تم تغيير الاتجاه ✓');
    } catch (error) {
        hideLoading();
        alert('خطأ: ' + error.message);
        console.error(error);
    }
});

// ========== التوقيع ==========
document.getElementById('addSignature').addEventListener('click', () => {
    document.getElementById('signatureModal').classList.add('active');
    
    const canvas = document.getElementById('signatureCanvas');
    signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)'
    });
});

document.getElementById('clearSignature').addEventListener('click', () => {
    if (signaturePad) signaturePad.clear();
});

document.getElementById('saveSignature').addEventListener('click', () => {
    if (signaturePad && !signaturePad.isEmpty()) {
        const dataURL = signaturePad.toDataURL();
        addSignatureToPDF(dataURL);
        document.getElementById('signatureModal').classList.remove('active');
    } else {
        alert('ارسم التوقيع أولاً');
    }
});

document.getElementById('cancelSignature').addEventListener('click', () => {
    document.getElementById('signatureModal').classList.remove('active');
});

function addSignatureToPDF(dataURL) {
    const img = document.createElement('div');
    img.className = 'editable-element';
    img.dataset.type = 'image';
    img.dataset.page = currentPage;
    img.dataset.src = dataURL;
    
    const imgElement = document.createElement('img');
    imgElement.src = dataURL;
    imgElement.style.width = '200px';
    imgElement.style.height = 'auto';
    
    img.innerHTML = `
        <div class="resize-handle tl"></div>
        <div class="resize-handle tr"></div>
        <div class="resize-handle bl"></div>
        <div class="resize-handle br"></div>
    `;
    img.insertBefore(imgElement, img.firstChild);
    
    img.style.left = '100px';
    img.style.top = '100px';
    
    pdfContainer.appendChild(img);
    makeDraggable(img);
    makeResizable(img, true);
    
    saveModification('add', 'image', {
        page: currentPage,
        src: dataURL,
        left: 100,
        top: 100,
        width: 200,
        height: imgElement.offsetHeight
    });
    
    updateStatus('تم إضافة التوقيع ✓');
}

// ========== حفظ PDF ==========
document.getElementById('savePdf').addEventListener('click', async () => {
    if (!pdfLibDoc) {
        alert('الرجاء فتح ملف PDF أولاً');
        return;
    }
    
    showLoading('جاري الحفظ...');
    
    try {
        await applyAllModificationsToPdfLib();
        
        const pdfBytes = await pdfLibDoc.save();
        downloadPdf(pdfBytes, 'modified-document.pdf');
        hideLoading();
        updateStatus('تم الحفظ ✓');
    } catch (error) {
        hideLoading();
        alert('خطأ: ' + error.message);
        console.error(error);
    }
});

async function applyAllModificationsToPdfLib() {
    const pages = pdfLibDoc.getPages();
    
    for (const mod of modifications) {
        if (mod.action === 'add') {
            const page = pages[mod.data.page - 1];
            const { height } = page.getSize();
            
            if (mod.type === 'image') {
                const imgBytes = await fetch(mod.data.src).then(res => res.arrayBuffer());
                let image;
                
                if (mod.data.src.includes('data:image/png')) {
                    image = await pdfLibDoc.embedPng(imgBytes);
                } else {
                    image = await pdfLibDoc.embedJpg(imgBytes);
                }
                
                const y = height - mod.data.top - mod.data.height;
                
                page.drawImage(image, {
                    x: mod.data.left,
                    y: y,
                    width: mod.data.width,
                    height: mod.data.height,
                });
            } else if (mod.type === 'text') {
                const font = await pdfLibDoc.embedFont(PDFLib.StandardFonts.Helvetica);
                
                const y = height - mod.data.top - parseInt(mod.data.size);
                
                page.drawText(mod.data.text, {
                    x: mod.data.left,
                    y: y,
                    size: parseInt(mod.data.size),
                    font: font,
                    color: PDFLib.rgb(
                        parseInt(mod.data.color.slice(1, 3), 16) / 255,
                        parseInt(mod.data.color.slice(3, 5), 16) / 255,
                        parseInt(mod.data.color.slice(5, 7), 16) / 255
                    ),
                });
            }
        }
    }
}

// ========== التنقل ==========
document.getElementById('prevPage').addEventListener('click', async () => {
    if (currentPage > 1) {
        currentPage--;
        await renderPage(currentPage);
        updatePageInfo();
    }
});

document.getElementById('nextPage').addEventListener('click', async () => {
    if (pdfDoc && currentPage < pdfDoc.numPages) {
        currentPage++;
        await renderPage(currentPage);
        updatePageInfo();
    }
});

// ========== التكبير/التصغير ==========
document.getElementById('zoomIn').addEventListener('click', async () => {
    scale += 0.25;
    zoomLevel.textContent = Math.round(scale * 100 / 1.5) + '%';
    await renderPage(currentPage);
});

document.getElementById('zoomOut').addEventListener('click', async () => {
    if (scale > 0.5) {
        scale -= 0.25;
        zoomLevel.textContent = Math.round(scale * 100 / 1.5) + '%';
        await renderPage(currentPage);
    }
});

// ========== تغيير خصائص النص ==========
document.getElementById('fontSelect').addEventListener('change', (e) => {
    if (selectedElement && selectedElement.classList.contains('text-element')) {
        selectedElement.style.fontFamily = `'${e.target.value}', sans-serif`;
        updateModificationProperty(selectedElement, 'font', e.target.value);
    }
});

document.getElementById('fontSize').addEventListener('change', (e) => {
    if (selectedElement && selectedElement.classList.contains('text-element')) {
        selectedElement.style.fontSize = e.target.value + 'px';
        updateModificationProperty(selectedElement, 'size', e.target.value);
    }
});

document.getElementById('fontColor').addEventListener('change', (e) => {
    if (selectedElement && selectedElement.classList.contains('text-element')) {
        selectedElement.style.color = e.target.value;
        updateModificationProperty(selectedElement, 'color', e.target.value);
    }
});

document.getElementById('fontWeight').addEventListener('change', (e) => {
    if (selectedElement && selectedElement.classList.contains('text-element')) {
        selectedElement.style.fontWeight = e.target.value;
        updateModificationProperty(selectedElement, 'weight', e.target.value);
    }
});

function updateFormatToolbar(element) {
    const computedStyle = window.getComputedStyle(element);
    document.getElementById('fontSize').value = parseInt(computedStyle.fontSize);
    document.getElementById('fontColor').value = rgbToHex(computedStyle.color);
}

function rgbToHex(rgb) {
    const result = rgb.match(/\d+/g);
    if (!result) return '#000000';
    return '#' + result.slice(0, 3).map(x => {
        const hex = parseInt(x).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function saveModification(action, type, data) {
    modifications.push({ action, type, data });
}

function updateModificationPosition(element, left, top) {
    const mod = modifications.find(m => 
        m.data.page === parseInt(element.dataset.page) &&
        m.type === element.dataset.type
    );
    if (mod) {
        mod.data.left = left;
        mod.data.top = top;
    }
}

function updateModificationSize(element, width, height) {
    const mod = modifications.find(m => 
        m.data.page === parseInt(element.dataset.page) &&
        m.type === element.dataset.type
    );
    if (mod) {
        mod.data.width = width;
        mod.data.height = height;
    }
}

function updateModificationProperty(element, property, value) {
    const mod = modifications.find(m => 
        m.data.page === parseInt(element.dataset.page) &&
        m.type === element.dataset.type
    );
    if (mod) {
        mod.data[property] = value;
    }
}

function applyModifications(pageNum) {
    const pageMods = modifications.filter(m => m.data.page === pageNum);
    
    pageMods.forEach(mod => {
        if (mod.action === 'add' && mod.type === 'image') {
            const img = document.createElement('div');
            img.className = 'editable-element';
            img.dataset.type = 'image';
            img.dataset.page = mod.data.page;
            img.dataset.src = mod.data.src;
            
            const imgElement = document.createElement('img');
            imgElement.src = mod.data.src;
            imgElement.style.width = mod.data.width + 'px';
            imgElement.style.height = 'auto';
            
            img.innerHTML = `
                <div class="resize-handle tl"></div>
                <div class="resize-handle tr"></div>
                <div class="resize-handle bl"></div>
                <div class="resize-handle br"></div>
            `;
            img.insertBefore(imgElement, img.firstChild);
            
            img.style.left = mod.data.left + 'px';
            img.style.top = mod.data.top + 'px';
            
            pdfContainer.appendChild(img);
            makeDraggable(img);
            makeResizable(img, true);
        }
    });
}

function updatePageInfo() {
    if (pdfDoc) {
        pageInfo.textContent = `${currentPage} / ${pdfDoc.numPages}`;
    } else {
        pageInfo.textContent = '0 / 0';
    }
}

function downloadPdf(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function updateStatus(message) {
    status.textContent = message;
}

function showLoading(message) {
    hideLoading();
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.id = 'loadingIndicator';
    loading.textContent = message;
    document.body.appendChild(loading);
}

function hideLoading() {
    const loading = document.getElementById('loadingIndicator');
    if (loading) loading.remove();
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.editable-element') && !e.target.closest('.toolbar') && !e.target.closest('.format-toolbar')) {
        if (selectedElement) {
            selectedElement.classList.remove('selected');
            selectedElement = null;
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Delete' && selectedElement) {
        selectedElement.remove();
        selectedElement = null;
        updateStatus('تم الحذف');
    }
    
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        document.getElementById('savePdf').click();
    }
});