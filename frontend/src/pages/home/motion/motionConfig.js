// The approved demo's tuning lives here; no copy, DOM selectors or API calls.
export const HOME_MOTION = {
  desktopWidth: 1024,
  minimumHeight: 650,
  gallerySpeed: 420,
  idleSnapDelay: 140,
  idleSnapSpeed: 360,
  gestureGap: 240,
  notchThreshold: 40,
  pixelsPerNotch: 120,
  wheelSensitivity: 3,
  chapterHold: 24,
  chapterGap: 96,
  minimumSlideTravel: 440,
  slideTravelRatio: .68,
  contextGap: { min: 88, max: 140, ratio: .11 },
  coverflow: { rotate: 27, stretch: 0, depth: 130, scale: .9, modifier: 1, slideShadows: false },
  chapter: { entrance: 420, exit: 180, distance: 40, exitDistance: 32 },
  scene: { entrance: 380, exit: 180, distance: 28, exitDistance: 24 },
  sections: { entryTravel: .95, heroTravel: .55, copyStart: .65, exitTravel: .65, duration: 620, heroDistance: 100, exitDistance: 76, foundationDistance: 96 },
  snap: { duration: 480, idleDelay: 180, radius: .28, smallRadius: .14, minimumRadius: 80, maximumRadius: 280, navigationGuard: 800 },
  heroBackdrop: { rotateX: 36, rotateY: 16, rotateZ: -14, columns: 6, perspective: 5200, cycle: 180, speed: 8, parallax: 1.6, response: 110 },
  easing: 'cubic-bezier(.22,1,.36,1)',
};

export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
