import { useEffect, useRef } from 'react';
import { HOME_HERO_BACKDROP } from '../homeContent';
import { HOME_MOTION } from '../motion/motionConfig';
import { createHeroBackdropController } from '../motion/createHeroBackdropController';

// Content owns the screenshot playlist; motion owns its repeated column layout.
const columns = Array.from({ length: HOME_MOTION.heroBackdrop.columns }, (_, column) =>
  Array.from({ length: 6 }, (_, row) => HOME_HERO_BACKDROP[(column * 3 + row) % HOME_HERO_BACKDROP.length]));

export default function HomeHeroBackdrop({ heroRef, reducedMotion }) {
  const backdropRef = useRef(null);
  useEffect(() => {
    if (reducedMotion) return undefined;
    const controller = createHeroBackdropController(heroRef.current, backdropRef.current);
    return () => controller.dispose();
  }, [heroRef, reducedMotion]);
  const motion = HOME_MOTION.heroBackdrop;
  return <div ref={backdropRef} className="hero-chart-backdrop" aria-hidden="true" data-running="false"
    style={{ '--hero-tilt-x': `${motion.rotateX}deg`, '--hero-tilt-y': `${motion.rotateY}deg`, '--hero-tilt-z': `${motion.rotateZ}deg`,
      '--hero-backdrop-columns': motion.columns, '--hero-backdrop-perspective': `${motion.perspective}px` }}>
    <div className="hero-chart-backdrop__plane">
      {columns.map((slides, column) => {
        const duration = (motion.cycle + (column % 3) * 12) / motion.speed;
        return <div className="hero-chart-backdrop__column" key={column}>
          <div className="hero-chart-backdrop__track" data-reverse={column % 2 === 1}
            style={{ animationDuration: `${duration}s`, animationDelay: `${-duration * column * .17}s` }}>
            {[0, 1, 2].map(copy => <div className="hero-chart-backdrop__sequence" key={copy}>
              {slides.map((slide, row) => <div className="hero-chart-backdrop__tile" key={row}>
                <img src={slide.image} width={slide.width} height={slide.height} alt="" draggable="false" decoding="async" />
              </div>)}
            </div>)}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
