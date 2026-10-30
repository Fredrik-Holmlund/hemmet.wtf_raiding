/* Glöd som svävar upp över heron, samma effekt som på hemmet.wtf. */
export function embers(c) {
  if (!c || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const x = c.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1);
  let W, H, on = false;
  const size = () => { W = c.width = c.offsetWidth * dpr; H = c.height = c.offsetHeight * dpr; };
  size(); addEventListener("resize", size);
  const spawn = y => ({ x: Math.random() * W, y: y ?? H + 10, r: (Math.random() * 1.6 + .5) * dpr, vy: (Math.random() * .5 + .2) * dpr, vx: (Math.random() - .5) * .3, a: Math.random() * .6 + .3, p: Math.random() * 6 });
  const ps = Array.from({ length: 70 }, () => spawn(Math.random() * H));
  // bara när den syns: ingen animation i onödan
  new IntersectionObserver(([e]) => { const was = on; on = e.isIntersecting; if (on && !was) { size(); requestAnimationFrame(tick); } }).observe(c);
  function tick() {
    if (!on) return;
    x.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.y -= p.vy; p.x += p.vx + Math.sin((p.y + p.p * 100) / 90) * .3;
      x.shadowColor = "rgba(240,180,80,.9)"; x.shadowBlur = 8 * dpr;
      x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.3); x.fillStyle = `rgba(240,196,110,${p.a * Math.min(1, p.y / (H * .5))})`; x.fill();
      if (p.y < -10) Object.assign(p, spawn());
    }
    requestAnimationFrame(tick);
  }
}
