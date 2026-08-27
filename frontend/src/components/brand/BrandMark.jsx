import brandLogo from '../../assets/brand/microbrain-logo.svg';

export default function BrandMark({ size = 'workspace' }) {
  return (
    <span className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <img className="brand-mark__image" src={brandLogo} alt="" />
    </span>
  );
}
