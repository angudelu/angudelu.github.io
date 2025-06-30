window.addEventListener('resize', handleResponsiveHeading);
window.addEventListener('DOMContentLoaded', handleResponsiveHeading);
window.addEventListener('orientationchange', handleResponsiveHeading);

function handleResponsiveHeading() {
    const heading = document.querySelector('h1');
    const centerTop = document.querySelector('.center-top');
    const left = document.querySelector('.left');
    const right = document.querySelector('.right');
    const center = document.querySelector('.center');
    const backgroundSplit = document.querySelector('.background-split');
    // Use only orientation, not size
    let isPortrait = false;
    if (window.screen && window.screen.orientation && window.screen.orientation.type) {
        isPortrait = window.screen.orientation.type.startsWith('portrait');
    } else {
        isPortrait = window.innerHeight > window.innerWidth;
    }
    if (isPortrait) {
        if (heading) heading.style.color = '#fff';
        if (centerTop) centerTop.style.background = '#003366'; // dark blue
        if (left) left.style.display = 'none';
        if (right) right.style.display = 'none';
        if (center) center.style.height = '100vh'; // fill all space
        if (backgroundSplit) backgroundSplit.style.height = '100vh';
        document.body.style.height = '100vh';
        document.documentElement.style.height = '100vh';
        document.body.style.overflow = 'hidden';
    } else {
        if (heading) heading.style.color = '#fff';
        if (centerTop) centerTop.style.background = '#a67c00';
        if (left) left.style.display = '';
        if (right) right.style.display = '';
        if (center) center.style.height = '';
        if (backgroundSplit) backgroundSplit.style.height = '100vh';
        document.body.style.height = '';
        document.documentElement.style.height = '';
        document.body.style.overflow = '';
    }
}

// Remove visited button tracking

// Reproducir música y quitar overlay al hacer clic
window.addEventListener('DOMContentLoaded', function() {
    var overlay = document.getElementById('click-overlay');
    function enterSite() {
        var audio = document.getElementById('bg-music');
        if (audio && audio.paused) {
            audio.play();
        }
        if (overlay) {
            overlay.style.opacity = '0';
            setTimeout(function() {
                overlay.style.display = 'none';
            }, 1000); // Espera a que termine la transición
        }
        document.removeEventListener('click', enterSite);
    }
    document.addEventListener('click', enterSite);
});

// --- OJOS PESTAÑEANDO AUTOMÁTICAMENTE ---
// Añade listeners para mantener el ojo cerrado en hover
window.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.eye-link img').forEach(eye => {
        eye.addEventListener('mouseover', function() {
            this.src = 'closedeye.png';
            this.dataset.closedHover = 'true';
        });
        eye.addEventListener('mouseout', function() {
            this.src = 'eye.webp';
            this.dataset.closedHover = '';
        });
    });
});

function doBlink(times, cb) {
    if (times <= 0) {
        if (cb) cb();
        return;
    }
    const eyes = document.querySelectorAll('.eye-link img');
    // Cierra todos los ojos que no estén en hover
    eyes.forEach(eye => {
        if (eye.src.includes('eye.webp') && !eye.dataset.closedHover) {
            eye.src = 'closedeye.png';
        }
    });
    setTimeout(() => {
        // Abre todos los ojos que no estén en hover
        eyes.forEach(eye => {
            if (eye.src.includes('closedeye.png') && !eye.dataset.closedHover) {
                eye.src = 'eye.webp';
            }
        });
        setTimeout(() => doBlink(times - 1, cb), 120);
    }, 180);
}

function blinkEyes() {
    // Probabilidades: 60% doble, 30% simple, 10% triple
    const rand = Math.random();
    let blinkCount = 2;
    if (rand < 0.3) blinkCount = 1;
    else if (rand > 0.9) blinkCount = 3;
    doBlink(blinkCount, () => {
        // Siempre espera entre 5 y 15 segundos después de cada secuencia
        const nextBlink = 5000 + Math.random() * 10000;
        setTimeout(blinkEyes, nextBlink);
    });
}

window.addEventListener('DOMContentLoaded', function() {
    setTimeout(blinkEyes, 2000 + Math.random() * 3000); // Primer parpadeo aleatorio
});
