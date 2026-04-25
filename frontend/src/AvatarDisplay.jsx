import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

const AvatarDisplay = forwardRef(({ isSpeaking, isListening }, ref) => {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef({
    mouthOpen: 0, targetMouth: 0, speakPhase: 0,
    blinkValue: 0, blinkTimer: 2.1,
    bobPhase: 0, bobOffset: 0,
    headTilt: 0, headTiltTarget: 0,
    armPhase: 0,
    antennaGlow: 0.2,
    pupilX: 0, pupilY: 0, pupilTargetX: 0, pupilTargetY: 0, pupilTimer: 0,
  });

  useImperativeHandle(ref, () => ({
    startSpeaking: () => {},
    stopSpeaking: () => {},
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let last = performance.now();

    const loop = (now) => {
      animRef.current = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;
      const s = stateRef.current;

      s.bobPhase += dt * 1.0;
      s.bobOffset = Math.sin(s.bobPhase) * 6;

      if (isSpeaking) {
        s.speakPhase += dt * 8;
        s.targetMouth = (Math.sin(s.speakPhase) * 0.5 + 0.5) * 0.82 + 0.1;
      } else {
        s.targetMouth = 0;
      }
      s.mouthOpen += (s.targetMouth - s.mouthOpen) * 0.2;

      s.blinkTimer += dt;
      if (s.blinkTimer > 3.5 + Math.sin(t * 0.3) * 0.8) s.blinkTimer = 0;
      s.blinkValue = s.blinkTimer < 0.13 ? Math.sin((s.blinkTimer / 0.13) * Math.PI) : 0;

      const tiltTarget = isListening ? Math.sin(t * 1.8) * 0.1
                       : isSpeaking  ? Math.sin(t * 2.5) * 0.06
                       :               Math.sin(t * 0.5) * 0.025;
      s.headTilt += (tiltTarget - s.headTilt) * 0.06;

      s.armPhase += dt * (isSpeaking ? 2.5 : 0.7);

      const targetGlow = isSpeaking  ? 0.8 + Math.sin(t * 8) * 0.2
                       : isListening ? 0.5 + Math.sin(t * 4) * 0.2
                       :               0.15 + Math.sin(t * 1.2) * 0.04;
      s.antennaGlow += (targetGlow - s.antennaGlow) * 0.1;

      s.pupilTimer += dt;
      if (s.pupilTimer > 2.5) {
        s.pupilTimer = 0;
        s.pupilTargetX = (Math.random() - 0.5) * 12;
        s.pupilTargetY = (Math.random() - 0.5) * 8;
      }
      s.pupilX += (s.pupilTargetX - s.pupilX) * 0.05;
      s.pupilY += (s.pupilTargetY - s.pupilY) * 0.05;

      const parent = canvas.parentElement;
      if (parent) {
        const pw = parent.clientWidth, ph = parent.clientHeight;
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }
      }

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawRosie(ctx, canvas.width, canvas.height, s, isSpeaking, isListening);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [isSpeaking, isListening]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
});

export default AvatarDisplay;

// ─── Drawing ───────────────────────────────────────────────────────────────────

function drawRosie(ctx, W, H, s, isSpeaking, isListening) {
  // Virtual canvas: 400 x 650 — matches Jetsons Rosie proportions
  const VW = 400, VH = 650;
  const sc = Math.min(W / VW, H / VH) * 0.92;
  const ox = (W - VW * sc) / 2;
  const oy = (H - VH * sc) / 2 + s.bobOffset * sc * 0.5;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(sc, sc);

  drawGroundShadow(ctx);
  drawSkirt(ctx);
  drawWheels(ctx);
  drawRuffleHem(ctx);
  drawBody(ctx);
  drawButtons(ctx);
  drawLeftArm(ctx, s.armPhase, isSpeaking);
  drawRightArm(ctx, s.armPhase, isSpeaking);
  drawCollarRuffle(ctx);

  // Head group pivots at head center for tilt
  ctx.save();
  ctx.translate(200, 150);
  ctx.rotate(s.headTilt);
  ctx.translate(-200, -150);
  drawHair(ctx);
  drawHead(ctx, s);
  drawAntennae(ctx, s.antennaGlow);
  ctx.restore();

  ctx.restore();
}

function drawGroundShadow(ctx) {
  const g = ctx.createRadialGradient(200, 628, 4, 200, 628, 115);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.ellipse(200, 628, 115, 16, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
}

function drawSkirt(ctx) {
  ctx.beginPath();
  ctx.moveTo(108, 400);
  ctx.bezierCurveTo(72, 445, 52, 508, 62, 585);
  ctx.bezierCurveTo(88, 618, 312, 618, 338, 585);
  ctx.bezierCurveTo(348, 508, 328, 445, 292, 400);
  ctx.closePath();

  const g = ctx.createLinearGradient(62, 400, 338, 610);
  g.addColorStop(0, '#1c1c30');
  g.addColorStop(0.35, '#0e0e1c');
  g.addColorStop(0.65, '#181828');
  g.addColorStop(1, '#0a0a12');
  ctx.fillStyle = g;
  ctx.fill();

  // Subtle left sheen
  const sheen = ctx.createLinearGradient(62, 480, 170, 480);
  sheen.addColorStop(0, 'rgba(70,70,120,0.25)');
  sheen.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sheen;
  ctx.fill();

  ctx.strokeStyle = 'rgba(60,60,90,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawWheels(ctx) {
  [[150, 596], [250, 596]].forEach(([cx, cy]) => {
    // Wheel body
    const g = ctx.createRadialGradient(cx - 9, cy - 8, 2, cx, cy, 28);
    g.addColorStop(0, '#b8d8f8');
    g.addColorStop(0.4, '#5599cc');
    g.addColorStop(1, '#1a3a6a');
    ctx.beginPath();
    ctx.ellipse(cx, cy, 28, 21, 0, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(150,210,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Specular
    ctx.beginPath();
    ctx.ellipse(cx - 8, cy - 7, 10, 7, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220,245,255,0.55)';
    ctx.fill();
  });
}

function drawRuffleHem(ctx) {
  const cx = 200, cy = 403, rx = 128, ry = 14, n = 18;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const x0 = cx + Math.cos(a0) * rx, y0 = cy + Math.sin(a0) * ry;
    const x1 = cx + Math.cos(a1) * rx, y1 = cy + Math.sin(a1) * ry;
    const xm = cx + Math.cos(am) * (rx + 15), ym = cy + Math.sin(am) * (ry + 11);
    const xi0 = cx + Math.cos(a0) * (rx - 9), yi0 = cy + Math.sin(a0) * (ry - 7);
    const xi1 = cx + Math.cos(a1) * (rx - 9), yi1 = cy + Math.sin(a1) * (ry - 7);
    const xim = cx + Math.cos(am) * (rx + 3), yim = cy + Math.sin(am) * (ry + 2);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(xm, ym, x1, y1);
    ctx.lineTo(xi1, yi1);
    ctx.quadraticCurveTo(xim, yim, xi0, yi0);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#f6f6f2' : '#eeeee9';
    ctx.fill();
    ctx.strokeStyle = '#c8c8c0';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
}

function drawBody(ctx) {
  const cx = 200, cy = 308, rx = 113, ry = 105;

  // Drop shadow
  ctx.beginPath();
  ctx.ellipse(cx + 7, cy + 10, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,20,0.28)';
  ctx.fill();

  // Main body
  const g = ctx.createRadialGradient(cx - rx * 0.33, cy - ry * 0.35, 4, cx, cy, rx * 1.18);
  g.addColorStop(0,    '#cce6ff');
  g.addColorStop(0.18, '#90c0ec');
  g.addColorStop(0.5,  '#4a88cc');
  g.addColorStop(0.82, '#1e3f7a');
  g.addColorStop(1,    '#0d1f40');
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // Rim
  ctx.strokeStyle = 'rgba(170,215,255,0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Specular highlight
  const sp = ctx.createRadialGradient(cx - 40, cy - 40, 0, cx - 40, cy - 40, 52);
  sp.addColorStop(0, 'rgba(255,255,255,0.68)');
  sp.addColorStop(0.55, 'rgba(210,238,255,0.25)');
  sp.addColorStop(1, 'rgba(190,225,255,0)');
  ctx.beginPath();
  ctx.ellipse(cx - 38, cy - 38, 48, 36, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = sp;
  ctx.fill();

  // Horizontal panel seam
  ctx.beginPath();
  ctx.ellipse(cx, cy + 18, rx * 0.94, 9, 0, Math.PI * 0.06, Math.PI * 0.94);
  ctx.strokeStyle = 'rgba(8,24,72,0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Lower shadow area (ground-facing)
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 0.1, rx * 0.72, ry * 0.38, 0, 0, Math.PI);
  ctx.fillStyle = 'rgba(4,12,35,0.22)';
  ctx.fill();
}

function drawButtons(ctx) {
  [[200, 248], [200, 286], [200, 324], [167, 274], [233, 274]].forEach(([bx, by]) => {
    // Shadow
    ctx.beginPath();
    ctx.arc(bx + 1.5, by + 2.5, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,30,0.38)';
    ctx.fill();
    // Body
    const bg = ctx.createRadialGradient(bx - 3.5, by - 3.5, 1, bx, by, 10.5);
    bg.addColorStop(0, '#ff8877');
    bg.addColorStop(0.45, '#dd2200');
    bg.addColorStop(1, '#880000');
    ctx.beginPath();
    ctx.arc(bx, by, 10, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = '#ff5533';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Specular
    ctx.beginPath();
    ctx.arc(bx - 3.5, by - 3.5, 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,210,200,0.6)';
    ctx.fill();
  });
}

function drawArmSegment(ctx, attachX, attachY, angle, isSpeaking, phase, side) {
  ctx.save();
  ctx.translate(attachX, attachY);
  ctx.rotate(angle + (isSpeaking ? Math.sin(phase + (side === 'l' ? 0 : 1)) * 0.1 : 0));

  const g = ctx.createLinearGradient(-15, 0, 15, 0);
  g.addColorStop(0, '#aacce8');
  g.addColorStop(0.18, '#c8e4ff');
  g.addColorStop(0.6, '#5590c8');
  g.addColorStop(1, '#1a3668');
  roundRect(ctx, -13, 4, 26, 72, 13);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(170,215,255,0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Hand ball
  const hg = ctx.createRadialGradient(-5, 72, 2, 0, 78, 19);
  hg.addColorStop(0, '#b8d8f8');
  hg.addColorStop(0.5, '#4488bb');
  hg.addColorStop(1, '#183060');
  ctx.beginPath();
  ctx.arc(0, 78, 19, 0, Math.PI * 2);
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(170,215,255,0.3)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Hand specular
  ctx.beginPath();
  ctx.arc(-6, 71, 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(210,240,255,0.45)';
  ctx.fill();

  ctx.restore();
}

function drawLeftArm(ctx, armPhase, isSpeaking) {
  drawArmSegment(ctx, 96, 264, -Math.PI * 0.13, isSpeaking, armPhase, 'l');
}

function drawRightArm(ctx, armPhase, isSpeaking) {
  drawArmSegment(ctx, 304, 264, Math.PI * 0.13, isSpeaking, armPhase, 'r');
  drawDuster(ctx, 304, 264, Math.PI * 0.13 + (isSpeaking ? Math.sin(armPhase + 1) * 0.1 : 0));
}

function drawDuster(ctx, ax, ay, angle) {
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.translate(0, 97);
  ctx.rotate(-Math.PI * 0.32);

  // Handle
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -58);
  ctx.strokeStyle = '#7a3d10';
  ctx.lineWidth = 5.5;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Fluffy puffs
  const fluff = ['#ffe57a', '#ffd740', '#ffca28', '#ffe082', '#ffecb3'];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 14, -58 + Math.sin(a) * 10, 11, 0, Math.PI * 2);
    ctx.fillStyle = fluff[i % fluff.length];
    ctx.globalAlpha = 0.82;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Center fluff
  ctx.beginPath();
  ctx.arc(0, -58, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#fff176';
  ctx.fill();

  ctx.restore();
}

function drawCollarRuffle(ctx) {
  const cx = 200, cy = 202, rx = 70, ry = 13, n = 14;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const x0 = cx + Math.cos(a0) * rx, y0 = cy + Math.sin(a0) * ry;
    const x1 = cx + Math.cos(a1) * rx, y1 = cy + Math.sin(a1) * ry;
    const xm = cx + Math.cos(am) * (rx + 17), ym = cy + Math.sin(am) * (ry + 13);
    const xi0 = cx + Math.cos(a0) * (rx - 11), yi0 = cy + Math.sin(a0) * (ry - 8);
    const xi1 = cx + Math.cos(a1) * (rx - 11), yi1 = cy + Math.sin(a1) * (ry - 8);
    const xim = cx + Math.cos(am) * (rx + 2), yim = cy + Math.sin(am) * (ry + 1);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(xm, ym, x1, y1);
    ctx.lineTo(xi1, yi1);
    ctx.quadraticCurveTo(xim, yim, xi0, yi0);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#f8f8f5' : '#eeeeea';
    ctx.fill();
    ctx.strokeStyle = '#c8c8c0';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // Inner collar ring
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 9, ry - 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f0f0ec';
  ctx.fill();
}

function drawHair(ctx) {
  [[200, 80, 30], [178, 87, 23], [222, 87, 23], [190, 68, 21], [210, 68, 21], [200, 62, 19]].forEach(([px, py, pr]) => {
    const g = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 1, px, py, pr);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#f0f0ec');
    g.addColorStop(1, '#d5d5d0');
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(195,195,190,0.45)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  });
}

function drawHead(ctx, s) {
  const cx = 200, cy = 150, rx = 56, ry = 60;

  // Drop shadow
  ctx.beginPath();
  ctx.ellipse(cx + 5, cy + 8, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,20,0.22)';
  ctx.fill();

  // Dome
  const g = ctx.createRadialGradient(cx - rx * 0.35, cy - ry * 0.38, 0, cx, cy, rx * 1.22);
  g.addColorStop(0,    '#c4dff8');
  g.addColorStop(0.22, '#7ab8e8');
  g.addColorStop(0.58, '#4a88cc');
  g.addColorStop(0.85, '#1e3f7a');
  g.addColorStop(1,    '#0d1f40');
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(140,200,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Specular
  const sp = ctx.createRadialGradient(cx - 20, cy - 24, 0, cx - 20, cy - 24, 30);
  sp.addColorStop(0, 'rgba(255,255,255,0.62)');
  sp.addColorStop(0.55, 'rgba(200,232,255,0.22)');
  sp.addColorStop(1, 'rgba(180,220,255,0)');
  ctx.beginPath();
  ctx.ellipse(cx - 18, cy - 22, 26, 20, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = sp;
  ctx.fill();

  drawEyes(ctx, cx, cy, s);
  drawMouth(ctx, cx, cy + 22, s.mouthOpen, s.speakPhase);
}

function drawEyes(ctx, hcx, hcy, s) {
  [[hcx - 19, hcy - 8], [hcx + 19, hcy - 8]].forEach(([ex, ey]) => {
    // Glow halo
    const gl = ctx.createRadialGradient(ex, ey, 0, ex, ey, 24);
    gl.addColorStop(0, 'rgba(255,90,70,0.38)');
    gl.addColorStop(1, 'rgba(255,50,30,0)');
    ctx.beginPath();
    ctx.arc(ex, ey, 24, 0, Math.PI * 2);
    ctx.fillStyle = gl;
    ctx.fill();

    // Eye disc
    const eg = ctx.createRadialGradient(ex - 4, ey - 4, 1, ex, ey, 13.5);
    eg.addColorStop(0, '#ff7755');
    eg.addColorStop(0.5, '#dd2000');
    eg.addColorStop(1, '#7a0000');
    ctx.beginPath();
    ctx.arc(ex, ey, 13.5, 0, Math.PI * 2);
    ctx.fillStyle = eg;
    ctx.fill();
    ctx.strokeStyle = '#ff4422';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Blink cover
    if (s.blinkValue > 0.01) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, 14, 14 * s.blinkValue, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#4a88cc';
      ctx.fill();
    }

    // Pupil
    const px = s.pupilX * 0.4, py = s.pupilY * 0.4;
    ctx.beginPath();
    ctx.arc(ex + px, ey + py, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = '#100000';
    ctx.fill();

    // Specular dot
    ctx.beginPath();
    ctx.arc(ex - 4 + px, ey - 4 + py, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,205,190,0.7)';
    ctx.fill();
  });
}

function drawMouth(ctx, mx, my, mouthOpen, speakPhase) {
  ctx.save();
  if (mouthOpen < 0.08) {
    // Gentle smile arc
    ctx.beginPath();
    ctx.arc(mx, my - 4, 15, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.strokeStyle = '#cc2200';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.stroke();
  } else {
    const mw = 20 + mouthOpen * 10;
    const mh = 5 + mouthOpen * 15;
    // Outer
    ctx.beginPath();
    ctx.ellipse(mx, my, mw, mh, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#cc1100';
    ctx.fill();
    ctx.strokeStyle = '#ff4422';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Inner dark
    ctx.beginPath();
    ctx.ellipse(mx, my + 2, mw - 4, mh - 3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1a0000';
    ctx.fill();
    // Speaking sparkle
    if (mouthOpen > 0.45) {
      ctx.globalAlpha = (mouthOpen - 0.45) * 0.7;
      ctx.beginPath();
      ctx.arc(mx + Math.sin(speakPhase * 2.5) * 7, my - 1, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ffaa88';
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

function drawAntennae(ctx, glowIntensity) {
  // Left short bolt
  ctx.beginPath();
  ctx.moveTo(147, 144);
  ctx.lineTo(157, 144);
  ctx.strokeStyle = '#5090c0';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Right longer antenna
  ctx.beginPath();
  ctx.moveTo(253, 142);
  ctx.lineTo(292, 133);
  ctx.strokeStyle = '#5090c0';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.shadowBlur = 10 + glowIntensity * 12;
  ctx.shadowColor = '#ff8844';

  // Left tip
  const lg = ctx.createRadialGradient(144, 144, 0, 144, 144, 7);
  lg.addColorStop(0, `rgba(255,150,80,${0.7 + glowIntensity * 0.3})`);
  lg.addColorStop(1, `rgba(200,80,20,${0.5 + glowIntensity * 0.3})`);
  ctx.beginPath();
  ctx.arc(144, 144, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = lg;
  ctx.fill();

  // Right tip
  const rg = ctx.createRadialGradient(294, 132, 0, 294, 132, 8);
  rg.addColorStop(0, `rgba(255,150,80,${0.7 + glowIntensity * 0.3})`);
  rg.addColorStop(1, `rgba(200,80,20,${0.5 + glowIntensity * 0.3})`);
  ctx.beginPath();
  ctx.arc(294, 132, 7.5, 0, Math.PI * 2);
  ctx.fillStyle = rg;
  ctx.fill();

  ctx.shadowBlur = 0;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
