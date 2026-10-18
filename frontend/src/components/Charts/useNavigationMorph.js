import { useLayoutEffect, useRef } from 'react';

const BALL_SIZE = 44;
const ELASTICITY = 1.5;
const clamp = value => Math.min(1, Math.max(0, value));
const smooth = (from, to, value) => {
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

// Animate the shell directly: chart/camera state never enters the frame loop.
export default function useNavigationMorph({ open, dockRef, shellRef, contentRef, orbRef }) {
  const controllerRef = useRef(null);

  useLayoutEffect(() => {
    const dock = dockRef.current, shell = shellRef.current;
    const content = contentRef.current, orb = orbRef.current;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let width = 304, height = 214;
    let progress = 1, velocity = 0, squash = 0, squashVelocity = 0;
    let target = 1, landed = true, frame = null, previous = 0;

    const paint = () => {
      const p = clamp(progress), nearBall = (1 - p) ** 3;
      const w = BALL_SIZE + (width - BALL_SIZE) * smooth(.035, .97, p);
      const h = BALL_SIZE + (height - BALL_SIZE) * smooth(.1, .92, p);
      const rounding = smooth(.13, .86, p);
      const deformation = media?.matches ? 0
        : Math.max(-.15, Math.min(.15, squash * .9 + velocity * .009)) * nearBall * ELASTICITY;
      shell.style.width = `${w}px`;
      shell.style.height = `${h}px`;
      shell.style.borderRadius = `${Math.min(w, h) / 2 * (1 - rounding) + 12 * rounding}px`;
      shell.style.transform = `translateY(${-squash * 4 * nearBall * ELASTICITY}px) scale(${1 - deformation * .78}, ${1 + deformation})`;
      shell.style.setProperty('--navigation-surface-share', `${p * 100}%`);
      shell.style.setProperty('--navigation-shine', String((1 - p) * .9));
      const reveal = smooth(.64, .96, p);
      content.style.opacity = String(reveal);
      content.style.transform = `translate(${(1 - reveal) * 8}px, ${(1 - reveal) * 5}px)`;
      content.style.pointerEvents = target && reveal > .55 ? 'auto' : 'none';
      orb.style.opacity = String(1 - smooth(.08, .42, p));
      shell.classList.toggle('is-settled-orb', p === 0 && frame == null);
      shell.classList.toggle('is-morphing', frame != null);
    };

    const finish = () => {
      if (frame != null) cancelAnimationFrame(frame);
      frame = null;
      progress = target;
      velocity = squash = squashVelocity = 0;
      paint();
    };

    const tick = time => {
      const elapsed = Math.min(Math.max(0, (time - previous) / 1000), .032);
      previous = time;
      const steps = Math.max(1, Math.ceil(elapsed / .007));
      for (let i = 0; i < steps; i += 1) {
        const dt = elapsed / steps;
        velocity += (360 * (target - progress) - 29 * velocity) * dt;
        progress += velocity * dt;
        if (target === 0 && progress < .018 && !landed) {
          landed = true;
          squashVelocity = -3.3;
        }
        squashVelocity += (-560 * squash - 25 * squashVelocity) * dt;
        squash += squashVelocity * dt;
      }
      if (Math.abs(progress - target) < .0005 && Math.abs(velocity) < .009
        && Math.abs(squash) < .0008 && Math.abs(squashVelocity) < .012) {
        finish();
      } else {
        paint();
        frame = requestAnimationFrame(tick);
      }
    };

    const measure = () => {
      width = dock.clientWidth || 304;
      dock.style.setProperty('--navigation-panel-width', `${width}px`);
      height = content.offsetHeight || 214;
      paint();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(dock);
    observer?.observe(content);
    window.addEventListener('resize', measure);
    const onMediaChange = () => { if (media?.matches) finish(); };
    const onVisibility = () => { if (document.hidden) finish(); };
    media?.addEventListener('change', onMediaChange);
    document.addEventListener('visibilitychange', onVisibility);
    controllerRef.current = {
      setOpen(nextOpen) {
        const next = nextOpen ? 1 : 0;
        if (target === next) return;
        target = next;
        landed = nextOpen;
        if (nextOpen) squashVelocity -= 1.8;
        if (media?.matches || document.hidden) finish();
        else if (frame == null) {
          previous = performance.now();
          frame = requestAnimationFrame(tick);
          paint();
        }
      },
    };
    measure();
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      media?.removeEventListener('change', onMediaChange);
      document.removeEventListener('visibilitychange', onVisibility);
      controllerRef.current = null;
    };
  }, [dockRef, shellRef, contentRef, orbRef]);

  useLayoutEffect(() => {
    controllerRef.current?.setOpen(open);
  }, [open]);
}
