// These five motions use the approved real parts, never rectangular crops.
// Distances scale from the 160 × 217 preview to the current logo size.
export const LOGO_MOTIONS = ['join', 'arc', 'flip', 'network', 'spring'];

export function chooseLogoMotion(previous, random = Math.random) {
  const choices = LOGO_MOTIONS.filter(key => key !== previous);
  return choices[Math.floor(random() * choices.length)];
}

export function createLogoAnimationPlan(logo, motion) {
  const machine = logo.querySelector('.logo-machine');
  const top = machine.querySelector('.logo-part--top');
  const bottom = machine.querySelector('.logo-part--bottom');
  const core = machine.querySelector('.logo-part--core');
  const scale = (logo.clientHeight || 110) / 217;
  const px = value => (value * scale).toFixed(2) + 'px';
  const translate = (x, y = 0, z = 0) => `translate3d(${px(x)},${px(y)},${px(z)})`;
  const settled = { transform: 'translate3d(0px,0px,0px) rotate(0deg) scale(1)', opacity: 1 };
  const plan = [];
  const add = (element, frames, duration, delay = 0) => plan.push({ element, frames,
    options: { duration, delay, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' } });

  if (motion === 'join') {
    add(top, [{ transform: `${translate(0,-72)} rotate(-7deg)`, opacity: 0 },
      { transform: `${translate(0,3)} rotate(1deg)`, opacity: 1, offset: .78 }, settled], 1050);
    add(bottom, [{ transform: `${translate(0,72)} rotate(7deg)`, opacity: 0 },
      { transform: `${translate(0,-3)} rotate(-1deg)`, opacity: 1, offset: .78 }, settled], 1050, 100);
    add(core, [{ transform: 'scale(.72)', opacity: 0 }, settled], 680, 520);
  } else if (motion === 'arc') {
    add(top, [{ transform: `${translate(-92,-10)} rotate(-55deg)`, opacity: 0 },
      { transform: `${translate(-48,-63)} rotate(-30deg)`, opacity: 1, offset: .4 },
      { transform: `${translate(5,-4)} rotate(3deg)`, opacity: 1, offset: .8 }, settled], 1380);
    add(bottom, [{ transform: `${translate(92,10)} rotate(55deg)`, opacity: 0 },
      { transform: `${translate(48,63)} rotate(30deg)`, opacity: 1, offset: .4 },
      { transform: `${translate(-5,4)} rotate(-3deg)`, opacity: 1, offset: .8 }, settled], 1380, 90);
    add(core, [{ transform: 'rotate(-18deg) scale(.55)', opacity: 0 }, settled], 750, 680);
  } else if (motion === 'flip') {
    add(top, [{ transform: `${translate(-48,-28,95)} rotateY(-78deg) rotateZ(-12deg)`, opacity: 0 },
      { transform: `${translate(0,0,8)} rotateY(6deg)`, opacity: 1, offset: .82 }, settled], 1250);
    add(bottom, [{ transform: `${translate(48,28,75)} rotateY(78deg) rotateZ(12deg)`, opacity: 0 },
      { transform: `${translate(0,0,8)} rotateY(-6deg)`, opacity: 1, offset: .82 }, settled], 1250, 120);
    add(core, [{ transform: `${translate(0,0,110)} rotateY(90deg) scale(.65)`, opacity: 0 }, settled], 850, 450);
  } else if (motion === 'network') {
    add(top, [{ transform: `${translate(0,-9)} scale(.98)`, opacity: 0 }, settled], 850, 550);
    add(bottom, [{ transform: `${translate(0,9)} scale(.98)`, opacity: 0 }, settled], 850, 760);
    core.querySelectorAll('line').forEach((line, index) => {
      const length = Math.hypot(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')),
        Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')));
      add(line, [{ strokeDasharray: String(length), strokeDashoffset: String(length), opacity: .4 },
        { strokeDasharray: String(length), strokeDashoffset: '0', opacity: 1 }], 600, index * 55);
    });
    core.querySelectorAll('path,circle').forEach((node, index) =>
      add(node, [{ opacity: 0 }, { opacity: 1 }], 280, 100 + Math.floor(index / 2) * 100));
  } else if (motion === 'spring') {
    add(bottom, [{ transform: `${translate(0,68)} rotate(-8deg)`, opacity: 0 },
      { transform: `${translate(0,-8)} rotate(2deg)`, opacity: 1, offset: .65 },
      { transform: `${translate(0,3)} rotate(-1deg)`, opacity: 1, offset: .85 }, settled], 900);
    add(top, [{ transform: `${translate(45,-45)} rotate(18deg)`, opacity: 0 },
      { transform: `${translate(-5,5)} rotate(-3deg)`, opacity: 1, offset: .65 },
      { transform: `${translate(2,-2)} rotate(1deg)`, opacity: 1, offset: .86 }, settled], 900, 210);
    add(core, [{ transform: 'scale(.15)', opacity: 0 }, { transform: 'scale(1.16)', opacity: 1, offset: .66 },
      { transform: 'scale(.96)', opacity: 1, offset: .84 }, settled], 700, 580);
    add(machine, [{ transform: 'scale(1)', offset: 0 }, { transform: 'scale(1.035)', offset: .78 },
      { transform: 'scale(1)', offset: 1 }], 1380);
  }
  return plan;
}
