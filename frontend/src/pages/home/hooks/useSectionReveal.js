import { useEffect } from 'react';
import { HOME_MOTION } from '../motion/motionConfig';

export default function useSectionReveal(pageRef, pinned, reducedMotion) {
  useEffect(() => {
    if (reducedMotion || typeof IntersectionObserver === 'undefined') return;
    const selector = '.evidence-step' + (pinned ? '' : ', .chapter > .chapter-content > :is(.chapter-index, h3, .chapter-copy, ul, .chapter-link, .mobile-gallery)');
    const elements = [...pageRef.current.querySelectorAll(selector)];
    const animations = new Set();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target;
        element.style.removeProperty('opacity');
        if (typeof element.animate === 'function') {
          const animation = element.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'translateY(0px)' }], { duration: 460, easing: HOME_MOTION.easing });
          animations.add(animation);
          animation.finished.catch(() => {}).then(() => animations.delete(animation));
        }
        observer.unobserve(element);
      }
    }, { threshold: .12 });
    for (const element of elements) { element.style.opacity = '0'; observer.observe(element); }
    return () => { observer.disconnect(); for (const animation of animations) animation.cancel(); elements.forEach(element => element.style.removeProperty('opacity')); };
  }, [pageRef, pinned, reducedMotion]);
}
