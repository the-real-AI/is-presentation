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

  function launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.id = 'confetti-canvas';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    confettiParticles = [];
    const colors = ['#00f2fe', '#4facfe', '#10b981', '#f59e0b', '#f43f5e', '#a855f7'];

    for (let i = 0; i < 90; i++) {
      confettiParticles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.7,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 14 - 6,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
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
        p.opacity -= 0.009;

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
        if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
    }

    animateConfetti();
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

    if (currentSlide === 26) {
      playSuccessSound();
      launchConfetti();
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

  let laserTrail = [];
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

    function addLaserPoint(x, y) {
      laserTrail.push({
        x,
        y,
        life: 1.0,
        radius: 8
      });
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
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (laserTrail.length > 0) {
        for (let i = laserTrail.length - 1; i >= 0; i--) {
          const pt = laserTrail[i];
          pt.life -= 0.025; // fade over ~1 sec

          if (pt.life <= 0) {
            laserTrail.splice(i, 1);
          } else {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00f2fe';
            ctx.fillStyle = `rgba(0, 242, 254, ${pt.life})`;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.radius * pt.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      requestAnimationFrame(renderLaser);
    }

    renderLaser();
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

  // Interactive Background Canvas with Shockwaves
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
      shockwaves.push({
        x: e.clientX,
        y: e.clientY,
        radius: 6,
        maxRadius: 110,
        opacity: 0.65
      });
    });

    const particles = [];
    const count = Math.min(Math.floor((width * height) / 14000), 75);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        radius: Math.random() * 2 + 1,
        color: Math.random() > 0.4 ? 'rgba(0, 242, 254, ' : 'rgba(99, 102, 241, '
      });
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);

      // Draw shockwaves
      for (let s = shockwaves.length - 1; s >= 0; s--) {
        const sw = shockwaves[s];
        sw.radius += 4;
        sw.opacity -= 0.022;

        if (sw.opacity <= 0 || sw.radius >= sw.maxRadius) {
          shockwaves.splice(s, 1);
        } else {
          ctx.strokeStyle = `rgba(0, 242, 254, ${sw.opacity})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 135) {
            const alpha = (1 - dist / 135) * 0.18;
            ctx.strokeStyle = `rgba(0, 242, 254, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = p.color + '0.7)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      requestAnimationFrame(animate);
    }

    animate();
  }

  // Interactive Widgets (Failover simulation & API click)
  function initInteractiveWidgets() {
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
    toggleLaserMode
  };
})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  Presentation.init();
});
