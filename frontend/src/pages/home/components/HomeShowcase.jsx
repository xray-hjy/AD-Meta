import { useRef } from 'react';
import { HOME_CHAPTERS, HOME_COPY } from '../homeContent';
import useHomeShowcase from '../hooks/useHomeShowcase';
import ChapterCopy from './ChapterCopy';
import MobileGallery from './MobileGallery';
import 'swiper/css';
import 'swiper/css/effect-coverflow';
import 'swiper/css/free-mode';

export default function HomeShowcase({ pageRef, apiRef, pinned, onOpen, dialogOpen, onChapter }) {
  const storyRef = useRef(null), hostRef = useRef(null);
  const selection = useHomeShowcase({ pageRef, storyRef, hostRef, apiRef, pinned, onOpen, dialogOpen });
  const chapter = HOME_CHAPTERS.find(item => item.key === selection.key);
  const slide = chapter.slides[selection.index];
  function article(item, index) {
    return <article className="chapter" id={item.id} data-domain={item.key} data-home-chapter={item.key} style={{ '--chapter-accent': item.accent }} aria-labelledby={item.id + '-title'} key={item.key}>
      <ChapterCopy chapter={item}>{!pinned && <MobileGallery chapter={item} onOpen={onOpen} />}</ChapterCopy>
      {pinned && [['previous', HOME_CHAPTERS[index - 1]], ['next', HOME_CHAPTERS[index + 1]]].map(([side, neighbor]) => neighbor &&
        <div className={'chapter-preview chapter-preview--' + side} key={side} style={{ '--chapter-accent': neighbor.accent }} aria-hidden="true" inert>
          <ChapterCopy chapter={neighbor} context />
        </div>)}
    </article>;
  }
  return <>
    <section className="story-intro"><p className="eyebrow">{HOME_COPY.showcase.eyebrow}</p><h2 id="home-showcase-title">{HOME_COPY.showcase.title}</h2><p>{HOME_COPY.showcase.description}</p></section>
    <div className="story-layout" id="home-showcase" ref={storyRef} aria-labelledby="home-showcase-title">
      <div className="stage-rail"><div className="visual-stage" aria-label={HOME_COPY.showcase.stageLabel}>
        <div className="stage-bar"><span className="stage-overline">{chapter.overline.split(' / ')[1]}</span><div className="stage-chapters" aria-label={HOME_COPY.showcase.chaptersLabel}>
          {HOME_CHAPTERS.map(item => <button type="button" key={item.key} aria-label={HOME_COPY.showcase.chapterLabel(item.label)} aria-pressed={item.key === selection.key} onClick={() => onChapter(item.key)} />)}
        </div></div>
        <div className="stage-image-wrap" ref={hostRef} />
        <div className="stage-caption"><div className="stage-caption__text"><strong>{slide.title}</strong><p>{slide.description}</p><span className="gallery-scroll-hint">{selection.index === chapter.slides.length - 1 ? (chapter.key === HOME_CHAPTERS.at(-1).key ? HOME_COPY.gallery.endHint : HOME_COPY.gallery.nextChapterHint) : HOME_COPY.gallery.browseHint}</span></div>
          <div className="stage-actions"><span className="slide-count" aria-live="polite">{HOME_COPY.gallery.count(selection.index + 1, chapter.slides.length, true)}</span>
            <button className="round-button" type="button" aria-label={HOME_COPY.gallery.previous} disabled={selection.index === 0} onClick={() => apiRef.current?.shift(-1)}>{HOME_COPY.symbols.previous}</button>
            <button className="round-button" type="button" aria-label={HOME_COPY.gallery.next} disabled={selection.index === chapter.slides.length - 1} onClick={() => apiRef.current?.shift(1)}>{HOME_COPY.symbols.next}</button>
          </div><div className="gallery-progress" aria-hidden="true"><span /></div>
        </div>
      </div></div>
      <div className="chapter-list">
        {pinned && <div className="chapter-reader">{HOME_CHAPTERS.map(article)}</div>}
        <div className="chapter-timeline">{HOME_CHAPTERS.map((item, index) => <div className="chapter-track" key={item.key}>{!pinned && article(item, index)}</div>)}</div>
      </div>
    </div>
  </>;
}
