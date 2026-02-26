(function() {
  'use strict';

  // OS Detection
  var ua = navigator.userAgent || '';
  var platform = navigator.platform || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/.test(ua);
  var isWindows = /Windows/.test(ua);
  var isMac = /Macintosh/.test(ua) && navigator.maxTouchPoints <= 1;

  // Device type detection
  var isMobile = /Mobi|Android.*Mobile|iPhone|iPod/.test(ua);
  var isTablet = !isMobile && (/iPad|Android|Tablet/.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  // Apply OS class to document root
  var root = document.documentElement;
  if (isIOS) root.classList.add('os-ios');
  else if (isAndroid) root.classList.add('os-android');
  else if (isWindows) root.classList.add('os-windows');
  else if (isMac) root.classList.add('os-mac');

  // Apply device type class
  if (isMobile) root.classList.add('device-mobile');
  else if (isTablet) root.classList.add('device-tablet');
  else root.classList.add('device-desktop');

  if (isTouch) root.classList.add('has-touch');

  // iOS viewport height fix (addresses 100vh issue)
  function setVH() {
    var vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }

  if (isIOS || isAndroid) {
    setVH();
    window.addEventListener('resize', setVH);
    window.addEventListener('orientationchange', function() {
      setTimeout(setVH, 100);
    });
  }

  // Prevent iOS zoom on input focus (font-size already handled in CSS)
  // Handled via CSS: font-size: 16px on inputs for touch devices

  // Enhanced mobile nav behavior
  function initMobileNav() {
    var navToggle = document.getElementById('navToggle');
    var navLinks = document.getElementById('navLinks');
    if (!navToggle || !navLinks) return;

    // Create overlay
    var overlay = document.createElement('div');
    overlay.className = 'nav-overlay';
    overlay.id = 'navOverlay';
    document.body.appendChild(overlay);

    // Create close button inside nav
    var closeBtn = document.createElement('button');
    closeBtn.className = 'nav-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.setAttribute('aria-label', 'Close navigation');
    navLinks.insertBefore(closeBtn, navLinks.firstChild);

    function openNav() {
      navLinks.classList.add('open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeNav() {
      navLinks.classList.remove('open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    // Replace navToggle to remove any existing inline handlers
    var newToggle = navToggle.cloneNode(true);
    navToggle.parentNode.replaceChild(newToggle, navToggle);

    newToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      if (navLinks.classList.contains('open')) {
        closeNav();
      } else {
        openNav();
      }
    });

    // Close on overlay click
    overlay.addEventListener('click', closeNav);

    // Close button
    closeBtn.addEventListener('click', closeNav);

    // Close when nav link is clicked
    var links = navLinks.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', closeNav);
    }

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && navLinks.classList.contains('open')) {
        closeNav();
      }
    });
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
