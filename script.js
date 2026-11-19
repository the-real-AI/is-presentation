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
    [modalOverview, modalVideo, modalDeploy, modalHelp, modalGuide].forEach(m => {
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

  
  // ==========================================================================
  // IMPLEMENTATION GUIDES DATA & LOGIC (HOW TO APPLY FOR EACH SLIDE)
  // ==========================================================================
  const IMPLEMENTATION_GUIDES = {"1": {"title": "Титульный лист: Старт проекта и формирование команды", "goal": "Инициализация репозитория, распределение ролей и настройка рабочего процесса архитектурной команды.", "steps": ["1. Создать монорепозиторий или структуру каталогов под микросервисы в корпоративном Git (GitHub/GitLab).", "2. Утвердить матрицу компетенций и ролей (RACI): Solution Architect, Lead Backend, Lead Frontend, DevOps, QA Lead, Product Owner.", "3. Инициализировать каталог документации docs/architecture с шаблонами ADR и диаграммами C4.", "4. Зафиксировать бизнес-цели проекта и ограничения (бюджет, стек, дедлайны) в файле PROJECT_CHARTER.md."], "exampleTitle": "Структура стартового репозитория и командный скрипт", "exampleCode": "# Инициализация репозитория проекта ИС\nmkdir -p enterprise-is-core/{docs/{architecture,requirements,api},src/{services,frontend,common},deploy/{docker,k8s},tests/{unit,e2e}}\ncd enterprise-is-core\ngit init -b main\n\n# Создание базового файла манифеста\ncat << 'EOF' > README.md\n# Информационная Система Корпоративного Уровня\n- Архитектор: Solution Architecture Team\n- Стек: Linux, Docker, Python/Go, PostgreSQL, Kafka, React\n- Документация: docs/architecture/\nEOF", "exampleLang": "bash", "tools": ["Git", "GitHub / GitLab", "Confluence", "Markdown"], "checklist": ["Репозиторий создан и настроены права доступа по ролям", "Утвержден стек технологий и зафиксирован в уставе проекта", "Настроена базовая структура каталогов документации и исходного кода"]}, "2": {"title": "Структурный план: Дорожная карта проектирования (Engineering Roadmap)", "goal": "Пошаговая декомпозиция всех 26 этапов проектирования с контрольными точками и привязкой к спринтам.", "steps": ["1. Разбить проект на 4 глобальные фазы: Исследование (Слайды 3-9), Архитектура (Слайды 10-15), Инженерия (Слайды 16-22), Экономика и Защита (Слайды 23-26).", "2. Создать контрольные точки (Milestones) с датами сдачи артефактов в таск-трекере (Jira / Linear).", "3. Настроить строгие фазовые гейты (Stage Gates): переход к коду возможен только после согласования ТЗ и схемы БД.", "4. Составить дашборд прогресса реализации архитектуры для руководства."], "exampleTitle": "Фрагмент манифеста контрольных точек (milestones.yaml)", "exampleCode": "milestones:\n  - id: M1_ANALYTICS\n    name: \"Согласование ТЗ и Бизнес-процессов\"\n    slides_covered: [3, 4, 5, 6, 7, 8, 9]\n    deadline: \"2026-12-01\"\n    deliverables: [\"SRS_Document.pdf\", \"BPMN_Processes.xml\", \"User_Stories_Backlog\"]\n  - id: M2_ARCHITECTURE\n    name: \"Архитектурный проект и Модель Данных\"\n    slides_covered: [10, 11, 12, 13, 14, 15]\n    deadline: \"2026-12-20\"\n    deliverables: [\"C4_Container_Diagram.puml\", \"Database_Schema_3NF.sql\", \"OpenAPI_v1.yaml\"]\n  - id: M3_PRODUCTION_READY\n    name: \"Безопасность, CI/CD и Продакшн\"\n    slides_covered: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]\n    deadline: \"2027-01-25\"\n    deliverables: [\"GitHub_Actions_CI.yml\", \"Kubernetes_Helm_Charts\", \"Audit_Report.pdf\"]", "exampleLang": "yaml", "tools": ["Jira Roadmap", "Linear", "Miro", "Mermaid.js"], "checklist": ["Определены ответственные за каждый модуль архитектуры", "Зафиксированы даты контрольных точек и критерии приёмки", "Создан прозрачный дашборд выполнения этапов"]}, "3": {"title": "Понятие ИС: Архитектурное разделение на 4 слоя", "goal": "Практическое разделение проектируемой системы на 4 изолированных слоя: Hardware, Software, Data, People/Rules.", "steps": ["1. Hardware Layer: Спроектировать инфраструктуру в коде (Infrastructure as Code) через Terraform или Docker Compose.", "2. Software Layer: Упаковать бэкенд и фронтенд в легковесные контейнеры без привязки к конкретному серверу.", "3. Data Layer: Вынести персистентные данные в изолированные тома с автоматическим регулярным бэкапом.", "4. People & Rules Layer: Описать роли пользователей, регламенты SLA и политики доступа в RBAC-манифесте."], "exampleTitle": "Реализация 4-слойной ИС в docker-compose.yml", "exampleCode": "version: '3.8'\n\nservices:\n  # 1. SOFTWARE LAYER: Бизнес-логика приложения\n  app-backend:\n    image: python:3.12-slim\n    command: uvicorn main:app --host 0.0.0.0 --port 8000\n    environment:\n      DATABASE_URL: postgresql://app_user:strong_pass@database:5432/core_db\n    ports: [\"8000:8000\"]\n    depends_on: [database]\n    restart: unless-stopped\n\n  # 2. DATA LAYER: Изолированная СУБД с персистентным томом\n  database:\n    image: postgres:16-alpine\n    environment:\n      POSTGRES_DB: core_db\n      POSTGRES_USER: app_user\n      POSTGRES_PASSWORD: strong_pass\n    volumes:\n      - pg_data:/var/lib/postgresql/data\n    restart: unless-stopped\n\n# 3. HARDWARE / INFRA LAYER: Выделенные дисковые хранилища\nvolumes:\n  pg_data:\n    driver: local\n\n# 4. PEOPLE & RULES: Описаны в RBAC-конфигурациях и политиках доступа API", "exampleLang": "yaml", "tools": ["Docker Compose", "Terraform", "PostgreSQL", "Linux"], "checklist": ["Слой данных физически изолирован от контейнеров с кодом", "Конфигурация инфраструктуры версионируется в Git (IaC)", "Описаны политики восстановления данных при аппаратных сбоях"]}, "4": {"title": "Цели и задачи: Применение Закона Боэма на практике", "goal": "Раннее обнаружение и устранение ошибок проектирования через матрицу трассируемости (RTM) и Architecture Review.", "steps": ["1. Построить матрицу трассируемости требований (Requirements Traceability Matrix - RTM).", "2. Провести формальную сессию Architecture Review до написания первого коммита кода.", "3. Проверить каждое требование на соответствие критериям SMART и неизбыточности.", "4. Зафиксировать выявленные архитектурные риски в реестре с планом их митигации."], "exampleTitle": "Шаблон матрицы трассируемости требований (RTM)", "exampleCode": "| ID Требования | Бизнес-потребность | Архитектурный модуль | Приёмочный тест (Acceptance Test) | Статус валидации |\n|---|---|---|---|---|\n| REQ-001 | Оформление заказа < 1.5 сек | Order Microservice + Redis | TC-PERF-01 (Apache JMeter, 2000 RPS) | ✅ Верифицировано |\n| REQ-002 | Шифрование паролей по ГОСТ | Crypto Auth Service | TC-SEC-03 (Аудит алгоритма Argon2id) | ✅ Верифицировано |\n| REQ-003 | Бесперебойность 99.95% | K8s HPA + Multi-AZ Cluster | TC-DR-02 (Симуляция падения ноды кластера) | ✅ Верифицировано |", "exampleLang": "markdown", "tools": ["Confluence", "Jira", "TestRail", "SonarQube"], "checklist": ["100% требований связаны с конкретными архитектурными модулями", "Для каждого требования разработан метод приёмочного тестирования", "Архитектура утверждена на ревью всеми ведущими инженерами"]}, "5": {"title": "Жизненный цикл ИС (SDLC): Внедрение ISO/IEC 12207", "goal": "Построение сквозного регламента разработки с четкими критериями входа (DoR) и выхода (DoD) для каждой фазы.", "steps": ["1. Разделить цикл на 6 этапов: Анализ -> Проектирование -> Разработка -> Тестирование -> Внедрение -> Сопровождение.", "2. Для каждого этапа описать обязательные артефакты (ТЗ, архитектурная схема, unit-тесты, релизная документация).", "3. Внедрить в CI/CD автоматические гейты перехода между этапами (Quality Gates).", "4. Назначить владельцев процессов (Process Owners) для каждого этапа."], "exampleTitle": "Регламент Definition of Ready (DoR) и Definition of Done (DoD)", "exampleCode": "# Регламент фазовых переходов проекта (SDLC ISO 12207)\n\n## Definition of Ready (Критерии готовности к разработке):\n- [ ] Оформлена User Story с критериями приёмки Given-When-Then\n- [ ] Утвержден макет в Figma и контракты API в формате OpenAPI\n- [ ] Оценены риски и трудоемкость командой на Planning Poker\n\n## Definition of Done (Критерии завершения разработки):\n- [ ] Код покрыт модульными тестами (Unit Coverage >= 80%)\n- [ ] Пройден статический анализ безопасности (SAST: SonarQube / Snyk)\n- [ ] Выполнен Pull Request Review (минимум 2 Approve от Tech Lead)\n- [ ] Успешно развёрнуто в Staging-окружении и пройдены Smoke-тесты", "exampleLang": "markdown", "tools": ["GitLab / GitHub Actions", "SonarQube", "Jira", "ISO/IEC 12207"], "checklist": ["Критерии DoR и DoD приняты всеми членами команды", "Настроена автоматическая блокировка слияния веток при непрохождении тестов", "Разработан план регулярного аудита соответствия стандарту"]}, "6": {"title": "Классические модели: Реализация V-Model для критических ИС", "goal": "Применение V-образной модели для проектов с высокими требованиями к надёжности (банки, медицина, транспорт).", "steps": ["1. Построить левую ветвь V: Требования бизнеса -> Архитектура системы -> Детальное проектирование модулей.", "2. Параллельно разработать правую ветвь V: Приёмочные тесты -> Системные тесты -> Модульные unit-тесты.", "3. Утвердить регламент Change Request: любые изменения в ТЗ требуют пересогласования тестовых спецификаций.", "4. Исключить возможность перехода к коду без утверждённой спецификации тестов."], "exampleTitle": "Конфигурация автоматизированного тестирования по уровням V-Model", "exampleCode": "# 1. Нижний уровень V-Model: Модульные тесты компонентов (Unit Tests)\npytest tests/unit/ -v --cov=app --cov-report=html\n\n# 2. Средний уровень V-Model: Интеграционное системное тестирование (Integration Tests)\npytest tests/integration/ -m \"db_integration or message_bus\"\n\n# 3. Верхний уровень V-Model: Сквозное приёмочное тестирование (E2E / Acceptance)\nnpx playwright test tests/e2e/order_fulfillment.spec.ts --reporter=html", "exampleLang": "bash", "tools": ["PyTest", "Playwright", "Allure Report", "TestRail"], "checklist": ["Каждое требование ТЗ имеет парный сценарий тестирования", "Настроена двусторонняя трассируемость от бага к требованию", "Все уровни тестов запускаются автоматически в сборочной линии"]}, "7": {"title": "Гибкие методологии: Запуск Scrum-спринта и Kanban-доски", "goal": "Организация 2-недельного цикла поставки ценности с ограничением незавершённой работы (WIP Limit).", "steps": ["1. Сформировать бэклог продукта (Product Backlog), декомпозированный на задачи до 8-16 часов.", "2. Настроить физическую или цифровую Kanban-доску с колонками: Backlog, To Do, In Progress, Review, Done.", "3. Установить жесткий WIP Limit (лимит одновременных задач) для колонки In Progress (равный числу разработчиков).", "4. Внедрить 4 обязательных события Scrum: Планирование, Daily Standup (15 мин), Демонстрация (Review), Ретроспектива."], "exampleTitle": "Скрипт проверки лимитов WIP через GitHub CLI", "exampleCode": "#!/usr/bin/env bash\n# Проверка соблюдения лимита незавершенной работы (WIP Limit)\nWIP_LIMIT=3\nIN_PROGRESS_COUNT=$(gh issue list --label \"in-progress\" --json id | jq '. | length')\n\necho \"Текущее количество задач в работе: $IN_PROGRESS_COUNT (Лимит: $WIP_LIMIT)\"\n\nif [ \"$IN_PROGRESS_COUNT\" -gt \"$WIP_LIMIT\" ]; then\n  echo \"ВНИМАНИЕ: Превышен WIP Limit! Сначала завершите текущие задачи перед взятием новых.\"\n  exit 1\nelse\n  echo \"WIP Limit в норме. Команда работает сфокусированно.\"\nfi", "exampleLang": "bash", "tools": ["Jira", "GitHub Projects", "Linear", "Trello"], "checklist": ["WIP-лимиты настроены в таск-трекере и соблюдаются командой", "Длительность спринта зафиксирована (10 рабочих дней)", "В конце каждого спринта проводится живое демо для заказчика"]}, "8": {"title": "Сбор требований: Написание User Story и критериев приёмки", "goal": "Превращение бизнес-пожеланий в четкие однозначные сценарии по методике INVEST и стандарту ГОСТ 34.", "steps": ["1. Определить персону пользователя (роль, боли, цели) через User Persona карту.", "2. Сформулировать User Story по шаблону: 'Как [роль], я хочу [действие], чтобы [бизнес-ценность]'.", "3. Добавить обязательные приёмочные критерии в синтаксисе Given-When-Then (Gherkin).", "4. Для интеграционных и государственных систем оформить разделы ТЗ по ГОСТ 34.602-89."], "exampleTitle": "Спецификация требования в формате Gherkin / BDD", "exampleCode": "# User Story: Онлайн-оплата заказа через СБП\nФункционал: Быстрая оплата по QR-коду Системы Быстрых Платежей\n  Как авторизованный покупатель мобильного приложения\n  Я хочу оплатить заказ через СБП в один клик\n  Чтобы не вводить данные банковской карты вручную\n\n  Сценарий: Успешная оплата с достаточным балансом\n    Дано: Покупатель находится на экране чекаута с заказом #1094 на сумму 3200 руб.\n    И: Выбран способ оплаты \"СБП (QR-код / Ссылка в банк)\"\n    Когда: Покупатель нажимает кнопку \"Оплатить через СБП\"\n    Тогда: Система формирует динамический QR-код по стандарту ЦБ РФ\n    И: Приложение открывает банковский клиент пользователя\n    Когда: Банк присылает вебхук с подтверждением транзакции (HTTP 200 OK)\n    Тогда: Статус заказа мгновенно обновляется на \"PAID\"\n    И: Клиент получает push-уведомление с фискальным чеком", "exampleLang": "gherkin", "tools": ["Cucumber", "Jira", "Confluence", "ГОСТ 34.602-89"], "checklist": ["История удовлетворяет критериям INVEST (Independent, Negotiable, Valuable, Estimable, Small, Testable)", "Критерии приёмки покрывают как позитивный, так и негативные сценарии", "Требование согласовано с аналитиком, тестировщиком и заказчиком"]}, "9": {"title": "Бизнес-моделирование: Разработка и запуск процесса BPMN 2.0", "goal": "Создание визуального исполняемого бизнес-процесса и его развертывание в процессном движке (Camunda / Zeebe).", "steps": ["1. Смоделировать процесс в Camunda Modeler с разделением на дорожки (Pools/Lanes).", "2. Использовать Start Event для входящего события (например, REST-запрос на выдачу кредита).", "3. Задать Service Tasks с привязкой к конкретным топикам обработчиков (External Task Workers).", "4. Настроить Exclusive Gateway (XOR) с булевыми выражениями ветвления (${creditScore >= 700}).", "5. Развернуть BPMN XML диаграмму в движке Camunda через REST API."], "exampleTitle": "External Task Worker на Python для сервисной задачи BPMN", "exampleCode": "import requests\nimport time\n\nCAMUNDA_URL = \"http://localhost:8080/engine-rest\"\nTOPIC_NAME = \"scoring-service\"\n\ndef poll_and_execute_task():\n    # 1. Запрос задачи из очереди Camunda\n    fetch_payload = {\n        \"workerId\": \"worker-scoring-ai-01\",\n        \"maxTasks\": 1,\n        \"topics\": [{\"topicName\": TOPIC_NAME, \"lockDuration\": 10000}]\n    }\n    res = requests.post(f\"{CAMUNDA_URL}/external-task/fetchAndLock\", json=fetch_payload).json()\n\n    for task in res:\n        task_id = task['id']\n        variables = task['variables']\n        income = variables.get('monthlyIncome', {}).get('value', 0)\n        \n        # 2. Бизнес-логика: AI Скоринг\n        calculated_score = 780 if income > 80000 else 490\n        print(f\"Обработана заявка {task_id}: Скоринг = {calculated_score}\")\n\n        # 3. Отправка результата обратно в BPMN процесс\n        complete_payload = {\n            \"workerId\": \"worker-scoring-ai-01\",\n            \"variables\": {\"creditScore\": {\"value\": calculated_score, \"type\": \"Integer\"}}\n        }\n        requests.post(f\"{CAMUNDA_URL}/external-task/{task_id}/complete\", json=complete_payload)\n\nif __name__ == \"__main__\":\n    poll_and_execute_task()", "exampleLang": "python", "tools": ["Camunda Platform", "bpmn.io", "Zeebe", "Signavio"], "checklist": ["Процесс проходит валидацию BPMN 2.0 XML без синтаксических ошибок", "Все сервисные задачи привязаны к действующим внешним воркерам", "Ветвление протестировано на граничных значениях условий"]}, "10": {"title": "Монолит vs Микросервисы: Декомпозиция по паттерну Strangler Fig", "goal": "Безопасная миграция с устаревшего монолита на микросервисную архитектуру без остановки бизнес-операций.", "steps": ["1. Выявить самый критичный и быстрорастущий домен монолита (например, модуль заказов / корзины).", "2. Установить перед монолитом Reverse Proxy / API Gateway (Nginx или Envoy).", "3. Разработать новый независимый микросервис со своей изолированной базой данных.", "4. Настроить прокси на перехват вызовов нового домена на микросервис, оставляя остальной трафик в монолите.", "5. Настроить фоновую асинхронную синхронизацию данных через CDC (Change Data Capture / Debezium)."], "exampleTitle": "Конфигурация Nginx для паттерна Strangler Fig (Душитель)", "exampleCode": "upstream legacy_monolith {\n    server 10.0.1.10:8080 max_fails=3 fail_timeout=10s;\n}\n\nupstream new_order_microservice {\n    server 10.0.1.20:5000;\n}\n\nserver {\n    listen 80;\n    server_name api.company.com;\n\n    # 1. Перехваченный маршрут: Заказы обрабатываются новым микросервисом\n    location /api/v1/orders {\n        proxy_pass http://new_order_microservice;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n    }\n\n    # 2. Дефолтный маршрут: Все остальные запросы временно идут в старый монолит\n    location / {\n        proxy_pass http://legacy_monolith;\n        proxy_set_header Host $host;\n    }\n}", "exampleLang": "nginx", "tools": ["Nginx", "Envoy", "Debezium", "Kong Gateway"], "checklist": ["Новый сервис имеет собственную изолированную БД (нет прямых SQL к монолиту)", "Внедрены корреляционные ID (X-Correlation-ID) для сквозного логирования", "Протестирован план мгновенного отката трафика на монолит при аварии"]}, "11": {"title": "Микросервисы: Разработка gRPC контракта и API Gateway", "goal": "Построение внутренней высокоскоростной шины межсервисного взаимодействия на протоколе gRPC / HTTP/2.", "steps": ["1. Описать интерфейсы взаимодействия сервисов в файле схемы Protobuf (.proto).", "2. Сгенерировать строго типизированные клиентские и серверные классы для нужных языков (Go, Python, Java).", "3. Реализовать серверную обработку методов и клиентские вызовы с таймаутами и повторами (Retries).", "4. Настроить API Gateway для трансляции внешнего REST/JSON трафика во внутренний бинарный gRPC."], "exampleTitle": "Спецификация gRPC сервиса (order_service.proto)", "exampleCode": "syntax = \"proto3\";\n\npackage billing.v1;\noption go_package = \"billing/v1;billingv1\";\n\n// Сервис биллинга и платежей\nservice BillingService {\n  rpc ProcessPayment (PaymentRequest) returns (PaymentResponse);\n  rpc StreamPaymentUpdates (PaymentStatusRequest) returns (stream PaymentStatusUpdate);\n}\n\nmessage PaymentRequest {\n  string order_id = 1;\n  string customer_id = 2;\n  double amount_rub = 3;\n  string payment_method = 4; // SBP, CARD, INVOICE\n}\n\nmessage PaymentResponse {\n  string transaction_id = 1;\n  bool is_success = 2;\n  string error_message = 3;\n  int64 processed_at_timestamp = 4;\n}\n\nmessage PaymentStatusRequest {\n  string transaction_id = 1;\n}\n\nmessage PaymentStatusUpdate {\n  string status = 1; // PENDING, CONFIRMED, REJECTED\n  int32 progress_percent = 2;\n}", "exampleLang": "protobuf", "tools": ["protoc", "gRPC", "Envoy Gateway", "BloomRPC / Postman"], "checklist": ["Схемы .proto версионируются в едином репозитории контрактов", "Установлены жесткие сетевые таймауты (Deadline/Timeout) на все RPC-вызовы", "Включена двусторонняя TLS-аутентификация (mTLS) между микросервисами"]}, "12": {"title": "Событийно-ориентированная архитектура (EDA): Настройка Apache Kafka", "goal": "Асинхронная слабосвязанная интеграция систем через надежный потоковый брокер сообщений.", "steps": ["1. Создать Kafka-топик с нужным числом партиций (для параллельной обработки) и фактором репликации >= 3.", "2. Описать контракт события в формате JSON Schema или Apache Avro.", "3. Настроить Producer с гарантией доставки acks=all для исключения потери данных.", "4. Реализовать Consumer с ручным подтверждением смещения (manual commit) и гарантией идемпотентности."], "exampleTitle": "Идемпотентный Kafka Consumer на Python", "exampleCode": "from confluent_kafka import Consumer\nimport json\n\nconf = {\n    'bootstrap.servers': 'kafka-cluster:9092',\n    'group.id': 'analytics-and-notify-group',\n    'auto.offset.reset': 'earliest',\n    'enable.auto.commit': False # Ручной коммит для гарантии обработки\n}\n\nconsumer = Consumer(conf)\nconsumer.subscribe(['orders.events'])\n\nprocessed_event_ids = set() # Кэш обработанных ID для идемпотентности\n\nwhile True:\n    msg = consumer.poll(timeout=1.0)\n    if msg is None or msg.error():\n        continue\n\n    event = json.loads(msg.value().decode('utf-8'))\n    event_id = event['event_id']\n\n    # Проверка идемпотентности (дедупликация)\n    if event_id not in processed_event_ids:\n        print(f\"Обработка события {event['event_type']} для заказа {event['order_id']}\")\n        # Бизнес-логика: отправка чека, списание остатков со склада...\n        processed_event_ids.add(event_id)\n        \n        # Фиксация смещения только после успешного выполнения логики\n        consumer.commit(msg)", "exampleLang": "python", "tools": ["Apache Kafka", "Kafka UI", "Confluent Schema Registry", "Redpanda"], "checklist": ["Фактор репликации топиков равен минимум 3 для отказоустойчивости", "Обработчики событий идемпотентны (повторная доставка не ломает состояние)", "Настроен Dead Letter Queue (DLQ) для ядовитых/битых сообщений"]}, "13": {"title": "Облачные архитектуры и Serverless: Деплой функции FaaS", "goal": "Развертывание событийно-управляемых бессерверных микросервисов с автоматическим масштабированием до нуля.", "steps": ["1. Разработать функцию, принимающую событие (Event) и контекст (Context) без хранения локального состояния (Stateless).", "2. Описать конфигурацию деплоя в файле serverless.yml (провайдер, триггеры, переменные окружения).", "3. Настроить API Gateway для маршрутизации внешних HTTP-запросов к функции.", "4. Протестировать холодный старт и настроить минимальное количество горячих инстансов при необходимости."], "exampleTitle": "Манифест бессерверной функции (serverless.yml)", "exampleCode": "service: is-pdf-invoice-generator\nframeworkVersion: '3'\n\nprovider:\n  name: aws\n  runtime: python3.11\n  region: eu-central-1\n  memorySize: 512 # Оптимальный объем RAM для CPU-ускорения\n  timeout: 15     # Жесткий таймаут выполнения в секундах\n  environment:\n    S3_BUCKET_NAME: \"company-invoices-vault\"\n\nfunctions:\n  generateInvoice:\n    handler: handler.create_invoice_pdf\n    events:\n      # Триггер по HTTP REST API\n      - http:\n          path: /api/v1/invoices/{orderId}\n          method: post\n          cors: true\n      # Триггер по событию в S3 хранилище\n      - s3:\n          bucket: ${self:provider.environment.S3_BUCKET_NAME}\n          event: s3:ObjectCreated:*", "exampleLang": "yaml", "tools": ["Serverless Framework", "AWS Lambda", "Google Cloud Run", "Yandex Cloud Functions"], "checklist": ["Функция не сохраняет данные на локальный диск контейнера", "Настроены права доступа (IAM Roles) по принципу наименьших привилегий", "Установлены лимиты параллелизма (Concurrency Limits) для защиты БД от перегрузки"]}, "14": {"title": "Моделирование UML: Генерация диаграмм как код (PlantUML)", "goal": "Создание точных архитектурных схем в текстовом формате с версионированием в Git и автогенерацией в CI/CD.", "steps": ["1. Выбрать тип диаграммы под задачу: Sequence для сценариев, Class для ООП-модели, Component для структуры.", "2. Описать участников взаимодействия, синхронные и асинхронные вызовы на языке PlantUML / Mermaid.", "3. Поместить текстовые файлы диаграмм (.puml) в папку docs/architecture/diagrams/.", "4. Настроить автоматический рендеринг диаграмм в PNG/SVG при каждом коммите через GitHub Actions."], "exampleTitle": "Скрипт Sequence диаграммы авторизации (auth_flow.puml)", "exampleCode": "@startuml\nautonumber\nskinparam style strictuml\nactor \"Клиент (SPA)\" as User\nparticipant \"API Gateway\" as GW #cyan\nparticipant \"Auth Service\" as Auth #lightgreen\ndatabase \"Redis (Tokens)\" as Cache #pink\ndatabase \"PostgreSQL\" as DB #lightyellow\n\nUser -> GW: POST /api/v1/auth/login {email, password}\nactivate GW\nGW -> Auth: ValidateCredentials()\nactivate Auth\nAuth -> DB: SELECT password_hash FROM users WHERE email=?\nDB --> Auth: Hash record\nAuth -> Auth: Verify bcrypt(password, hash)\n\nalt Успешная аутентификация\n    Auth -> Cache: SET session:{jwt_id} \"active\" EX 3600\n    Auth --> GW: 200 OK {access_token, refresh_token}\n    GW --> User: 200 OK (JWT Tokens Issued)\nelse Неверный пароль\n    Auth --> GW: 401 Unauthorized\n    GW --> User: 401 Error (\"Invalid credentials\")\nend\ndeactivate Auth\ndeactivate GW\n@enduml", "exampleLang": "plantuml", "tools": ["PlantUML", "Mermaid.js", "Structurizr", "VS Code PlantUML Plugin"], "checklist": ["Диаграммы хранятся в Git в текстовом виде (не бинарные файлы)", "Диаграмма отражает как успешный путь (Happy Path), так и ветви обработки ошибок", "Настроен авторендеринг документации в CI/CD пайплайне"]}, "15": {"title": "Проектирование БД: Нормализация до 3НФ и миграции", "goal": "Разработка реляционной схемы данных без аномалий вставки/удаления с автоматизированными миграциями.", "steps": ["1. Провести нормализацию до 3-й нормальной формы: атомарные поля (1НФ), полная функциональная зависимость от ПК (2НФ), отсутствие транзитивных зависимостей (3НФ).", "2. Описать схему в DDL-скриптах с первичными и внешними ключами (Primary/Foreign Keys) и ограничениями CHECK.", "3. Добавить индексы B-Tree на поля частой фильтрации и соединений (Foreign Keys).", "4. Настроить инструмент миграций (Flyway / Liquibase / Alembic) для предсказуемого наката схем."], "exampleTitle": "Боевой DDL скрипт PostgreSQL с миграцией Flyway (V1__init_schema.sql)", "exampleCode": "-- V1__init_schema.sql: Создание ядра пользователей и заказов (3НФ)\n\nCREATE TABLE departments (\n    id SERIAL PRIMARY KEY,\n    name VARCHAR(120) NOT NULL UNIQUE\n);\n\nCREATE TABLE employees (\n    id BIGSERIAL PRIMARY KEY,\n    department_id INT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,\n    full_name VARCHAR(255) NOT NULL,\n    email VARCHAR(255) NOT NULL UNIQUE,\n    salary NUMERIC(10, 2) NOT NULL CHECK (salary > 0),\n    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\n-- Индекс для ускорения JOIN по внешнему ключу\nCREATE INDEX idx_employees_department ON employees(department_id);\n\n-- Составной индекс для поиска по email и дате создания\nCREATE INDEX idx_employees_search ON employees(email, created_at DESC);", "exampleLang": "sql", "tools": ["PostgreSQL", "Flyway", "Liquibase", "DBeaver", "pgAdmin"], "checklist": ["Схема данных нормализована до 3НФ (нет дублирования текстовых атрибутов)", "На все внешние ключи (FK) созданы индексы для исключения Seq Scan", "Каждая миграция версионируется и содержит скрипт отката (Rollback)"]}, "16": {"title": "Проектирование UI/UX: Атомарная дизайн-система и WCAG", "goal": "Создание консистентного масштабируемого интерфейса на базе дизайн-токенов с доступностью для всех пользователей.", "steps": ["1. Собрать глобальные дизайн-токены (цветовая палитра, типографика, шкала отступов 4px/8px).", "2. Реализовать библиотеку атомарных UI-компонентов (Buttons, Inputs, Cards, Badges) в Storybook.", "3. Проверить контрастность текста и фона по стандарту WCAG 2.1 AA (соотношение контраста >= 4.5:1).", "4. Обеспечить минимальный размер интерактивных элементов для сенсорных экранов (>= 44x44 px)."], "exampleTitle": "Файл дизайн-токенов и адаптивной кнопки (tokens.css)", "exampleCode": "/* Design Tokens: Корпоративная палитра и сетка */\n:root {\n  --color-brand-cyan: #00f2fe;\n  --color-brand-purple: #a855f7;\n  --color-bg-dark: #06080d;\n  --color-surface-glass: rgba(15, 23, 42, 0.85);\n  --font-family-base: 'Plus Jakarta Sans', system-ui, sans-serif;\n  --radius-button: 10px;\n  --touch-target-min: 44px; /* WCAG 2.1 Requirement */\n}\n\n/* Доступный компонент интерактивной кнопки */\n.btn-primary {\n  min-height: var(--touch-target-min);\n  min-width: var(--touch-target-min);\n  padding: 10px 20px;\n  background: linear-gradient(135deg, var(--color-brand-cyan), #4facfe);\n  color: #050811;\n  font-weight: 700;\n  border-radius: var(--radius-button);\n  border: none;\n  cursor: pointer;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  transition: transform 0.2s ease, box-shadow 0.2s ease;\n}\n\n.btn-primary:focus-visible {\n  outline: 3px solid var(--color-brand-purple);\n  outline-offset: 2px;\n}", "exampleLang": "css", "tools": ["Figma", "Storybook", "Lighthouse", "Axe Accessibility"], "checklist": ["Все интерактивные элементы поддерживают управление с клавиатуры (Tab / Enter)", "Размеры интерактивных областей соответствуют сенсорному стандарту (>=44px)", "Цветовой контраст проверен автоматическим тестом Lighthouse"]}, "17": {"title": "Интеграция систем и API: Контракт OpenAPI 3.0 и Swagger", "goal": "Проектирование надежного REST API по подходу API-First с автоматической генерацией документации и моков.", "steps": ["1. Спроектировать контракт API в спецификации OpenAPI 3.0 (YAML) до написания серверного кода.", "2. Описать схемы данных (Schemas), статус-коды ответов (200, 400, 401, 404, 500) и примеры (Examples).", "3. Запустить mock-сервер (Prism) для параллельной разработки фронтенда без ожидания готового бэкенда.", "4. Внедрить автоматическую валидацию входящих запросов по схеме OpenAPI."], "exampleTitle": "Спецификация контракта OpenAPI 3.0 (openapi.yaml)", "exampleCode": "openapi: 3.0.3\ninfo:\n  title: Enterprise Banking Integration API\n  version: 1.0.0\npaths:\n  /api/v1/accounts/{accountId}/transfer:\n    post:\n      summary: Выполнить перевод между счетами\n      security:\n        - BearerJWT: []\n      parameters:\n        - name: accountId\n          in: path\n          required: true\n          schema: { type: string, example: \"acc_99210\" }\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n              type: object\n              required: [targetIban, amountRub]\n              properties:\n                targetIban: { type: string, example: \"RU0204452560040702810\" }\n                amountRub: { type: number, minimum: 1.0, example: 5000.00 }\n      responses:\n        '200':\n          description: Перевод успешно проведён\n          content:\n            application/json:\n              schema:\n                type: object\n                properties:\n                  transactionId: { type: string, example: \"tx_77210\" }\n                  status: { type: string, example: \"COMPLETED\" }\n        '400':\n          description: Ошибка валидации или недостаточно средств", "exampleLang": "yaml", "tools": ["Swagger Editor", "Prism Mock Server", "Postman", "OpenAPI Generator"], "checklist": ["Контракт согласован между командами фронтенда и бэкенда", "Настроена генерация Swagger UI документации в реальном времени", "Все запросы и ответы строго валидируются по JSON Schema"]}, "18": {"title": "Информационная безопасность: Внедрение Security by Design", "goal": "Защита системы от векторов атак из списка OWASP Top-10 и обеспечение соответствия требованиям 152-ФЗ.", "steps": ["1. Реализовать надежное хеширование паролей алгоритмами Argon2id или bcrypt с фактором стоимости >= 12.", "2. Запретить конкатенацию SQL-строк: использовать исключительно параметризованные запросы (Prepared Statements).", "3. Настроить валидацию JWT-токенов с проверкой подписи, срока действия (exp) и аудитории (iss/aud).", "4. Изолировать секреты и API-ключи: использовать HashiCorp Vault или переменные окружения, запретить хранение в коде."], "exampleTitle": "Безопасная аутентификация и параметризованный SQL на Node.js", "exampleCode": "const bcrypt = require('bcrypt');\nconst { Pool } = require('pg');\nconst pool = new Pool();\n\n// 1. Хеширование с защитой от GPU/ASIC перебора\nasync function registerUser(email, plainPassword) {\n    const saltRounds = 12;\n    const passwordHash = await bcrypt.hash(plainPassword, saltRounds);\n\n    // 2. Параметризованный SQL-запрос (100% защита от SQL Injection)\n    const query = 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id';\n    const values = [email, passwordHash];\n    \n    const result = await pool.query(query, values);\n    return result.rows[0].id;\n}\n\n// 3. Безопасная сверка времени выполнения (Constant-time compare)\nasync function verifyLogin(email, inputPassword) {\n    const res = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);\n    if (res.rows.length === 0) return false;\n    \n    return await bcrypt.compare(inputPassword, res.rows[0].password_hash);\n}", "exampleLang": "javascript", "tools": ["HashiCorp Vault", "OWASP ZAP", "SonarQube", "Snyk", "Trivy"], "checklist": ["В репозитории отсутствуют секреты и токены (проверено git-secrets / Gitleaks)", "Все SQL-запросы в проекте параметризованы", "Настроена защита от CSRF, XSS и включены заголовки безопасности (HSTS, CSP)"]}, "19": {"title": "Отказоустойчивость & High Availability: SLA 99.99%", "goal": "Построение инфраструктуры без единых точек отказа с целевым временем восстановления RTO < 5 минут.", "steps": ["1. Исключить Single Points of Failure: настроить N+1 дублирование всех компонентов системы.", "2. Сконфигурировать отказоустойчивый кластер PostgreSQL (Patroni + etcd + HAProxy) с автопереключением мастера.", "3. Внедрить балансировку трафика с проверками работоспособности (Health Checks: Liveness & Readiness).", "4. Регулярно проводить учения по аварийному восстановлению (Disaster Recovery GameDays)."], "exampleTitle": "Конфигурация Health Checks и балансировки в HAProxy", "exampleCode": "global\n    maxconn 50000\n    log /dev/log local0\n\ndefaults\n    mode http\n    timeout connect 5000ms\n    timeout client  50000ms\n    timeout server  50000ms\n\nfrontend http_in\n    bind *:80\n    default_backend app_cluster\n\n# Отказоустойчивый пул серверов с авто-исключением упавших нод\nbackend app_cluster\n    balance roundrobin\n    option httpchk GET /healthz\n    http-check expect status 200\n    server app01 10.0.1.11:8000 check inter 2000ms fall 3 rise 2\n    server app02 10.0.1.12:8000 check inter 2000ms fall 3 rise 2\n    server app03 10.0.1.13:8000 check inter 2000ms fall 3 rise 2 backup", "exampleLang": "haproxy", "tools": ["HAProxy", "Patroni", "Keepalived", "Prometheus", "Chaos Mesh"], "checklist": ["Кластер СУБД автоматически переключает мастера за время < 30 секунд", "Балансировщик мгновенно снимает трафик с вышедших из строя узлов", "Регламент Disaster Recovery протестирован на реальном стенде"]}, "20": {"title": "CASE-средства: Настройка стека системного архитектора", "goal": "Автоматизация рутинных задач архитектора через современные инструменты моделирования и линтинга.", "steps": ["1. Развернуть единый архитектурный репозиторий с поддержкой текстовых диаграмм (Architecture as Code).", "2. Интегрировать архитектурный линтер (ArchUnit) в модульные тесты для контроля чистоты слоев.", "3. Настроить Swagger UI и ReDoc для автоматического обновления документации при изменениях в коде.", "4. Организовать синхронизацию между моделями данных и реальными DDL-миграциями СУБД."], "exampleTitle": "Архитектурный тест на чистоту слоев (ArchUnit на Java)", "exampleCode": "package com.company.architecture;\n\nimport com.tngtech.archunit.junit.AnalyzeClasses;\nimport com.tngtech.archunit.junit.ArchTest;\nimport com.tngtech.archunit.lang.ArchRule;\nimport static com.tngtech.archunit.library.Architectures.layeredArchitecture;\n\n@AnalyzeClasses(packages = \"com.company.core\")\npublic class ArchitectureLayersTest {\n\n    // Жесткое правило: Контроллеры не имеют права вызывать Репозитории минуя Сервисы!\n    @ArchTest\n    public static final ArchRule layered_architecture_respected = layeredArchitecture()\n        .consideringAllDependencies()\n        .layer(\"Controller\").definedBy(\"..controllers..\")\n        .layer(\"Service\").definedBy(\"..services..\")\n        .layer(\"Repository\").definedBy(\"..repositories..\")\n\n        .whereLayer(\"Controller\").mayNotBeAccessedByAnyLayer()\n        .whereLayer(\"Service\").mayOnlyBeAccessedByLayers(\"Controller\")\n        .whereLayer(\"Repository\").mayOnlyBeAccessedByLayers(\"Service\");\n}", "exampleLang": "java", "tools": ["ArchUnit", "Enterprise Architect", "PlantUML", "Postman", "Figma"], "checklist": ["Архитектурные правила проверяются при каждой сборке проекта", "Документация API генерируется автоматически из аннотаций в коде", "Схемы архитектуры синхронизированы с актуальной кодовой базой"]}, "21": {"title": "Документирование ИС: Написание Architecture Decision Records (ADR)", "goal": "Фиксация ключевых инженерных решений в формате MADR прямо в Git для сохранения контекста проекта.", "steps": ["1. Создать в репозитории каталог docs/architecture/decisions/.", "2. Принимать каждое важное решение (выбор СУБД, языка, брокера) через оформление файла ADR-XXX.md.", "3. Описывать 4 обязательных блока: Контекст, Рассмотренные альтернативы, Решение, Последствия.", "4. Проводить обсуждение ADR через стандартный механизм Pull Request с рецензированием коллегами."], "exampleTitle": "Пример реального архитектурного решения (docs/decisions/004-db-choice.md)", "exampleCode": "# ADR 004: Выбор PostgreSQL вместо NoSQL для биллинговой подсистемы\n\n## Статус\nПринято (Accepted) — 2026-11-19\n\n## Контекст и проблема\nПодсистеме биллинга требуется СУБД для обработки финансовых транзакций. \nГлавные требования: 100% гарантия отсутствия потери баланса при сбоях (ACID) и строгие внешние ключи.\n\n## Рассмотренные варианты\n1. PostgreSQL 16 (Реляционная, строгий ACID, богатая экосистема)\n2. MongoDB 7.0 (Документная, гибкая схема, слабая поддержка кросс-коллекционных транзакций)\n\n## Принятое решение\nВыбран **PostgreSQL 16**, так как финансовая целостность и надежность транзакций критически важны для бизнеса.\n\n## Последствия\n- Положительные: Гарантия согласованности финансовых данных (ACID), исключены дубли списаний.\n- Отрицательные: Любые изменения схемы требуют написания миграций Flyway/Liquibase.", "exampleLang": "markdown", "tools": ["MADR Template", "Structurizr (C4 Model)", "Git", "MkDocs"], "checklist": ["Все критические технологические выборы оформлены в виде принятых ADR", "ADR хранятся в Git рядом с исходным кодом", "Решения согласованы ключевыми экспертами через Pull Request"]}, "22": {"title": "CI/CD: Построение боевого пайплайна развертывания", "goal": "Автоматизация пути каждого коммита от тестирования до публикации в Kubernetes кластер без ручных операций.", "steps": ["1. Настроить запуск тестов и линтеров на каждый Pull Request.", "2. Реализовать многоэтапную сборку минималистичного Docker-образа (Multi-stage build).", "3. Запустить автоматическое сканирование уязвимостей в контейнере через Trivy.", "4. Настроить релиз в Production методом GitOps (ArgoCD) или rolling-update без простоя."], "exampleTitle": "Боевой pipeline GitHub Actions (.github/workflows/ci-cd.yml)", "exampleCode": "name: Production CI/CD Pipeline\n\non:\n  push:\n    branches: [main]\n\njobs:\n  test_and_lint:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with: { python-version: '3.12' }\n      - run: pip install -r requirements.txt && pytest tests/ --cov=app\n\n  docker_build_and_scan:\n    needs: test_and_lint\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - name: Build Docker Image\n        run: docker build -t myapp:${{ github.sha }} .\n      - name: Run Trivy Security Scan\n        uses: aquasecurity/trivy-action@master\n        with:\n          image-ref: 'myapp:${{ github.sha }}'\n          severity: 'CRITICAL,HIGH'\n          exit-code: '1' # Прерывать сборку при наличии критических дыр\n\n  deploy_to_k8s:\n    needs: docker_build_and_scan\n    runs-on: ubuntu-latest\n    steps:\n      - name: Rolling Update Deployment\n        run: |\n          kubectl set image deployment/app-deployment core-app=myapp:${{ github.sha }} --record\n          kubectl rollout status deployment/app-deployment --timeout=120s", "exampleLang": "yaml", "tools": ["GitHub Actions", "Docker", "Trivy", "Kubernetes", "ArgoCD"], "checklist": ["Сборка прерывается при падении любого unit или security теста", "Развертывание происходит без перерыва в обслуживании (Zero Downtime)", "Настроен автоматический откат (Rollback) при ошибках старта подов"]}, "23": {"title": "Оценка затрат: Расчёт бюджета и трудоемкости по COCOMO II", "goal": "Обоснованный расчет человеко-месяцев, стоимости владения (TCO) и календарного графика проекта.", "steps": ["1. Оценить объем кодовой базы в KSLOC (тысячах строк кода) или Story Points.", "2. Применить базовую или расширенную формулу модели COCOMO II для расчета трудоемкости.", "3. Рассчитать CAPEX (серверы, лицензии) и ежемесячный OPEX (облака, подписки, ФОТ команды).", "4. Добавить буфер на непредвиденные риски (15-25% от итоговой сметы)."], "exampleTitle": "Калькулятор трудоемкости проекта по модели COCOMO на Python", "exampleCode": "def calculate_cocomo_metrics(ksloc, hourly_rate_rub=2500):\n    # Коэффициенты модели COCOMO (Semi-detached project)\n    a, b, c, d = 3.0, 1.12, 2.5, 0.35\n    \n    # 1. Трудоемкость в человеко-месяцах\n    person_months = a * (ksloc ** b)\n    \n    # 2. Оптимальный календарный срок разработки в месяцах\n    dev_time_months = c * (person_months ** d)\n    \n    # 3. Рекомендуемый размер команды\n    avg_staff = person_months / dev_time_months\n    \n    # 4. Расчет ФОТ (1 чел-месяц = 160 часов)\n    total_cost_rub = person_months * 160 * hourly_rate_rub\n\n    return {\n        \"Код (KSLOC)\": ksloc,\n        \"Трудоемкость (чел-мес)\": round(person_months, 1),\n        \"Календарный срок (мес)\": round(dev_time_months, 1),\n        \"Размер команды (инженеров)\": round(avg_staff, 1),\n        \"Бюджет ФОТ (руб)\": f\"{int(total_cost_rub):,} руб.\"\n    }\n\n# Пример расчета проекта на 45,000 строк кода\nprint(calculate_cocomo_metrics(ksloc=45))", "exampleLang": "python", "tools": ["COCOMO II", "Planning Poker", "Google Sheets / Excel", "Jira Portfolio"], "checklist": ["Смета разделена на капитальные (CAPEX) и операционные (OPEX) затраты", "Учтены затраты на инфраструктуру, лицензии и фонд оплаты труда", "В календарный план заложен буфер на риски и стабилизацию"]}, "24": {"title": "Практический кейс E-Commerce: Сквозная реализация платформы", "goal": "Развертывание высоконагруженного интернет-магазина от архитектуры микросервисов до продакшна в Kubernetes.", "steps": ["1. Развернуть отказоустойчивый кластер Kubernetes с NGINX Ingress Controller.", "2. Подключить Redis Cluster для молниеносного кэширования витрины товаров (отклик < 15 мс).", "3. Настроить очередь сообщений Kafka для обработки платежей и уведомлений покупателей.", "4. Внедрить дашборды Prometheus & Grafana для сквозного контроля SLA и бизнес-метрик конверсии."], "exampleTitle": "Kubernetes Deployment манифест микросервиса каталога товаров", "exampleCode": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: catalog-service\n  namespace: ecommerce-prod\nspec:\n  replicas: 4\n  strategy:\n    rollingUpdate:\n      maxSurge: 1\n      maxUnavailable: 0\n  selector:\n    matchLabels:\n      app: catalog\n  template:\n    metadata:\n      labels:\n        app: catalog\n    spec:\n      containers:\n      - name: catalog-app\n        image: cr.company.com/ecommerce/catalog:v2.4.1\n        ports:\n        - containerPort: 8080\n        resources:\n          limits: { cpu: \"1000m\", memory: \"1Gi\" }\n          requests: { cpu: \"200m\", memory: \"256Mi\" }\n        readinessProbe:\n          httpGet: { path: /healthz, port: 8080 }\n          initialDelaySeconds: 5\n          periodSeconds: 5", "exampleLang": "yaml", "tools": ["Kubernetes", "Helm", "Redis Cluster", "Kafka", "PostgreSQL", "Grafana"], "checklist": ["Система выдерживает нагрузку свыше 5000 запросов в секунду (проверено k6/JMeter)", "Кэш витрины снижает нагрузку на реляционную БД на 85%", "Настроены автоматические алерты в Telegram/PagerDuty при падении SLA"]}, "25": {"title": "Тренды: Внедрение ИИ-агента и архитектуры RAG", "goal": "Интеграция искусственного интеллекта с корпоративными базами знаний через Retrieval-Augmented Generation.", "steps": ["1. Разбить корпоративную документацию (ТЗ, регламенты, инструкции) на текстовые фрагменты (Chunks).", "2. Преобразовать чанки в числовые векторы с помощью Embedding модели и сохранить в векторную БД (pgvector).", "3. При вопросе пользователя находить семантически похожие фрагменты документов (Cosine Distance).", "4. Передавать найденный контекст в Большую Языковую Модель (LLM) для формирования гарантированно точного ответа."], "exampleTitle": "Реализация RAG-пайплайна корпоративного ассистента на Python", "exampleCode": "import openai\nimport psycopg2\nfrom pgvector.psycopg2 import register_vector\n\n# 1. Поиск релевантного контекста в векторной базе PostgreSQL (pgvector)\ndef query_rag_assistant(user_question):\n    # Генерация эмбеддинга вопроса\n    emb_res = openai.embeddings.create(input=user_question, model=\"text-embedding-3-small\")\n    q_vector = emb_res.data[0].embedding\n\n    conn = psycopg2.connect(\"dbname=knowledge_db user=ai_user password=secret host=localhost\")\n    register_vector(conn)\n    cur = conn.cursor()\n\n    # Поиск топ-3 ближайших фрагментов корпоративной базы знаний\n    cur.execute(\"SELECT content FROM kb_chunks ORDER BY embedding <=> %s LIMIT 3;\", (q_vector,))\n    chunks = [row[0] for row in cur.fetchall()]\n    context = \"\\n---\\n\".join(chunks)\n\n    # 2. Запрос к LLM со строгой опорой на найденный контекст\n    prompt = f\"Контекст из корпоративных регламентов:\\n{context}\\n\\nВопрос: {user_question}\\nОтвет:\"\n    response = openai.chat.completions.create(\n        model=\"gpt-4o\",\n        messages=[{\"role\": \"user\", \"content\": prompt}],\n        temperature=0.1 # Минимальная температура для исключения галлюцинаций\n    )\n    return response.choices[0].message.content", "exampleLang": "python", "tools": ["pgvector", "LangChain / LlamaIndex", "Qdrant", "OpenAI / Local LLM (Ollama)"], "checklist": ["ИИ отвечает строго по предоставленному контексту со ссылками на пункты документов", "Конфиденциальные данные компании не передаются во внешние облачные сервисы без шифрования", "Скорость генерации ответа пользователю не превышает 2 секунд"]}, "26": {"title": "Выводы: Защита проекта и сдача в промышленную эксплуатацию", "goal": "Финальная приёмка архитектурного проекта заказчиком, подписание актов и ввод ИС в промышленный контур.", "steps": ["1. Сформировать полный приёмо-сдаточный комплект документации по ГОСТ 34 (ТЗ, ПМИ, Паспорт системы).", "2. Провести демонстрационные приёмочные испытания (User Acceptance Testing) в присутствии комиссии.", "3. Зафиксировать соответствие всем целевым метрикам SLA, безопасности и скорости отклика.", "4. Подписать акт ввода в промышленную эксплуатацию и передать систему на сопровождение линии 24/7."], "exampleTitle": "Итоговый приёмочный протокол и чек-лист готовности системы к вводу", "exampleCode": "# Протокол готовности ИС к вводу в промышленную эксплуатацию\n\n## 1. Результаты приёмочных испытаний\n- Функциональные требования ТЗ (ГОСТ 34.602): 100% выполнено (24 из 24 сценариев)\n- Нагрузочное тестирование: Система стабильна при пике 5,000 RPS (Response Time p95 < 120ms)\n- Аудит безопасности (SAST/DAST): 0 критических (Critical) и высоких (High) уязвимостей\n- Инфраструктура: Протестировано аварийное переключение резервного кластера (RTO = 38 сек)\n\n## 2. Эксплуатационная готовность\n- [x] Развёрнут круглосуточный мониторинг (Prometheus + Grafana + Alertmanager)\n- [x] Утвержден регламент резервного копирования (ежечасно инкремент, ежедневно Full)\n- [x] Персонал заказчика прошел обучение по инструкциям пользователей и администратора\n\nЗАКЛЮЧЕНИЕ: Информационная система готова к промышленной эксплуатации 24/7.", "exampleLang": "markdown", "tools": ["Allure Report", "ПМИ (ГОСТ 34.603)", "Confluence", "Jira Service Management"], "checklist": ["Акт приёмо-сдаточных испытаний подписан председателем комиссии", "Все выявленные дефекты устранены или зафиксированы в гарантийных обязательствах", "Система поставлена на техническую поддержку и мониторинг"]}};
  const modalGuide = document.getElementById('modal-guide');
  const modalGuideTitle = document.getElementById('modal-guide-title');
  const modalGuideBody = document.getElementById('modal-guide-body');
  }

  function populateGuideModal(slideNum) {
    const guide = IMPLEMENTATION_GUIDES[slideNum] || {
      title: "Слайд " + slideNum + ": Практическая инструкция",
      goal: "Реализация архитектурных принципов на практике.",
      steps: ["Изучите теоретическую модель", "Спланируйте архитектуру", "Реализуйте компоненты", "Проверьте качество"],
      exampleTitle: "Шаблон реализации",
      exampleCode: "// Пример кода для данного слайда",
      exampleLang: "text",
      tools: ["Git", "Docker"],
      checklist: ["Архитектура проверена", "Тесты пройдены"]
    };

    if (modalGuideTitle) {
      modalGuideTitle.innerHTML = '<i class="fa-solid fa-screwdriver-wrench text-accent"></i> Слайд ' + String(slideNum).padStart(2, '0') + ': ' + guide.title;
    }

    if (!modalGuideBody) return;

    let stepsHtml = '';
    guide.steps.forEach((step, idx) => {
      stepsHtml += `
        <div class="guide-step-card">
          <div class="guide-step-num">${idx + 1}</div>
          <div>${step.replace(/^[0-9]+\.\s*/, '')}</div>
        </div>
      `;
    });

    let toolsHtml = '';
    guide.tools.forEach(tool => {
      toolsHtml += `<span class="guide-chip"><i class="fa-solid fa-cube"></i> ${tool}</span>`;
    });

    let checklistHtml = '';
    guide.checklist.forEach(item => {
      checklistHtml += `
        <div class="guide-check-item">
          <i class="fa-solid fa-circle-check"></i>
          <span>${item}</span>
        </div>
      `;
    });

    modalGuideBody.innerHTML = `
      <div class="guide-goal-card">
        <h4><i class="fa-solid fa-bullseye"></i> Цель реализации</h4>
        <p>${guide.goal}</p>
      </div>

      <div class="guide-section-title">
        <i class="fa-solid fa-list-check text-cyan"></i> Пошаговая инструкция (Как применить)
      </div>
      <div class="guide-steps-list">
        ${stepsHtml}
      </div>

      <div class="guide-section-title">
        <i class="fa-solid fa-code text-cyan"></i> Практический пример: ${guide.exampleTitle}
      </div>
      <div class="guide-code-box">
        <div class="guide-code-header">
          <div class="guide-code-title">
            <i class="fa-solid fa-file-code"></i> ${guide.exampleLang.toUpperCase()}
          </div>
          <button class="guide-copy-btn" onclick="Presentation.copyGuideCode(this)" type="button">
            <i class="fa-regular fa-copy"></i> Скопировать шаблон
          </button>
        </div>
        <pre class="guide-code-content">${guide.exampleCode.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
      </div>

      <div class="guide-section-title">
        <i class="fa-solid fa-toolbox text-cyan"></i> Рекомендуемые инструменты и стек
      </div>
      <div class="guide-tools-chips">
        ${toolsHtml}
      </div>

      <div class="guide-section-title">
        <i class="fa-solid fa-clipboard-check text-emerald"></i> Чек-лист Definition of Done (Готовность)
      </div>
      <div class="guide-checklist">
        ${checklistHtml}
      </div>
    `;
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
