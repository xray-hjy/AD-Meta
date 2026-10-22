import top from '../../../assets/brand/logo-parts/top.svg';
import bottom from '../../../assets/brand/logo-parts/bottom.svg';
import core from '../../../assets/brand/logo-parts/core.svg?raw';
import { HOME_COPY } from '../homeContent';

// All parts share one viewBox. The core uses presentation attributes so its
// lines can animate independently without leaking Illustrator's CSS classes.
export default function HomeLogo({ onReplay }) {
  return <button className="logo-replay" type="button" onClick={onReplay} aria-label={HOME_COPY.brand.replayLogo}>
    <span className="logo-machine" aria-hidden="true">
      <span className="logo-part logo-part--bottom"><img src={bottom} width="505" height="685" alt="" /></span>
      <span className="logo-part logo-part--top"><img src={top} width="505" height="685" alt="" /></span>
      <span className="logo-part logo-part--core" dangerouslySetInnerHTML={{ __html: core }} />
    </span>
  </button>;
}
