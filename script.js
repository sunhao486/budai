class PhotoCropApp {
    constructor() {
        // 初始化变量
        this.pendingImages = [];
        this.processedImages = [];
        this.currentProcessingIndex = 0;
        
        // 裁剪相关变量
        this.canvas = null;
        this.ctx = null;
        this.image = null;
        
        // 变换矩阵
        this.transform = {
            x: 0,
            y: 0,
            scale: 1,
            minScale: 1,
            maxScale: 5
        };
        
        // 触摸/鼠标交互状态
        this.isDragging = false;
        this.isPinching = false;
        this.lastTouchDistance = 0;
        this.lastTouchCenter = { x: 0, y: 0 };
        this.lastMousePos = { x: 0, y: 0 };
        
        // 双击相关
        this.lastTapTime = 0;
        this.doubleTapThreshold = 300;
        
        // 裁剪框尺寸
        this.cropRatios = [
            { width: 680, height: 300, type: 'cover' },
            { width: 680, height: 300, type: 'cover' },
            { width: 420, height: 300, type: 'content' }
        ];
        
        // 双击排序相关
        this.isSortingMode = false;
        this.firstSelectedImage = null;
        this.sortingTimeout = null;
        
        this.init();
    }
    
    init() {
        this.cacheElements();
        this.bindEvents();
        this.updateUI();
    }
    
    cacheElements() {
        this.elements = {
            uploadBtn: document.getElementById('upload-btn'),
            fileInput: document.getElementById('file-input'),
            pendingContainer: document.getElementById('pending-images'),
            processedContainer: document.getElementById('processed-images'),
            finalContainer: document.getElementById('final-images'),
            nextBtn: document.getElementById('next-btn'),
            prevBtn: document.getElementById('prev-btn'),
            processBtn: document.getElementById('process-btn'),
            restartBtn: document.getElementById('restart-btn'),
            uploadSection: document.getElementById('upload-section'),
            cropSection: document.getElementById('crop-section'),
            completeSection: document.getElementById('complete-section'),
            uploadedCount: document.getElementById('uploaded-count'),
            progress: document.getElementById('progress'),
            currentProcessText: document.getElementById('current-process-text'),
            currentRatio: document.getElementById('current-ratio'),
            remainingCount: document.getElementById('remaining-count'),
            canvas: document.getElementById('crop-canvas'),
            cropBox: document.getElementById('crop-box'),
            loadingOverlay: document.getElementById('loading-overlay'),
            // 新增元素
            userInput: document.getElementById('user-input'),
            saveZipBtn: document.getElementById('save-zip-btn')
        };
        
        this.canvas = this.elements.canvas;
        this.ctx = this.canvas.getContext('2d');
    }
    
    bindEvents() {
        // 上传相关
        this.elements.uploadBtn.addEventListener('click', () => {
            this.elements.fileInput.click();
        });
        
        this.elements.fileInput.addEventListener('change', (e) => {
            this.handleFileSelect(e.target.files);
            e.target.value = '';
        });
        
        // 按钮事件
        this.elements.nextBtn.addEventListener('click', () => {
            if (this.pendingImages.length < 25) {
                alert('请先上传25张图片');
                return;
            }
            this.switchToCropSection();
        });
        
        this.elements.prevBtn.addEventListener('click', () => {
            this.goToPreviousImage();
        });
        
        this.elements.processBtn.addEventListener('click', () => {
            this.cropCurrentImage();
        });
        
        // 保存ZIP按钮
        this.elements.saveZipBtn.addEventListener('click', () => {
            this.handleSaveZip();
        });
        
        this.elements.restartBtn.addEventListener('click', () => {
            this.restartApp();
        });
        
        // 鼠标事件
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        this.canvas.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        
        // 触摸事件
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
        
        // 防止浏览器默认行为
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // 全局点击事件，用于退出排序模式
        document.addEventListener('click', (e) => {
            if (this.isSortingMode && !e.target.closest('.image-thumbnail')) {
                this.exitSortingMode();
            }
        });
        
        // 窗口大小改变时重新绘制
        window.addEventListener('resize', () => {
            if (this.image) {
                this.setupCanvas();
                this.drawImage();
            }
        });
    }
    
    // 处理文件选择
    handleFileSelect(files) {
        const filesArray = Array.from(files);
        const remainingSlots = 25 - this.pendingImages.length;
        
        if (filesArray.length > remainingSlots) {
            alert(`最多只能上传25张图片，已自动选取前${remainingSlots}张`);
            filesArray.splice(remainingSlots);
        }
        
        filesArray.forEach(file => {
            if (!file.type.startsWith('image/')) {
                alert(`文件 ${file.name} 不是图片，已跳过`);
                return;
            }
            
            if (this.pendingImages.length >= 25) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageData = {
                    id: Date.now() + Math.random(),
                    src: e.target.result,
                    file: file,
                    name: file.name,
                    originalIndex: this.pendingImages.length
                };
                
                this.pendingImages.push(imageData);
                this.updateUI();
            };
            reader.readAsDataURL(file);
        });
    }
    
    // 更新UI
    updateUI() {
        // 更新计数
        this.elements.uploadedCount.textContent = this.pendingImages.length;
        this.elements.progress.textContent = `${this.processedImages.length}/25`;
        
        // 更新待处理区
        this.elements.pendingContainer.innerHTML = '';
        if (this.pendingImages.length === 0) {
            this.elements.pendingContainer.innerHTML = '<p class="empty-hint">暂无图片，请先上传</p>';
        } else {
            this.pendingImages.forEach((image, index) => {
                const thumbnail = this.createThumbnail(image, index);
                this.elements.pendingContainer.appendChild(thumbnail);
            });
        }
        
        // 更新已处理区
        this.elements.processedContainer.innerHTML = '';
        if (this.processedImages.length === 0) {
            this.elements.processedContainer.innerHTML = '<p class="empty-hint">暂无已处理的图片</p>';
        } else {
            this.processedImages.forEach(image => {
                const thumbnail = this.createProcessedThumbnail(image);
                this.elements.processedContainer.appendChild(thumbnail);
            });
        }
        
        // 更新最终结果区
        this.elements.finalContainer.innerHTML = '';
        this.processedImages.forEach(image => {
            const thumbnail = this.createProcessedThumbnail(image);
            this.elements.finalContainer.appendChild(thumbnail);
        });
        
        // 更新按钮状态
        this.elements.nextBtn.disabled = this.pendingImages.length < 25;
        this.elements.nextBtn.textContent = 
            this.pendingImages.length < 25 
                ? `开始裁剪（还需要上传${25 - this.pendingImages.length}张）`
                : '开始裁剪';
        
        // 更新当前处理文本
        this.updateCurrentProcessText();
        
        // 更新裁剪界面信息
        const remainingContentImages = Math.max(0, (this.pendingImages.length + this.processedImages.length) - Math.min(2, this.currentProcessingIndex + 1));
        if (this.currentProcessingIndex < 2) {
            this.elements.currentRatio.textContent = '当前比例：680×300 (封面/封底)';
            this.elements.remainingCount.textContent = `剩余：${remainingContentImages}张使用420×300 (内容图)`;
        } else {
            this.elements.currentRatio.textContent = '当前比例：420×300 (内容图)';
            this.elements.remainingCount.textContent = `剩余：${(this.pendingImages.length + this.processedImages.length) - (this.currentProcessingIndex + 1)}张`;
        }
    }
    
    updateCurrentProcessText() {
        if (this.currentProcessingIndex === 0) {
            this.elements.currentProcessText.textContent = '当前处理：封面';
        } else if (this.currentProcessingIndex === 1) {
            this.elements.currentProcessText.textContent = '当前处理：封底';
        } else {
            this.elements.currentProcessText.textContent = `当前处理：内容图 ${this.currentProcessingIndex - 1}/23`;
        }
    }
    
    // 创建缩略图（带双击排序）
    createThumbnail(image, index) {
        const container = document.createElement('div');
        container.className = 'image-thumbnail';
        container.dataset.id = image.id;
        container.dataset.index = index;
        
        const img = document.createElement('img');
        img.src = image.src;
        img.alt = `待处理图片 ${index + 1}`;
        
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isSortingMode) this.exitSortingMode();
            this.deleteImage(image.id);
        });
        
        // 双击排序逻辑
        let lastClickTime = 0;
        container.addEventListener('click', (e) => {
            const currentTime = new Date().getTime();
            const timeDiff = currentTime - lastClickTime;
            
            if (timeDiff < 300 && timeDiff > 0) {
                // 双击
                this.handleDoubleClickForSorting(index);
                e.preventDefault();
            } else {
                // 单击
                this.handleSingleClickForSorting(index);
            }
            
            lastClickTime = currentTime;
        });
        
        container.appendChild(img);
        container.appendChild(deleteBtn);
        
        return container;
    }
    
    handleSingleClickForSorting(index) {
        if (!this.isSortingMode) return;
        
        if (this.firstSelectedImage === null) {
            // 第一次点击，选择第一张图片
            this.firstSelectedImage = index;
            document.querySelectorAll('.image-thumbnail')[index].classList.add('double-tap-mode');
        } else if (this.firstSelectedImage === index) {
            // 点击同一张图片，取消选择
            this.firstSelectedImage = null;
            document.querySelectorAll('.image-thumbnail')[index].classList.remove('double-tap-mode');
        } else {
            // 点击另一张图片，交换位置
            const secondSelectedImage = index;
            [this.pendingImages[this.firstSelectedImage], this.pendingImages[secondSelectedImage]] = 
            [this.pendingImages[secondSelectedImage], this.pendingImages[this.firstSelectedImage]];
            this.updateUI();
            this.exitSortingMode();
        }
    }
    
    handleDoubleClickForSorting(index) {
        if (this.isSortingMode) {
            this.exitSortingMode();
        } else {
            this.enterSortingMode(index);
        }
    }
    
    enterSortingMode(index) {
        this.isSortingMode = true;
        this.firstSelectedImage = index;
        
        document.querySelectorAll('.image-thumbnail')[index].classList.add('double-tap-mode');
        
        this.elements.nextBtn.textContent = '排序模式 - 双击图片进入排序，点击另一张图片交换位置，再次双击退出';
        this.elements.nextBtn.style.backgroundColor = '#ff9800';
        
        if (this.sortingTimeout) clearTimeout(this.sortingTimeout);
        this.sortingTimeout = setTimeout(() => {
            this.exitSortingMode();
        }, 10000);
    }
    
    exitSortingMode() {
        this.isSortingMode = false;
        this.firstSelectedImage = null;
        
        document.querySelectorAll('.image-thumbnail').forEach(thumb => {
            thumb.classList.remove('double-tap-mode');
        });
        
        this.elements.nextBtn.textContent = this.pendingImages.length < 25 
            ? `开始裁剪（还需要上传${25 - this.pendingImages.length}张）`
            : '开始裁剪';
        this.elements.nextBtn.style.backgroundColor = '';
        
        if (this.sortingTimeout) {
            clearTimeout(this.sortingTimeout);
            this.sortingTimeout = null;
        }
    }
    
    createProcessedThumbnail(image) {
        const container = document.createElement('div');
        container.className = 'image-thumbnail';
        
        const img = document.createElement('img');
        img.src = image.croppedSrc || image.src;
        img.alt = `已处理图片 ${image.originalIndex + 1}`;
        
        container.appendChild(img);
        return container;
    }
    
    deleteImage(imageId) {
        const index = this.pendingImages.findIndex(img => img.id === imageId);
        if (index !== -1) {
            this.pendingImages.splice(index, 1);
            this.updateUI();
        }
    }
    
    switchToCropSection() {
        if (this.pendingImages.length < 25) {
            alert('请先上传25张图片');
            return;
        }
        
        this.elements.uploadSection.classList.remove('active');
        this.elements.cropSection.classList.add('active');
        this.elements.completeSection.classList.remove('active');
        
        this.currentProcessingIndex = 0;
        this.loadImageForCrop();
    }
    
    goToPreviousImage() {
        if (this.currentProcessingIndex > 0) {
            // 从已处理列表中移除上一张图片
            const prevProcessedIndex = this.processedImages.findIndex(img => 
                img.originalIndex === this.currentProcessingIndex - 1
            );
            
            if (prevProcessedIndex !== -1) {
                const prevImage = this.processedImages.splice(prevProcessedIndex, 1)[0];
                
                // 将图片放回待处理列表的当前位置
                this.pendingImages.splice(this.currentProcessingIndex - 1, 0, {
                    ...prevImage,
                    croppedSrc: undefined,
                    type: undefined
                });
                
                this.currentProcessingIndex--;
                this.loadImageForCrop();
                this.updateUI();
            } else if (this.currentProcessingIndex > 0) {
                this.currentProcessingIndex--;
                this.loadImageForCrop();
            }
        }
    }
    
    loadImageForCrop() {
        // 如果所有图片都处理完了
        if (this.currentProcessingIndex >= 25) {
            this.showCompleteSection();
            return;
        }
        
        // 如果当前索引超出了待处理列表范围，说明已经处理完了所有图片
        if (this.currentProcessingIndex >= this.pendingImages.length + this.processedImages.length) {
            this.showCompleteSection();
            return;
        }
        
        // 如果当前要处理的图片已经在已处理列表中（比如重新裁剪的情况），直接显示它
        const existingProcessedImage = this.processedImages.find(img => 
            img.originalIndex === this.currentProcessingIndex
        );
        
        if (existingProcessedImage) {
            this.image = new Image();
            this.image.onload = () => {
                this.calculateInitialTransform();
                this.setupCanvas();
                this.drawImage();
            };
            this.image.src = existingProcessedImage.src;
        } else {
            // 从待处理列表中获取图片
            const currentImage = this.pendingImages.find(img => 
                img.originalIndex === this.currentProcessingIndex
            );
            
            if (!currentImage) {
                // 如果没有找到，可能是索引错误，尝试使用下一个
                this.currentProcessingIndex++;
                if (this.currentProcessingIndex < 25) {
                    this.loadImageForCrop();
                } else {
                    this.showCompleteSection();
                }
                return;
            }
            
            this.image = new Image();
            this.image.onload = () => {
                this.calculateInitialTransform();
                this.setupCanvas();
                this.drawImage();
            };
            this.image.onerror = () => {
                console.error('图片加载失败:', currentImage.name);
                alert(`图片 ${currentImage.name} 加载失败，已跳过`);
                // 移除加载失败的图片
                const index = this.pendingImages.findIndex(img => img.id === currentImage.id);
                if (index !== -1) {
                    this.pendingImages.splice(index, 1);
                }
                // 继续处理下一张
                this.currentProcessingIndex++;
                this.loadImageForCrop();
                this.updateUI();
            };
            
            this.image.src = currentImage.src;
        }
        
        // 设置裁剪框
        const cropRatio = this.currentProcessingIndex < 2 ? this.cropRatios[0] : this.cropRatios[2];
        this.updateCropBox(cropRatio);
    }
    
    calculateInitialTransform() {
        if (!this.image) return;
        
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // 计算裁剪框在画布中的位置
        const currentRatio = this.currentProcessingIndex < 2 ? this.cropRatios[0] : this.cropRatios[2];
        const cropBoxWidth = containerWidth * (currentRatio.width === 680 ? 0.85 : 0.70);
        const cropBoxHeight = 150;
        const cropBoxLeft = (containerWidth - cropBoxWidth) / 2;
        const cropBoxTop = (containerHeight - cropBoxHeight) / 2;
        
        // 计算初始缩放比例
        const scaleX = cropBoxWidth / this.image.width;
        const scaleY = cropBoxHeight / this.image.height;
        
        // 取较大的缩放比例，确保裁剪框被图片完全覆盖
        this.transform.scale = Math.max(scaleX, scaleY);
        this.transform.minScale = this.transform.scale;
        
        // 计算初始位置，使图片居中
        const scaledWidth = this.image.width * this.transform.scale;
        const scaledHeight = this.image.height * this.transform.scale;
        
        this.transform.x = cropBoxLeft + (cropBoxWidth - scaledWidth) / 2;
        this.transform.y = cropBoxTop + (cropBoxHeight - scaledHeight) / 2;
        
        // 保存裁剪框信息
        this.cropBoxInfo = {
            left: cropBoxLeft,
            top: cropBoxTop,
            width: cropBoxWidth,
            height: cropBoxHeight,
            cropWidth: currentRatio.width,
            cropHeight: currentRatio.height
        };
    }
    
    updateCropBox(ratio) {
        const box = this.elements.cropBox;
        box.className = 'crop-box';
        box.classList.add(`ratio-${ratio.width}x${ratio.height}`);
        
        const ratioText = ratio.width === 680 ? '680×300 (封面/封底)' : '420×300 (内容图)';
        this.elements.currentRatio.textContent = `当前比例：${ratioText}`;
    }
    
    setupCanvas() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        this.canvas.width = containerWidth;
        this.canvas.height = containerHeight;
    }
    
    drawImage() {
        if (!this.image) return;
        
        const containerWidth = this.canvas.width;
        const containerHeight = this.canvas.height;
        
        // 清空画布
        this.ctx.clearRect(0, 0, containerWidth, containerHeight);
        
        // 绘制背景
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, containerWidth, containerHeight);
        
        // 保存状态
        this.ctx.save();
        
        // 应用变换
        this.ctx.translate(this.transform.x, this.transform.y);
        this.ctx.scale(this.transform.scale, this.transform.scale);
        
        // 绘制图片
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';
        this.ctx.drawImage(this.image, 0, 0);
        
        // 恢复状态
        this.ctx.restore();
    }
    
    // 鼠标事件处理
    handleMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        this.canvas.style.cursor = 'grabbing';
    }
    
    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        
        const deltaX = e.clientX - this.lastMousePos.x;
        const deltaY = e.clientY - this.lastMousePos.y;
        
        this.lastMousePos = { x: e.clientX, y: e.clientY };
        
        this.transform.x += deltaX;
        this.transform.y += deltaY;
        
        this.constrainPosition();
        this.drawImage();
    }
    
    handleMouseUp() {
        this.isDragging = false;
        this.canvas.style.cursor = 'move';
    }
    
    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const oldScale = this.transform.scale;
        
        this.transform.scale *= scaleFactor;
        this.transform.scale = Math.max(this.transform.minScale, 
            Math.min(this.transform.maxScale, this.transform.scale));
        
        // 以鼠标位置为中心缩放
        const scaleRatio = this.transform.scale / oldScale;
        this.transform.x = mouseX - (mouseX - this.transform.x) * scaleRatio;
        this.transform.y = mouseY - (mouseY - this.transform.y) * scaleRatio;
        
        this.constrainPosition();
        this.drawImage();
    }
    
    handleDoubleClick(e) {
        e.preventDefault();
        
        // 双击重置位置和缩放
        this.calculateInitialTransform();
        this.drawImage();
    }
    
    // 触摸事件处理
    handleTouchStart(e) {
        e.preventDefault();
        
        if (e.touches.length === 1) {
            // 单指触摸
            const touch = e.touches[0];
            this.isDragging = true;
            this.lastMousePos = { 
                x: touch.clientX, 
                y: touch.clientY 
            };
        } else if (e.touches.length === 2) {
            // 双指触摸
            this.isPinching = true;
            this.isDragging = false;
            
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            this.lastTouchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            this.lastTouchCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
        }
        
        // 处理双击
        const currentTime = new Date().getTime();
        if (currentTime - this.lastTapTime < this.doubleTapThreshold) {
            // 双击重置
            this.calculateInitialTransform();
            this.drawImage();
        }
        this.lastTapTime = currentTime;
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        if (this.isPinching && e.touches.length === 2) {
            // 双指缩放
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            const currentCenter = {
                x: (touch1.clientX + touch2.clientX) / 2,
                y: (touch1.clientY + touch2.clientY) / 2
            };
            
            if (this.lastTouchDistance > 0) {
                const scaleFactor = currentDistance / this.lastTouchDistance;
                const oldScale = this.transform.scale;
                
                this.transform.scale *= scaleFactor;
                this.transform.scale = Math.max(this.transform.minScale, 
                    Math.min(this.transform.maxScale, this.transform.scale));
                
                // 以双指中心点为中心缩放
                const scaleRatio = this.transform.scale / oldScale;
                
                // 计算双指中心在画布中的坐标
                const rect = this.canvas.getBoundingClientRect();
                const centerX = currentCenter.x - rect.left;
                const centerY = currentCenter.y - rect.top;
                
                this.transform.x = centerX - (centerX - this.transform.x) * scaleRatio;
                this.transform.y = centerY - (centerY - this.transform.y) * scaleRatio;
                
                this.lastTouchCenter = currentCenter;
            }
            
            this.lastTouchDistance = currentDistance;
            
        } else if (this.isDragging && e.touches.length === 1) {
            // 单指拖动
            const touch = e.touches[0];
            const deltaX = touch.clientX - this.lastMousePos.x;
            const deltaY = touch.clientY - this.lastMousePos.y;
            
            this.lastMousePos = { x: touch.clientX, y: touch.clientY };
            
            this.transform.x += deltaX;
            this.transform.y += deltaY;
        }
        
        this.constrainPosition();
        this.drawImage();
    }
    
    handleTouchEnd(e) {
        this.isDragging = false;
        this.isPinching = false;
        this.lastTouchDistance = 0;
    }
    
    constrainPosition() {
        if (!this.image || !this.cropBoxInfo) return;
        
        const scaledWidth = this.image.width * this.transform.scale;
        const scaledHeight = this.image.height * this.transform.scale;
        
        // 计算图片在画布中的边界
        const imageLeft = this.transform.x;
        const imageRight = this.transform.x + scaledWidth;
        const imageTop = this.transform.y;
        const imageBottom = this.transform.y + scaledHeight;
        
        // 裁剪框边界
        const cropLeft = this.cropBoxInfo.left;
        const cropRight = this.cropBoxInfo.left + this.cropBoxInfo.width;
        const cropTop = this.cropBoxInfo.top;
        const cropBottom = this.cropBoxInfo.top + this.cropBoxInfo.height;
        
        // 限制位置，确保裁剪框内始终有图片
        if (scaledWidth <= this.cropBoxInfo.width) {
            // 图片宽度小于等于裁剪框宽度，水平居中
            this.transform.x = cropLeft + (this.cropBoxInfo.width - scaledWidth) / 2;
        } else {
            // 图片宽度大于裁剪框宽度，限制左右移动
            if (imageLeft > cropLeft) {
                this.transform.x = cropLeft;
            } else if (imageRight < cropRight) {
                this.transform.x = cropRight - scaledWidth;
            }
        }
        
        if (scaledHeight <= this.cropBoxInfo.height) {
            // 图片高度小于等于裁剪框高度，垂直居中
            this.transform.y = cropTop + (this.cropBoxInfo.height - scaledHeight) / 2;
        } else {
            // 图片高度大于裁剪框高度，限制上下移动
            if (imageTop > cropTop) {
                this.transform.y = cropTop;
            } else if (imageBottom < cropBottom) {
                this.transform.y = cropBottom - scaledHeight;
            }
        }
    }
    
    cropCurrentImage() {
        this.showLoading(true);
        
        // 使用setTimeout让UI有机会更新加载状态
        setTimeout(() => {
            try {
                if (!this.image || !this.cropBoxInfo) {
                    throw new Error('图片或裁剪框信息缺失');
                }
                
                const currentRatio = this.currentProcessingIndex < 2 ? this.cropRatios[0] : this.cropRatios[2];
                const cropBoxWidth = currentRatio.width;
                const cropBoxHeight = currentRatio.height;
                
                // 创建临时canvas进行裁剪 - 使用高质量设置
                const tempCanvas = document.createElement('canvas');
                
                // 使用更高的分辨率来保持画质（提高DPI）
                const dpiMultiplier = 2; // 2倍分辨率
                tempCanvas.width = cropBoxWidth * dpiMultiplier;
                tempCanvas.height = cropBoxHeight * dpiMultiplier;
                
                const tempCtx = tempCanvas.getContext('2d');
                
                // 设置高质量渲染
                tempCtx.imageSmoothingEnabled = true;
                tempCtx.imageSmoothingQuality = 'high';
                
                // 缩放上下文以匹配DPI
                tempCtx.scale(dpiMultiplier, dpiMultiplier);
                
                // 计算裁剪区域在原始图片中的坐标和尺寸
                // 这里是关键修复：正确的坐标计算
                const cropX = (this.cropBoxInfo.left - this.transform.x) / this.transform.scale;
                const cropY = (this.cropBoxInfo.top - this.transform.y) / this.transform.scale;
                const cropWidth = this.cropBoxInfo.width / this.transform.scale;
                const cropHeight = this.cropBoxInfo.height / this.transform.scale;
                
                // 确保裁剪区域在图片范围内（添加边界检查）
                const safeCropX = Math.max(0, cropX);
                const safeCropY = Math.max(0, cropY);
                const safeCropWidth = Math.min(cropWidth, this.image.width - safeCropX);
                const safeCropHeight = Math.min(cropHeight, this.image.height - safeCropY);
                
                // 如果裁剪区域无效，使用默认值
                if (safeCropWidth <= 0 || safeCropHeight <= 0) {
                    console.warn('裁剪区域无效，使用居中裁剪');
                    // 使用居中裁剪作为后备方案
                    const centerCropX = Math.max(0, (this.image.width - cropWidth) / 2);
                    const centerCropY = Math.max(0, (this.image.height - cropHeight) / 2);
                    const centerCropWidth = Math.min(cropWidth, this.image.width - centerCropX);
                    const centerCropHeight = Math.min(cropHeight, this.image.height - centerCropY);
                    
                    // 裁剪并缩放图片
                    tempCtx.drawImage(
                        this.image,
                        centerCropX, centerCropY, centerCropWidth, centerCropHeight,
                        0, 0, cropBoxWidth, cropBoxHeight
                    );
                } else {
                    // 正常裁剪
                    tempCtx.drawImage(
                        this.image,
                        safeCropX, safeCropY, safeCropWidth, safeCropHeight,
                        0, 0, cropBoxWidth, cropBoxHeight
                    );
                }
                
                // 获取裁剪后的图片数据 - 使用PNG格式保持最高质量
                const croppedDataURL = tempCanvas.toDataURL('image/png');
                
                // 查找当前图片在待处理列表中的位置
                const currentImageIndex = this.pendingImages.findIndex(img => 
                    img.originalIndex === this.currentProcessingIndex
                );
                
                if (currentImageIndex === -1) {
                    throw new Error('找不到当前处理的图片');
                }
                
                const currentImage = this.pendingImages[currentImageIndex];
                
                // 保存处理后的图片
                const processedImage = {
                    ...currentImage,
                    croppedSrc: croppedDataURL,
                    originalIndex: this.currentProcessingIndex,
                    croppedWidth: cropBoxWidth * dpiMultiplier,
                    croppedHeight: cropBoxHeight * dpiMultiplier,
                    type: currentRatio.type
                };
                
                // 从待处理列表中移除当前图片
                this.pendingImages.splice(currentImageIndex, 1);
                
                // 添加到已处理列表
                this.processedImages.push(processedImage);
                
                // 更新索引，处理下一张
                this.currentProcessingIndex++;
                
                // 更新UI
                this.updateUI();
                
                // 如果还有图片，处理下一张
                if (this.currentProcessingIndex < 25) {
                    this.loadImageForCrop();
                } else {
                    this.showCompleteSection();
                }
                
            } catch (error) {
                console.error('裁剪图片时出错:', error);
                alert('处理图片时出错，请重试');
            } finally {
                this.showLoading(false);
            }
        }, 100);
    }
    
    showCompleteSection() {
        this.elements.uploadSection.classList.remove('active');
        this.elements.cropSection.classList.remove('active');
        this.elements.completeSection.classList.add('active');
    }
    
    /**
     * 生成ZIP Blob
     */
    async generateZipBlob() {
        const zip = new JSZip();
        // 按照原始顺序排序
        const sortedImages = this.processedImages.sort((a, b) => a.originalIndex - b.originalIndex);
        
        for (let i = 0; i < sortedImages.length; i++) {
            const image = sortedImages[i];
            const croppedSrc = image.croppedSrc;
            
            // 分离Base64数据
            const base64Data = croppedSrc.split(',')[1];
            const binaryData = atob(base64Data);
            const arrayBuffer = new ArrayBuffer(binaryData.length);
            const uintArray = new Uint8Array(arrayBuffer);
            
            for (let j = 0; j < binaryData.length; j++) {
                uintArray[j] = binaryData.charCodeAt(j);
            }
            
            const blob = new Blob([uintArray], { type: 'image/png' });
            
            // 根据图片类型命名
            let fileName;
            if (image.type === 'cover') {
                fileName = i === 0 ? '封面.png' : '封底.png';
            } else {
                fileName = `内容图_${i - 1}.png`;
            }
            
            zip.file(fileName, blob);
        }
        
        return await zip.generateAsync({ type: 'blob' });
    }

    /**
     * 处理保存ZIP按钮点击
     */
    async handleSaveZip() {
        const userName = this.elements.userInput.value.trim();
        if (!userName) {
            alert('请输入收款人姓名和发货日期');
            return;
        }
        // 过滤文件名非法字符
        const safeName = userName.replace(/[\\/:*?"<>|]/g, '_');
        if (safeName !== userName) {
            alert('输入包含非法字符，已自动替换为下划线');
        }
        
        this.showLoading(true);
        try {
            const zipBlob = await this.generateZipBlob();
            
            // 创建下载链接，保存到本地下载文件夹
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            alert('ZIP文件已保存到您的下载文件夹。请确保影刀RPA正在运行，它将自动发送此文件到您的微信。');
            
        } catch (error) {
            console.error('生成ZIP失败:', error);
            alert('生成ZIP失败，请重试');
        } finally {
            this.showLoading(false);
        }
    }
    
    restartApp() {
        this.pendingImages = [];
        this.processedImages = [];
        this.currentProcessingIndex = 0;
        this.transform = {
            x: 0,
            y: 0,
            scale: 1,
            minScale: 1,
            maxScale: 5
        };
        this.exitSortingMode();
        
        this.elements.uploadSection.classList.add('active');
        this.elements.cropSection.classList.remove('active');
        this.elements.completeSection.classList.remove('active');
        
        this.updateUI();
        this.elements.fileInput.value = '';
    }
    
    showLoading(show) {
        this.elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new PhotoCropApp();
});