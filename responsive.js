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
