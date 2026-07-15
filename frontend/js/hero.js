// hero.js — ambient drifting shapes + hero entrance
// Shapes drift very slowly (30-45s loops) using GSAP

function initHero(meta) {
  // Populate dynamic meta in hero stat strip if API loaded
  if (meta) {
    const totalEl = $('#hero-stat-funds');
    const accEl   = $('#hero-stat-accuracy');
    if (totalEl) totalEl.textContent = (meta.total_funds || 0).toLocaleString('en-IN');
    if (accEl && meta.classifier_accuracy != null)
      accEl.textContent = (meta.classifier_accuracy * 100).toFixed(1) + '%';
  }

  // Entrance: headline, subhead, button
  enterElements($$('.hero-entrance'), { stagger: 0.08, y: 32, delay: 0.15 });

  if (reduced) return;

  // Ambient drift — each shape gets a unique, very slow looping animation
  const shapes = $$('.hero-shape');
  shapes.forEach((shape, i) => {
    const dur  = 30 + i * 5;           // 30, 35, 40, 45s
    const xAmp = 25 + i * 10;          // subtle x drift
    const yAmp = 20 + i * 8;
    const sAmp = 0.05 + i * 0.02;      // scale oscillation

    gsap.to(shape, {
      x: `random(-${xAmp}, ${xAmp})`,
      y: `random(-${yAmp}, ${yAmp})`,
      scale: `random(${1 - sAmp}, ${1 + sAmp})`,
      duration: dur,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      repeatRefresh: true, // pick new random target each repeat
    });
  });
}
