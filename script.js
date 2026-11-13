/**
 * ПРОЕКТИРОВАНИЕ ИНФОРМАЦИОННЫХ СИСТЕМ
 * Презентационный движок, оптимизированный для сенсорных интерактивных досок (Smartboard)
 * Поддержка: мультитач, свайпы, лазерная указка/маркер, мгновенный отклик на касания
 */

const Presentation = (() => {
  // State
  let currentSlide = 1;
  const totalSlides = 26;
  let soundEnabled = true;
  let timerSeconds = 0;
  let timerInterval = null;
  let isFullscreen = false;
  let laserMode = false;
  let perfMode = localStorage.getItem('is_presentation_perf_mode') === 'true';

  // DOM Elements
  const slides = document.querySelectorAll('.slide');
  const counterCurrent = document.getElementById('counter-current');
  const topicTitle = document.getElementById('current-slide-topic');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const dockDotsContainer = document.getElementById('dock-dots-container');
  const timerBadge = document.getElementById('presentation-timer');
  const btnSound = document.getElementById('btn-sound');
  const btnFullscreen = document.getElementById('btn-fullscreen');
  const btnLaser = document.getElementById('btn-laser');
  const btnPerf = document.getElementById('btn-perf');

  // Smartboard Side Touch Buttons
  const sbNavPrev = document.getElementById('sb-nav-prev');
  const sbNavNext = document.getElementById('sb-nav-next');

  // Modals
  const modalOverview = document.getElementById('modal-overview');
  const modalVideo = document.getElementById('modal-video');
  const modalDeploy = document.getElementById('modal-deploy');
  const modalHelp = document.getElementById('modal-help');
  const thumbnailGrid = document.getElementById('thumbnail-grid');

  // Audio Context (Synthesized sounds)
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
  }

  function playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.05) {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio not permitted or unsupported
    }
  }

  function playSlideSound() {
    const baseFreq = 480 + (currentSlide * 10);
    playTone(baseFreq, 'sine', 0.05, 0.035);
    setTimeout(() => playTone(baseFreq + 160, 'sine', 0.07, 0.03), 35);
  }

  function playSuccessSound() {
    playTone(523.25, 'triangle', 0.1, 0.05); // C5
    setTimeout(() => playTone(659.25, 'triangle', 0.1, 0.05), 80); // E5
    setTimeout(() => playTone(783.99, 'triangle', 0.16, 0.05), 160); // G5
  }

  // Timer functionality
  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerSeconds++;
      const mins = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
      const secs = String(timerSeconds % 60).padStart(2, '0');
      if (timerBadge) timerBadge.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  // Populate Dock Dots (1 to 26) with large touch targets
  function initDockDots() {
    if (!dockDotsContainer) return;
    dockDotsContainer.innerHTML = '';
    for (let i = 1; i <= totalSlides; i++) {
      const dot = document.createElement('button');
      dot.className = `dock-dot ${i === 1 ? 'active' : ''}`;
      dot.setAttribute('data-target-slide', i);
      dot.setAttribute('title', `Слайд ${i}`);
      dot.textContent = i;
      
      // Fast touch trigger without delay
      dot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        goToSlide(i);
      });
      dockDotsContainer.appendChild(dot);
    }
  }

  // Populate Overview Thumbnail Grid
  function initThumbnailGrid() {
    if (!thumbnailGrid) return;
    thumbnailGrid.innerHTML = '';
    slides.forEach((slide) => {
      const num = parseInt(slide.getAttribute('data-slide'), 10);
      const topic = slide.getAttribute('data-topic') || `Слайд ${num}`;

      const card = document.createElement('div');
      card.className = `thumb-card ${num === currentSlide ? 'active' : ''}`;
      card.innerHTML = `
        <div class="thumb-num">СЛАЙД ${String(num).padStart(2, '0')}</div>
        <div class="thumb-title">${topic}</div>
      `;
      card.addEventListener('pointerdown', () => {
        goToSlide(num);
        toggleOverviewModal(false);
      });
      thumbnailGrid.appendChild(card);
    });
  }

  // Animated Numbers Counter for Active Slide
  function triggerNumberCounters(slideEl) {
    if (!slideEl) return;
    const counters = slideEl.querySelectorAll('.stat-val, .res-item strong');
    counters.forEach(counter => {
      const originalText = counter.getAttribute('data-original-val') || counter.textContent.trim();
      if (!counter.hasAttribute('data-original-val')) {
        counter.setAttribute('data-original-val', originalText);
      }

      const match = originalText.match(/^([<>]?\s*)?(\d+([.,]\d+)?)(.*)$/);
      if (match) {
        const prefix = match[1] || '';
        const targetNum = parseFloat(match[2].replace(',', '.'));
        const suffix = match[4] || '';

        if (!isNaN(targetNum) && targetNum > 0) {
          let current = 0;
          const duration = 600;
          const steps = 20;
          const increment = targetNum / steps;
          const stepTime = duration / steps;

          const timer = setInterval(() => {
            current += increment;
            if (current >= targetNum) {
              counter.textContent = originalText;
              clearInterval(timer);
            } else {
              const displayVal = Number.isInteger(targetNum) 
                ? Math.floor(current) 
                : current.toFixed(2);
              counter.textContent = `${prefix}${displayVal}${suffix}`;
            }
          }, stepTime);
        }
      }
    });
  }

  // Confetti Animation for Slide 26
  let confettiParticles = [];
  let confettiAnimFrame = null;

  function stopConfetti() {
    if (confettiAnimFrame) {
      cancelAnimationFrame(confettiAnimFrame);
      confettiAnimFrame = null;
    }
    const oldCanvas = document.getElementById('confetti-canvas');
    if (oldCanvas && oldCanvas.parentNode) {
      oldCanvas.parentNode.removeChild(oldCanvas);
    }
  }

  function launchConfetti() {
    stopConfetti();
    if (perfMode) return; // skip canvas confetti in perf mode

    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    confettiParticles = [];
    const colors = ['#00f2fe', '#4facfe', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'];
    const count = 45;

    for (let i = 0; i < count; i++) {
      confettiParticles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.7,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 12 - 5,
        size: Math.random() * 7 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 8,
        opacity: 1
      });
    }

    function animateConfetti() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      confettiParticles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.45;
        p.rotation += p.rotSpeed;
        p.opacity -= 0.012;

        if (p.opacity > 0 && p.y < canvas.height + 20) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      });

      if (alive) {
        confettiAnimFrame = requestAnimationFrame(animateConfetti);
      } else {
        stopConfetti();
      }
    }

    confettiAnimFrame = requestAnimationFrame(animateConfetti);
  }

  // Go to slide
  function goToSlide(targetSlide) {
    if (targetSlide < 1 || targetSlide > totalSlides) return;
    if (targetSlide === currentSlide) return;

    const prevSlideEl = document.querySelector(`.slide[data-slide="${currentSlide}"]`);
    const nextSlideEl = document.querySelector(`.slide[data-slide="${targetSlide}"]`);

    if (prevSlideEl) {
      prevSlideEl.classList.remove('active');
      if (targetSlide > currentSlide) {
        prevSlideEl.classList.add('slide-prev');
      } else {
        prevSlideEl.classList.remove('slide-prev');
      }
    }

    if (nextSlideEl) {
      nextSlideEl.classList.remove('slide-prev');
      nextSlideEl.classList.add('active');
      triggerNumberCounters(nextSlideEl);
    }

    currentSlide = targetSlide;
    playSlideSound();
    updateUI();

    if (currentSlide === 9) {
      startBpmnSimulation();
    } else {
      pauseBpmnSimulation();
    }

    if (currentSlide === 26) {
      playSuccessSound();
      launchConfetti();
    } else {
      stopConfetti();
    }
  }

  function nextSlide() {
    if (currentSlide < totalSlides) {
      goToSlide(currentSlide + 1);
    } else {
      playSuccessSound();
    }
  }

  function prevSlide() {
    if (currentSlide > 1) {
      goToSlide(currentSlide - 1);
    }
  }

  // Update Top Bar & Dock UI
  function updateUI() {
    if (counterCurrent) {
      counterCurrent.textContent = String(currentSlide).padStart(2, '0');
      counterCurrent.style.transform = 'scale(1.25)';
      setTimeout(() => { counterCurrent.style.transform = 'scale(1)'; }, 200);
    }

    const activeSlide = document.querySelector(`.slide[data-slide="${currentSlide}"]`);
    if (activeSlide && topicTitle) {
      topicTitle.textContent = activeSlide.getAttribute('data-topic') || '';
    }

    if (progressBarFill) {
      const pct = (currentSlide / totalSlides) * 100;
      progressBarFill.style.width = `${pct}%`;
    }

    const dots = document.querySelectorAll('.dock-dot');
    dots.forEach((dot, idx) => {
      const slideNum = idx + 1;
      dot.classList.remove('active');
      if (slideNum === currentSlide) {
        dot.classList.add('active');
        dot.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } else if (slideNum < currentSlide) {
        dot.classList.add('visited');
      }
    });

    const thumbs = document.querySelectorAll('.thumb-card');
    thumbs.forEach((thumb, idx) => {
      thumb.classList.toggle('active', idx + 1 === currentSlide);
    });
  }

  // Modals management
  function closeAllModals() {
    [modalOverview, modalVideo, modalDeploy, modalHelp].forEach(m => {
      if (m) m.classList.remove('open');
    });
  }

  function toggleOverviewModal(forceState) {
    const isOpen = modalOverview.classList.contains('open');
    const newState = forceState !== undefined ? forceState : !isOpen;
    closeAllModals();
    if (newState) {
      initThumbnailGrid();
      modalOverview.classList.add('open');
    }
  }

  function toggleVideoModal(forceState) {
    const isOpen = modalVideo.classList.contains('open');
    const newState = forceState !== undefined ? forceState : !isOpen;
    closeAllModals();
    if (newState) modalVideo.classList.add('open');
  }

  function toggleDeployModal(forceState) {
    const isOpen = modalDeploy.classList.contains('open');
    const newState = forceState !== undefined ? forceState : !isOpen;
    closeAllModals();
    if (newState) modalDeploy.classList.add('open');
  }

  function toggleHelpModal(forceState) {
    const isOpen = modalHelp.classList.contains('open');
    const newState = forceState !== undefined ? forceState : !isOpen;
    closeAllModals();
    if (newState) modalHelp.classList.add('open');
  }

  // Fullscreen
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        isFullscreen = true;
        if (btnFullscreen) btnFullscreen.innerHTML = '<i class="fa-solid fa-compress"></i>';
      }).catch(err => console.log(err));
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => {
          isFullscreen = false;
          if (btnFullscreen) btnFullscreen.innerHTML = '<i class="fa-solid fa-expand"></i>';
        });
      }
    }
  }

  // Sound toggle
  function toggleSound() {
    soundEnabled = !soundEnabled;
    if (btnSound) {
      btnSound.innerHTML = soundEnabled 
        ? '<i class="fa-solid fa-volume-high"></i>' 
        : '<i class="fa-solid fa-volume-xmark"></i>';
    }
    if (soundEnabled) playSuccessSound();
  }

  // Laser Pointer / Touch Pen Mode for Interactive Whiteboard
  function toggleLaserMode() {
    laserMode = !laserMode;
    if (btnLaser) {
      btnLaser.classList.toggle('active-tool', laserMode);
    }
    playTone(laserMode ? 880 : 440, 'triangle', 0.1, 0.05);
  }

  // Turbo / Eco Mode (Optimization for Weak Devices & Smartboards)
  function showPerfToast(msg) {
    let toast = document.querySelector('.perf-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'perf-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> <span>${msg}</span>`;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  function togglePerfMode(forcedState = null, isAuto = false) {
    if (forcedState !== null) {
      perfMode = forcedState;
    } else {
      perfMode = !perfMode;
    }

    document.body.classList.toggle('perf-mode', perfMode);
    if (btnPerf) {
      btnPerf.classList.toggle('active-tool', perfMode);
      btnPerf.title = perfMode ? 'Турбо-режим ВКЛЮЧЕН (Нажмите для обычного)' : 'Турбо-режим (Для слабых устройств)';
    }

    localStorage.setItem('is_presentation_perf_mode', perfMode ? 'true' : 'false');
    playTone(perfMode ? 750 : 350, 'sine', 0.08, 0.04);

    if (perfMode) {
      if (isAuto) {
        showPerfToast('Включен Турбо-режим: анимации упрощены для плавной работы на доске');
      } else {
        showPerfToast('Турбо-режим ВКЛ: максимальная плавность');
      }
    } else if (!isAuto) {
      showPerfToast('Турбо-режим ВЫКЛ: полный визуальный стиль');
    }
  }

  function initFpsDetector() {
    // If explicitly stored in localStorage, apply
    if (localStorage.getItem('is_presentation_perf_mode') !== null) {
      if (perfMode) {
        document.body.classList.add('perf-mode');
        if (btnPerf) btnPerf.classList.add('active-tool');
      }
      return;
    }

    // Auto-detect FPS on startup
    let frameCount = 0;
    let startTime = performance.now();
    let completed = false;

    function checkFps(time) {
      if (completed) return;
      frameCount++;
      const elapsed = time - startTime;
      if (elapsed >= 2200) {
        completed = true;
        const fps = (frameCount * 1000) / elapsed;
        if (fps < 32) {
          togglePerfMode(true, true);
        }
        return;
      }
      requestAnimationFrame(checkFps);
    }
    requestAnimationFrame(checkFps);
  }

  let laserTrail = [];
  let laserAnimId = null;

  function initLaserPointer() {
    const canvas = document.getElementById('laser-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    });

    function scheduleLaser() {
      if (!laserAnimId) {
        laserAnimId = requestAnimationFrame(renderLaser);
      }
    }

    function addLaserPoint(x, y) {
      laserTrail.push({
        x,
        y,
        life: 1.0,
        radius: 7
      });
      scheduleLaser();
    }

    // Touch / Pointer drawing on whiteboard
    window.addEventListener('pointermove', (e) => {
      if (laserMode && e.buttons > 0) {
        addLaserPoint(e.clientX, e.clientY);
      }
    });

    window.addEventListener('pointerdown', (e) => {
      if (laserMode) {
        addLaserPoint(e.clientX, e.clientY);
      }
    });

    function renderLaser() {
      laserAnimId = null;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (laserTrail.length > 0) {
        for (let i = laserTrail.length - 1; i >= 0; i--) {
          const pt = laserTrail[i];
          pt.life -= 0.035; // faster decay for crisp pointer

          if (pt.life <= 0) {
            laserTrail.splice(i, 1);
          } else {
            ctx.fillStyle = `rgba(0, 242, 254, ${pt.life})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.radius * pt.life, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (laserTrail.length > 0) {
          laserAnimId = requestAnimationFrame(renderLaser);
        }
      }
    }
  }

  // Keyboard navigation
  function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault();
          nextSlide();
          break;

        case 'ArrowLeft':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault();
          prevSlide();
          break;

        case 'Home':
          e.preventDefault();
          goToSlide(1);
          break;

        case 'End':
          e.preventDefault();
          goToSlide(totalSlides);
          break;

        case 'f':
        case 'F':
        case 'а':
        case 'А':
          toggleFullscreen();
          break;

        case 'o':
        case 'O':
        case 'щ':
        case 'Щ':
          toggleOverviewModal();
          break;

        case 'm':
        case 'M':
        case 'ь':
        case 'Ь':
          toggleSound();
          break;

        case 'l':
        case 'L':
        case 'д':
        case 'Д':
          toggleLaserMode();
          break;

        case 'p':
        case 'P':
        case 'з':
        case 'З':
          togglePerfMode();
          break;

        case '?':
          toggleHelpModal();
          break;

        case 'Escape':
          closeAllModals();
          break;
      }
    });
  }

  // Smartboard Touch Gestures (Swipe & Edge Taps)
  function setupSmartboardTouch() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    const minSwipeDistance = 50;

    window.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      }
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        const elapsed = Date.now() - touchStartTime;

        // Check horizontal swipe
        if (Math.abs(diffX) > minSwipeDistance && Math.abs(diffX) > Math.abs(diffY) * 1.5 && elapsed < 600) {
          if (diffX < 0) nextSlide(); // Swipe Left -> Next
          else prevSlide(); // Swipe Right -> Prev
        }
      }
    }, { passive: true });
  }

  // Interactive Background Canvas with Shockwaves (Lightweight & Throttled)
  let shockwaves = [];

  function initCanvasAnimation() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    window.addEventListener('resize', () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    });

    window.addEventListener('pointerdown', (e) => {
      if (perfMode) return;
      if (shockwaves.length < 4) {
        shockwaves.push({
          x: e.clientX,
          y: e.clientY,
          radius: 6,
          maxRadius: 90,
          opacity: 0.55
        });
      }
    });

    const particles = [];
    // 22 particles is visually great and takes virtually zero CPU/GPU
    const count = 22;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 1.5 + 1,
        color: Math.random() > 0.4 ? 'rgba(0, 242, 254, ' : 'rgba(99, 102, 241, '
      });
    }

    let lastFrameTime = 0;
    const FRAME_DELAY = 1000 / 30; // Throttle to 30 FPS

    function animate(currentTime) {
      if (perfMode) {
        // Skip canvas calculation completely in perf mode
        requestAnimationFrame(animate);
        return;
      }

      if (currentTime - lastFrameTime < FRAME_DELAY) {
        requestAnimationFrame(animate);
        return;
      }
      lastFrameTime = currentTime;

      ctx.clearRect(0, 0, width, height);

      // Draw shockwaves
      for (let s = shockwaves.length - 1; s >= 0; s--) {
        const sw = shockwaves[s];
        sw.radius += 3.5;
        sw.opacity -= 0.025;

        if (sw.opacity <= 0 || sw.radius >= sw.maxRadius) {
          shockwaves.splice(s, 1);
        } else {
          ctx.strokeStyle = `rgba(0, 242, 254, ${sw.opacity})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Draw all connections in a SINGLE batch stroke (zero draw call overhead!)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 242, 254, 0.12)';
      ctx.lineWidth = 1;
      const maxDist = 110;
      const maxDistSq = maxDist * maxDist;

      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          if (Math.abs(dx) > maxDist || Math.abs(dy) > maxDist) continue;
          if (dx * dx + dy * dy < maxDistSq) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          }
        }
      }
      ctx.stroke();

      // Draw particles
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = p.color + '0.6)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
  }

  // BPMN 2.0 Real-time Interactive Process Simulator
  let bpmnTimer = null;
  let bpmnScenarioIndex = 0; // 0: Approve, 1: Reject
  let bpmnAutoMode = true;

  function setBpmnFeed(iconHtml, stepText, descText, statusType = '') {
    const feedIcon = document.getElementById('bpmn-feed-icon');
    const feedStep = document.getElementById('bpmn-feed-step');
    const feedDesc = document.getElementById('bpmn-feed-desc');
    const feedCard = document.getElementById('bpmn-live-feed');

    if (feedIcon) feedIcon.innerHTML = iconHtml;
    if (feedStep) feedStep.textContent = stepText;
    if (feedDesc) feedDesc.textContent = descText;
    if (feedCard) {
      feedCard.className = 'bpmn-live-feed ' + (statusType ? 'status-' + statusType : '');
    }
  }

  function setTokenPosition(x, y, glowColor = '#00f2fe', coreColor = '#00f2fe') {
    const token = document.getElementById('dynamic-bpmn-token');
    const tokenGlow = document.getElementById('token-glow-circle');
    const tokenCore = document.getElementById('token-core-circle');

    if (token) {
      token.style.transform = 	ranslate(px, px);
      token.style.opacity = '1';
    }
    if (tokenGlow) tokenGlow.setAttribute('fill', glowColor);
    if (tokenCore) tokenCore.setAttribute('fill', coreColor);
  }

  function runBpmnScenario(type = 'approve') {
    if (bpmnTimer) clearTimeout(bpmnTimer);

    const token = document.getElementById('dynamic-bpmn-token');
    const scoreBadge = document.getElementById('score-live-badge');
    const scoreText = document.getElementById('score-live-text');
    const nodeScoring = document.getElementById('node-scoring');
    const nodeGateway = document.getElementById('node-gateway');
    const nodeApprove = document.getElementById('node-approve');
    const nodeReject = document.getElementById('node-reject');
    const nodeEndApprove = document.getElementById('node-end-approve');
    const nodeEndReject = document.getElementById('node-end-reject');
    const wireApprove = document.getElementById('wire-approve');
    const wireReject = document.getElementById('wire-reject');

    // Reset wire classes & badges
    if (wireApprove) wireApprove.classList.remove('flow-active');
    if (wireReject) wireReject.classList.remove('flow-active');
    if (scoreBadge) scoreBadge.setAttribute('opacity', '0');

    // STEP 1: START (t = 0)
    setTokenPosition(50, 105, '#00f2fe', '#00f2fe');
    setBpmnFeed(
      '<i class="fa-solid fa-file-lines text-cyan"></i>',
      'Шаг 1/4: Подача заявки через мобильный банк',
      'Клиент заполнил форму. Стартовое событие BPMN активировано, токен запущен в обработку.',
      ''
    );
    playTone(520, 'sine', 0.05, 0.03);

    // STEP 2: SCORING (t = 900ms)
    bpmnTimer = setTimeout(() => {
      setTokenPosition(172, 105, '#00f2fe', '#00f2fe');
      if (nodeScoring) {
        nodeScoring.classList.add('pulse-node');
        setTimeout(() => nodeScoring.classList.remove('pulse-node'), 800);
      }
      playTone(660, 'sine', 0.07, 0.04);

      if (type === 'approve') {
        if (scoreText) scoreText.textContent = 'Score: 780';
        if (scoreBadge) scoreBadge.setAttribute('opacity', '1');
        setBpmnFeed(
          '<i class="fa-solid fa-brain text-cyan fa-spin"></i>',
          'Шаг 2/4: AI-Скоринг (ML модель за 40 мс)',
          'Анализ кредитной истории и транзакционной активности. Результат: 780 / 850 (Высокий рейтинг).',
          ''
        );
      } else {
        if (scoreText) scoreText.textContent = 'Score: 490';
        if (scoreBadge) scoreBadge.setAttribute('opacity', '1');
        setBpmnFeed(
          '<i class="fa-solid fa-brain text-amber fa-spin"></i>',
          'Шаг 2/4: AI-Скоринг (ML модель за 40 мс)',
          'Анализ кредитной истории. Выявлена высокая долговая нагрузка. Результат: 490 / 850 (Критический риск).',
          ''
        );
      }

      // STEP 3: GATEWAY XOR (t = 2200ms)
      bpmnTimer = setTimeout(() => {
        if (scoreBadge) scoreBadge.setAttribute('opacity', '0');
        setTokenPosition(295, 105, '#f59e0b', '#f59e0b');
        if (nodeGateway) {
          nodeGateway.classList.add('pulse-node');
          setTimeout(() => nodeGateway.classList.remove('pulse-node'), 700);
        }
        playTone(740, 'triangle', 0.08, 0.04);

        if (type === 'approve') {
          if (wireApprove) wireApprove.classList.add('flow-active');
          setBpmnFeed(
            '<i class="fa-solid fa-code-branch text-emerald"></i>',
            'Шаг 3/4: Шлюз XOR — Проверка [Score ≥ 700]',
            'Условие: 780 ≥ 700 = ИСТИНА. Токен автоматически направляется в верхнюю ветку (Одобрение).',
            ''
          );
        } else {
          if (wireReject) wireReject.classList.add('flow-active');
          setBpmnFeed(
            '<i class="fa-solid fa-code-branch text-rose"></i>',
            'Шаг 3/4: Шлюз XOR — Проверка [Score ≥ 700]',
            'Условие: 490 < 700 = ЛОЖЬ. Токен автоматически направляется в нижнюю ветку (Отказ).',
            ''
          );
        }

        // STEP 4: TASK ACTION (t = 3400ms)
        bpmnTimer = setTimeout(() => {
          if (type === 'approve') {
            setTokenPosition(427, 55, '#10b981', '#10b981');
            if (nodeApprove) {
              nodeApprove.classList.add('pulse-node');
              setTimeout(() => nodeApprove.classList.remove('pulse-node'), 800);
            }
            playTone(880, 'sine', 0.08, 0.04);
            setBpmnFeed(
              '<i class="fa-solid fa-circle-check text-emerald"></i>',
              'Шаг 4/4: Сервисная задача «Одобрить заявку»',
              'Сформирован электронный договор, зарезервирован кредитный лимит в АБС банка.',
              'success'
            );
          } else {
            setTokenPosition(427, 155, '#f43f5e', '#f43f5e');
            if (nodeReject) {
              nodeReject.classList.add('pulse-node');
              setTimeout(() => nodeReject.classList.remove('pulse-node'), 800);
            }
            playTone(340, 'sawtooth', 0.1, 0.04);
            setBpmnFeed(
              '<i class="fa-solid fa-circle-xmark text-rose"></i>',
              'Шаг 4/4: Сервисная задача «Отклонить заявку»',
              'Сформирован официальный отказ по риск-политике без привлечения ручного труда операторов.',
              'danger'
            );
          }

          // STEP 5: END EVENT (t = 4600ms)
          bpmnTimer = setTimeout(() => {
            if (type === 'approve') {
              setTokenPosition(530, 55, '#10b981', '#10b981');
              if (nodeEndApprove) {
                nodeEndApprove.classList.add('pulse-node');
                setTimeout(() => nodeEndApprove.classList.remove('pulse-node'), 800);
              }
              playSuccessSound();
              setBpmnFeed(
                '<i class="fa-solid fa-award text-emerald"></i>',
                'Процесс успешно завершён: Кредит выдан!',
                'Push-уведомление отправлено клиенту. Полное время исполнения BPMN: 42 секунды (вместо 5 дней AS-IS).',
                'success'
              );
            } else {
              setTokenPosition(530, 155, '#f43f5e', '#f43f5e');
              if (nodeEndReject) {
                nodeEndReject.classList.add('pulse-node');
                setTimeout(() => nodeEndReject.classList.remove('pulse-node'), 800);
              }
              playTone(220, 'sawtooth', 0.16, 0.04);
              setBpmnFeed(
                '<i class="fa-solid fa-ban text-rose"></i>',
                'Процесс завершён: Заявка отклонена',
                'Клиент получил разъяснение в мобильном приложении. Ни одного часа сотрудника банка не затрачено.',
                'danger'
              );
            }

            // Next cycle if auto-mode
            if (bpmnAutoMode) {
              bpmnTimer = setTimeout(() => {
                bpmnScenarioIndex = (bpmnScenarioIndex + 1) % 2;
                runBpmnScenario(bpmnScenarioIndex === 0 ? 'approve' : 'reject');
              }, 3200);
            }
          }, 1200);
        }, 1200);
      }, 1200);
    }, 900);
  }

  function startBpmnSimulation() {
    bpmnAutoMode = true;
    const btnAuto = document.getElementById('bpmn-btn-auto');
    if (btnAuto) btnAuto.classList.add('active');
    runBpmnScenario(bpmnScenarioIndex === 0 ? 'approve' : 'reject');
  }

  function pauseBpmnSimulation() {
    if (bpmnTimer) {
      clearTimeout(bpmnTimer);
      bpmnTimer = null;
    }
  }

  function initBpmnSimulator() {
    const btnApprove = document.getElementById('bpmn-btn-approve');
    const btnReject = document.getElementById('bpmn-btn-reject');
    const btnAuto = document.getElementById('bpmn-btn-auto');

    if (btnApprove) {
      btnApprove.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        bpmnAutoMode = false;
        if (btnAuto) btnAuto.classList.remove('active');
        btnApprove.classList.add('active');
        if (btnReject) btnReject.classList.remove('active');
        runBpmnScenario('approve');
      });
    }

    if (btnReject) {
      btnReject.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        bpmnAutoMode = false;
        if (btnAuto) btnAuto.classList.remove('active');
        btnReject.classList.add('active');
        if (btnApprove) btnApprove.classList.remove('active');
        runBpmnScenario('reject');
      });
    }

    if (btnAuto) {
      btnAuto.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        bpmnAutoMode = !bpmnAutoMode;
        btnAuto.classList.toggle('active', bpmnAutoMode);
        if (btnApprove) btnApprove.classList.remove('active');
        if (btnReject) btnReject.classList.remove('active');
        if (bpmnAutoMode) {
          runBpmnScenario(bpmnScenarioIndex === 0 ? 'approve' : 'reject');
        } else {
          pauseBpmnSimulation();
        }
      });
    }

    // Touch on nodes triggers direct explanations
    const nodeScoring = document.getElementById('node-scoring');
    if (nodeScoring) {
      nodeScoring.addEventListener('pointerdown', () => {
        playTone(660, 'sine', 0.08, 0.04);
        setBpmnFeed(
          '<i class="fa-solid fa-gears text-cyan"></i>',
          'Сервисная задача BPMN 2.0 (Service Task)',
          'Автоматический вызов внешнего REST API скоринг-модели без участия человека.',
          ''
        );
      });
    }

    const nodeGateway = document.getElementById('node-gateway');
    if (nodeGateway) {
      nodeGateway.addEventListener('pointerdown', () => {
        playTone(740, 'triangle', 0.08, 0.04);
        setBpmnFeed(
          '<i class="fa-solid fa-diamond text-amber"></i>',
          'Шлюз исключающего «ИЛИ» (Exclusive XOR Gateway)',
          'Маршрутизирует процесс строго по одной из двух взаимоисключающих веток на основе условия.',
          ''
        );
      });
    }
  }

  // Interactive Kanban Card Mover
  function initKanbanInteraction() {
    const kanbanCards = document.querySelectorAll('.kanban-card');
    kanbanCards.forEach(card => {
      card.style.cursor = 'pointer';
      card.setAttribute('title', 'Нажмите для перемещения задачи по колонкам');
      card.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const parentCol = card.closest('.kanban-col');
        if (!parentCol) return;
        
        const allCols = Array.from(document.querySelectorAll('.kanban-col'));
        const currentIndex = allCols.indexOf(parentCol);
        const nextCol = allCols[(currentIndex + 1) % allCols.length];

        if (nextCol) {
          card.style.transform = 'scale(0.85) translateY(-8px)';
          card.style.opacity = '0.5';
          playTone(540 + currentIndex * 120, 'sine', 0.08, 0.04);

          setTimeout(() => {
            nextCol.appendChild(card);
            card.style.transform = 'scale(1.05)';
            card.style.opacity = '1';

            if (nextCol === allCols[allCols.length - 1]) {
              playSuccessSound();
              card.style.borderColor = 'rgba(16, 185, 129, 0.8)';
              card.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.4)';
            } else {
              card.style.borderColor = '';
              card.style.boxShadow = '';
            }

            setTimeout(() => { card.style.transform = 'scale(1)'; }, 200);
          }, 180);
        }
      });
    });
  }

  // Interactive SDLC Steps (Slide 5)
  function initSdlcInteraction() {
    const sdlcSteps = document.querySelectorAll('.sdlc-step');
    sdlcSteps.forEach((step, idx) => {
      step.style.cursor = 'pointer';
      step.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sdlcSteps.forEach(s => s.classList.remove('active-step'));
        step.classList.add('active-step');
        playTone(480 + idx * 70, 'sine', 0.08, 0.04);
        step.style.transform = 'scale(1.06) translateY(-4px)';
        setTimeout(() => { step.style.transform = ''; }, 250);
      });
    });
  }

  // Interactive Widgets (Failover simulation, API click, BPMN, Kanban, SDLC)
  function initInteractiveWidgets() {
    initBpmnSimulator();
    initKanbanInteraction();
    initSdlcInteraction();
    const failedNode = document.querySelector('.node-ha-box.failed');
    if (failedNode) {
      failedNode.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (failedNode.classList.contains('failed')) {
          failedNode.classList.remove('failed');
          failedNode.classList.add('healthy');
          failedNode.querySelector('strong').textContent = 'Node 02';
          failedNode.querySelector('small').textContent = 'RECOVERED (33%)';
          failedNode.querySelector('i').className = 'fa-solid fa-circle-check';
          playSuccessSound();
        } else {
          failedNode.classList.remove('healthy');
          failedNode.classList.add('failed');
          failedNode.querySelector('strong').textContent = 'Node 02';
          failedNode.querySelector('small').textContent = 'CRASHED (0%)';
          failedNode.querySelector('i').className = 'fa-solid fa-circle-xmark';
          playTone(280, 'sawtooth', 0.15, 0.05);
        }
      });
    }

    const swaggerHeader = document.querySelector('.swagger-header-bar');
    if (swaggerHeader) {
      swaggerHeader.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const bodyCode = document.querySelector('.swagger-body-code');
        if (bodyCode) {
          bodyCode.style.transition = 'background 0.3s ease';
          bodyCode.style.background = 'rgba(16, 185, 129, 0.2)';
          playTone(660, 'sine', 0.08, 0.04);
          setTimeout(() => {
            bodyCode.style.background = '#090e17';
          }, 400);
        }
      });
    }
  }

  // Setup Event Listeners
  function initListeners() {
    // Dock Buttons
    const btnPrev = document.getElementById('dock-btn-prev');
    const btnNext = document.getElementById('dock-btn-next');
    if (btnPrev) btnPrev.addEventListener('pointerdown', (e) => { e.preventDefault(); prevSlide(); });
    if (btnNext) btnNext.addEventListener('pointerdown', (e) => { e.preventDefault(); nextSlide(); });

    // Floating Smartboard Side Touch Buttons
    if (sbNavPrev) sbNavPrev.addEventListener('pointerdown', (e) => { e.preventDefault(); prevSlide(); });
    if (sbNavNext) sbNavNext.addEventListener('pointerdown', (e) => { e.preventDefault(); nextSlide(); });

    // Header buttons
    if (btnSound) btnSound.addEventListener('pointerdown', toggleSound);
    if (btnFullscreen) btnFullscreen.addEventListener('pointerdown', toggleFullscreen);
    if (btnLaser) btnLaser.addEventListener('pointerdown', toggleLaserMode);
    if (btnPerf) btnPerf.addEventListener('pointerdown', (e) => { e.preventDefault(); togglePerfMode(); });

    const btnOverview = document.getElementById('btn-overview');
    if (btnOverview) btnOverview.addEventListener('pointerdown', () => toggleOverviewModal());

    const btnVideo = document.getElementById('btn-video');
    if (btnVideo) btnVideo.addEventListener('pointerdown', () => toggleVideoModal());

    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) btnHelp.addEventListener('pointerdown', () => toggleHelpModal());

    const btnDeploy = document.getElementById('btn-deploy');
    if (btnDeploy) btnDeploy.addEventListener('pointerdown', () => toggleDeployModal());

    // Close modals on touch outside
    [modalOverview, modalVideo, modalDeploy, modalHelp].forEach(m => {
      if (m) {
        m.addEventListener('pointerdown', (e) => {
          if (e.target === m) closeAllModals();
        });
      }
    });
  }

  // Initialize
  function init() {
    initDockDots();
    initThumbnailGrid();
    setupKeyboard();
    setupSmartboardTouch();
    initListeners();
    initCanvasAnimation();
    initLaserPointer();
    initInteractiveWidgets();
    startTimer();
    updateUI();
    initFpsDetector();
  }

  return {
    init,
    goToSlide,
    nextSlide,
    prevSlide,
    toggleOverviewModal,
    toggleVideoModal,
    toggleDeployModal,
    openDeployModal: () => toggleDeployModal(true),
    toggleHelpModal,
    toggleLaserMode,
    togglePerfMode
  };
})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  Presentation.init();
});
