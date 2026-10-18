import { useRef, useState } from 'react';
import HomeLogo from './HomeLogo';
import HomeHeroBackdrop from './HomeHeroBackdrop';
import { HOME_CHAPTERS, HOME_COPY } from '../homeContent';

export default function HomeHero({ onReplayLogo, onChapter, reducedMotion }) {
  const heroRef = useRef(null);
  const entries = HOME_CHAPTERS.filter(chapter => chapter.entry);
  const [selected, setSelected] = useState(entries[0].key);
  const chapter = entries.find(item => item.key === selected);
  return <section className="hero" aria-labelledby="home-title" ref={heroRef}>
    <HomeHeroBackdrop heroRef={heroRef} reducedMotion={reducedMotion} />
    <div className="hero-surface">
    <div className="hero-identity">
      <HomeLogo onReplay={onReplayLogo} />
      <h1 id="home-title"><span className="hero-title-line">{HOME_COPY.title[0]}</span><em className="hero-title-line">{HOME_COPY.title[1]}</em></h1>
    </div>
    <p className="hero-lead">{HOME_COPY.lead}</p>
    <div className="entry-panel" aria-label="选择分析领域">
      <div className="entry-tabs" role="tablist" aria-label="分析领域">
        {entries.map((entry, index) => <button key={entry.key} className="entry-tab" type="button" role="tab" id={'home-tab-' + entry.key}
          aria-controls="home-entry-summary" aria-selected={entry.key === selected} tabIndex={entry.key === selected ? 0 : -1}
          onClick={() => setSelected(entry.key)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + entries.length) % entries.length;
            setSelected(entries[next].key);
            event.currentTarget.parentElement.children[next].focus();
          }}>{entry.label}</button>)}
      </div>
      <div className="entry-content" id="home-entry-summary" role="tabpanel" aria-labelledby={'home-tab-' + selected}>
        <div><strong>{chapter.entry.title}</strong><p>{chapter.entry.description}</p></div>
        <a className="button-primary" href={'#' + chapter.id} onClick={event => { event.preventDefault(); onChapter(chapter.key); }}>{chapter.entry.action} <span aria-hidden="true">→</span></a>
      </div>
    </div>
    <p className="scroll-cue">{HOME_COPY.scrollCue}</p>
    </div>
  </section>;
}
