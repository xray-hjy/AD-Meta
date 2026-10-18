import { useCallback, useMemo, useRef, useState } from 'react';
import HomeHeader from './components/HomeHeader';
import HomeHero from './components/HomeHero';
import HomeShowcase from './components/HomeShowcase';
import HomeFoundation from './components/HomeFoundation';
import GalleryDialog from './components/GalleryDialog';
import useHomeEnvironment from './hooks/useHomeEnvironment';
import useHomeIntro from './hooks/useHomeIntro';
import useSectionReveal from './hooks/useSectionReveal';
import useHomeSectionMotion from './hooks/useHomeSectionMotion';
import useHomeSectionSnap from './hooks/useHomeSectionSnap';
import HomeSection from './components/HomeSection';
import { HomeSectionContext } from './components/HomeSectionContext';
import { createSectionRegistry } from './motion/createSectionRegistry';
import { heroSectionMotion, showcaseSectionMotion, revealSectionMotion } from './motion/sectionMotionPresets';
import { HOME_CHAPTERS } from './homeContent';
import './styles/index.css';

const showcaseAnchor = element => element.querySelector('.story-layout');

// Composition only. Content, presentation and motion have separate entry points.
export default function HomePage() {
  const pageRef = useRef(null), showcaseApi = useRef(null);
  const { pinned, reducedMotion } = useHomeEnvironment();
  const [slide, setSlide] = useState(null);
  const [registry] = useState(createSectionRegistry);
  const showcaseAdapter = useMemo(() => ({
    getStops: () => showcaseApi.current?.sectionStops(),
    isBusy: () => showcaseApi.current?.isBusy() || false,
  }), []);
  const { finish, replayLogo } = useHomeIntro(pageRef, reducedMotion);
  useSectionReveal(pageRef, pinned, reducedMotion);
  useHomeSectionMotion(pageRef, pinned, reducedMotion, registry);
  const sectionApi = useHomeSectionSnap(pageRef, registry, pinned, reducedMotion, Boolean(slide));
  const onChapter = useCallback(key => {
    finish();
    const navigate = () => {
      if (showcaseApi.current) showcaseApi.current.goto(key);
      else pageRef.current.querySelector('#' + HOME_CHAPTERS.find(chapter => chapter.key === key).id)?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
    };
    sectionApi.navigate(navigate);
  }, [finish, reducedMotion, sectionApi]);
  const onSection = useCallback(id => { finish(); sectionApi.goto(id); }, [finish, sectionApi]);
  const onClose = useCallback(() => setSlide(null), []);
  return <HomeSectionContext.Provider value={registry}><div className={'admeta-home motion-ready scroll-ready' + (pinned ? ' scroll-gallery' : '')} ref={pageRef} id="home-top">
    <HomeHeader onChapter={onChapter} onSection={onSection} />
    <main>
      <HomeSection id="hero" size="viewport" motion={heroSectionMotion}>
        <HomeHero onReplayLogo={replayLogo} onChapter={onChapter} reducedMotion={reducedMotion} />
      </HomeSection>
      <HomeSection id="showcase" snap="managed" adapter={showcaseAdapter} anchor={showcaseAnchor} motion={showcaseSectionMotion}>
        <HomeShowcase pageRef={pageRef} apiRef={showcaseApi} pinned={pinned} onOpen={setSlide} dialogOpen={Boolean(slide)} onChapter={onChapter} />
      </HomeSection>
      <HomeSection id="foundation" size="viewport" motion={revealSectionMotion}>
        <HomeFoundation />
      </HomeSection>
    </main>
    <footer className="site-footer"><strong>AD-Meta · 微脑智库</strong><span>面向 AD 脑肠轴研究的肠道宏基因组研发辅助工具</span></footer>
    <GalleryDialog slide={slide} onClose={onClose} />
  </div></HomeSectionContext.Provider>;
}
