import { useCallback, useRef, useState } from 'react';
import HomeHeader from './components/HomeHeader';
import HomeHero from './components/HomeHero';
import HomeShowcase from './components/HomeShowcase';
import HomeFoundation from './components/HomeFoundation';
import GalleryDialog from './components/GalleryDialog';
import useHomeEnvironment from './hooks/useHomeEnvironment';
import useHomeIntro from './hooks/useHomeIntro';
import useSectionReveal from './hooks/useSectionReveal';
import useHomeSectionMotion from './hooks/useHomeSectionMotion';
import { HOME_CHAPTERS } from './homeContent';
import './styles/index.css';

// Composition only. Content, presentation and motion have separate entry points.
export default function HomePage() {
  const pageRef = useRef(null), showcaseApi = useRef(null);
  const { pinned, reducedMotion } = useHomeEnvironment();
  const [slide, setSlide] = useState(null);
  const { finish, replay, replayLogo } = useHomeIntro(pageRef, reducedMotion);
  useSectionReveal(pageRef, pinned, reducedMotion);
  useHomeSectionMotion(pageRef, pinned, reducedMotion);
  const onChapter = useCallback(key => {
    finish();
    if (showcaseApi.current) showcaseApi.current.goto(key);
    else pageRef.current.querySelector('#' + HOME_CHAPTERS.find(chapter => chapter.key === key).id)?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'start' });
  }, [finish, reducedMotion]);
  const onClose = useCallback(() => setSlide(null), []);
  return <div className={'admeta-home motion-ready scroll-ready' + (pinned ? ' scroll-gallery' : '')} ref={pageRef} id="home-top">
    <HomeHeader onReplay={replay} onChapter={onChapter} />
    <main>
      <HomeHero onReplayLogo={replayLogo} onChapter={onChapter} />
      <HomeShowcase pageRef={pageRef} apiRef={showcaseApi} pinned={pinned} onOpen={setSlide} dialogOpen={Boolean(slide)} onChapter={onChapter} />
      <HomeFoundation />
    </main>
    <footer className="site-footer"><strong>AD-Meta · 微脑智库</strong><span>面向 AD 脑肠轴研究的肠道宏基因组研发辅助工具</span></footer>
    <GalleryDialog slide={slide} onClose={onClose} />
  </div>;
}
