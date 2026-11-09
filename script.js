/**
 * ПРОЕКТИРОВАНИЕ ИНФОРМАЦИОННЫХ СИСТЕМ
 * Презентационный движок: навигация, интерактив, звук и холст
 */

const Presentation = (() => {
  // State
  let currentSlide = 1;
  const totalSlides = 26;
  let soundEnabled = true;
  let timerSeconds = 0;
  let timerInterval = null;
  let isFullscreen = false;

  // DOM Elements
  const slides = document.querySelectorAll('.slide');
  const counterCurrent = document.getElementById('counter-current');
  const topicTitle = document.getElementById('current-slide-topic');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const dockDotsContainer = document.getElementById('dock-dots-container');
  const timerBadge = document.getElementById('presentation-timer');
  const btnSound = document.getElementById('btn-sound');
  const btnFullscreen = document.getElementById('btn-fullscreen');

  // Modals
  const modalOverview = document.getElementById('modal-overview');
  const modalVideo = document.getElementById('modal-video');
  const modalDeploy = document.getElementById('modal-deploy');
  const modalHelp = document.getElementById('modal-help');
  const thumbnailGrid = document.getElementById('thumbnail-grid');

  // Audio Context (Synthesized sounds without external mp3s)
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
    playTone(520, 'sine', 0.06, 0.04);
    setTimeout(() => playTone(680, 'sine', 0.08, 0.03), 40);
  }

  function playSuccessSound() {
    playTone(440, 'triangle', 0.08, 0.05);
    setTimeout(() => playTone(880, 'triangle', 0.12, 0.04), 80);
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

  // Populate Dock Dots (1 to 26)
  function initDockDots() {
    if (!dockDotsContainer) return;
    dockDotsContainer.innerHTML = '';
    for (let i = 1; i <= totalSlides; i++) {
      const dot = document.createElement('button');
      dot.className = `dock-dot ${i === 1 ? 'active' : ''}`;
      dot.setAttribute('data-target-slide', i);
      dot.setAttribute('title', `Перейти к слайду ${i}`);
      dot.textContent = i;
      dot.addEventListener('click', () => goToSlide(i));
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
      card.addEventListener('click', () => {
        goToSlide(num);
        toggleOverviewModal(false);
      });
      thumbnailGrid.appendChild(card);
    });
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
    }

    currentSlide = targetSlide;
    playSlideSound();
    updateUI();
  }

  function nextSlide() {
    if (currentSlide < totalSlides) {
      goToSlide(currentSlide + 1);
    } else {
      // Reached the end
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
    // Counter
    if (counterCurrent) {
      counterCurrent.textContent = String(currentSlide).padStart(2, '0');
    }

    // Active slide topic
    const activeSlide = document.querySelector(`.slide[data-slide="${currentSlide}"]`);
    if (activeSlide && topicTitle) {
      topicTitle.textContent = activeSlide.getAttribute('data-topic') || '';
    }

    // Progress bar
    if (progressBarFill) {
      const pct = (currentSlide / totalSlides) * 100;
      progressBarFill.style.width = `${pct}%`;
    }

    // Dock dots
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

    // Overview modal active thumb
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

  function switchDeployTab(tabName) {
    const buttons = document.querySelectorAll('.deploy-methods-tabs .tab-btn');
    const contents = document.querySelectorAll('.deploy-methods-tabs .tab-content');

    buttons.forEach(btn => btn.classList.remove('active'));
    contents.forEach(content => content.classList.remove('active'));

    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) activeContent.classList.add('active');

    const clickedBtn = Array.from(buttons).find(b => b.textContent.toLowerCase().includes(tabName));
    if (clickedBtn) clickedBtn.classList.add('active');
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

  // Keyboard navigation
  function setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Ignore if typing inside input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ': // Space
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
        case 'а': // Russian layout support
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

        case '?':
          toggleHelpModal();
          break;

        case 'Escape':
          closeAllModals();
          break;
      }
    });
  }

  // Touch Swipe for Mobile / Tablets
  function setupTouchSwipes() {
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    window.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      touchEndX = e.changedTouches[0].screenX;
      handleSwipe();
    }, { passive: true });

    function handleSwipe() {
      const diff = touchEndX - touchStartX;
      if (Math.abs(diff) > minSwipeDistance) {
        if (diff < 0) {
          nextSlide(); // Swiped left -> next
        } else {
          prevSlide(); // Swiped right -> prev
        }
      }
    }
  }

  // Background Interactive Network Particles Canvas
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

    const particles = [];
    const count = Math.min(Math.floor((width * height) / 16000), 70);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
        color: Math.random() > 0.5 ? 'rgba(0, 242, 254, ' : 'rgba(99, 102, 241, '
      });
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.15;
            ctx.strokeStyle = `rgba(0, 242, 254, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw and update particles
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

    animate();
  }

  // Setup Event Listeners
  function initListeners() {
    // Dock buttons
    const btnPrev = document.getElementById('dock-btn-prev');
    const btnNext = document.getElementById('dock-btn-next');
    if (btnPrev) btnPrev.addEventListener('click', prevSlide);
    if (btnNext) btnNext.addEventListener('click', nextSlide);

    // Nav buttons
    if (btnSound) btnSound.addEventListener('click', toggleSound);
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);

    const btnOverview = document.getElementById('btn-overview');
    if (btnOverview) btnOverview.addEventListener('click', () => toggleOverviewModal());

    const btnVideo = document.getElementById('btn-video');
    if (btnVideo) btnVideo.addEventListener('click', () => toggleVideoModal());

    const btnHelp = document.getElementById('btn-help');
    if (btnHelp) btnHelp.addEventListener('click', () => toggleHelpModal());

    const btnDeploy = document.getElementById('btn-deploy');
    if (btnDeploy) btnDeploy.addEventListener('click', () => toggleDeployModal());

    // Close modal on background click
    [modalOverview, modalVideo, modalDeploy, modalHelp].forEach(m => {
      if (m) {
        m.addEventListener('click', (e) => {
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
    setupTouchSwipes();
    initListeners();
    initCanvasAnimation();
    startTimer();
    updateUI();
  }

  // Public API
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
    switchDeployTab
  };
})();

// Boot on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  Presentation.init();
});
