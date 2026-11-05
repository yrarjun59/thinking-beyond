const size = 1254;
const duration = 12;
const art = './images/hero-ist/';
const canvas = document.querySelector('canvas');
const context = canvas.getContext('2d', { alpha: false });
const play = document.querySelector('#play');
const replay = document.querySelector('#replay');
const seek = document.querySelector('#seek');
const time = document.querySelector('#time');
const status = document.querySelector('#status');

// Paths are registered in pixels against the locked square reference.
const host = {
  waist: [1008, 744],
  neck: [1017, 575],
  elbow: [1116, 724],
  wrist: [1022, 745],
  seat: [920, 745, 945, 743, 1000, 749, 1081, 746, 1070, 850, 1049, 907,
    986, 949, 975, 1007, 943, 1097, 922, 1110, 884, 1110, 865, 1096,
    862, 1078, 886, 1011, 900, 970, 844, 1026, 810, 1037, 778, 1024,
    779, 1007, 817, 960, 844, 898, 837, 883, 866, 825],
  torso: [963, 575, 997, 561, 1047, 559, 1086, 568, 1116, 588, 1135, 652,
    1116, 697, 1089, 735, 1035, 748, 990, 747, 932, 737, 928, 709, 935, 639],
  head: [965, 504, 970, 467, 983, 445, 1009, 430, 1040, 424, 1065, 429,
    1085, 446, 1096, 470, 1092, 496, 1076, 523, 1094, 553, 1100, 574,
    1070, 575, 1042, 591, 1009, 595, 991, 584, 992, 550, 977, 549, 974, 534, 965, 522],
  arms: [
    [929, 650, 958, 662, 955, 702, 950, 722, 976, 730, 976, 749, 945, 750, 925, 738, 923, 716],
    [1102, 654, 1130, 654, 1137, 704, 1136, 730, 1125, 749, 1081, 760, 1021, 766, 1013, 744, 1059, 735, 1096, 720, 1091, 681],
  ],
  hands: [930, 729, 947, 720, 970, 722, 991, 733, 1018, 737, 1034, 749,
    1025, 766, 997, 765, 971, 756, 942, 752, 929, 743],
  face: { eyes: [994, 501, 26, 12], mouth: [990, 532, 16, 11], brows: [995, 488, 25, 8] },
  handArea: [993, 734, 83, 49],
  accentHandArea: [1025, 733, 135, 55],
};
const guest = {
  waist: [258, 734],
  neck: [248, 552],
  elbow: [385, 702],
  wrist: [393, 683],
  seat: [191, 743, 244, 709, 307, 687, 347, 693, 371, 718, 390, 755,
    418, 799, 451, 843, 435, 890, 470, 945, 511, 958, 537, 967, 545, 981,
    525, 996, 491, 999, 446, 988, 417, 959, 382, 928, 405, 996, 404, 1030,
    430, 1068, 430, 1082, 410, 1095, 369, 1093, 334, 1081, 322, 1060,
    326, 1010, 306, 972, 282, 916, 258, 853, 215, 847, 207, 781],
  torso: [132, 562, 172, 543, 202, 530, 261, 533, 280, 546, 330, 563,
    351, 596, 373, 670, 398, 713, 365, 738, 338, 724, 302, 707, 265, 727,
    221, 753, 170, 753, 140, 737, 126, 702, 119, 618],
  head: [174, 477, 169, 450, 184, 427, 212, 410, 246, 401, 274, 405,
    294, 417, 300, 438, 297, 457, 302, 474, 310, 491, 304, 502, 306, 521,
    291, 539, 268, 545, 268, 559, 249, 573, 220, 553, 204, 532, 190, 519],
  arms: [
    [126, 586, 164, 567, 200, 596, 217, 663, 251, 652, 267, 687, 220, 716, 180, 748, 145, 743, 128, 719],
    [320, 565, 346, 586, 366, 632, 378, 668, 405, 689, 395, 716, 376, 728, 358, 704, 340, 656],
  ],
  hands: [381, 678, 391, 653, 412, 631, 424, 622, 431, 632, 423, 655,
    442, 645, 453, 648, 452, 661, 441, 682, 424, 702, 408, 710, 391, 707],
  face: { eyes: [283, 483, 17, 11], mouth: [295, 513, 16, 12], brows: [282, 476, 16, 8] },
  handArea: [295, 643, 74, 52],
};

function load(url) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

function raster(draw) {
  const layer = document.createElement('canvas');
  layer.width = layer.height = size;
  draw(layer.getContext('2d'));
  return layer;
}

function trace(ctx, points) {
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
}

function cutout(source, points) {
  return raster(ctx => {
    ctx.beginPath();
    trace(ctx, points);
    ctx.clip();
    ctx.drawImage(source, 0, 0, size, size);
  });
}

function patch(source, [x, y, rx, ry]) {
  return raster(ctx => {
    ctx.drawImage(source, 0, 0, size, size);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.translate(x, y);
    ctx.scale(rx, ry);
    const edge = ctx.createRadialGradient(0, 0, .58, 0, 0, 1);
    edge.addColorStop(0, '#fff');
    edge.addColorStop(1, '#fff0');
    ctx.fillStyle = edge;
    ctx.fillRect(-1, -1, 2, 2);
  });
}

function drawAt(ctx, [x, y], angle, lift, draw) {
  ctx.save();
  ctx.translate(x, y + lift);
  ctx.rotate(angle * Math.PI / 180);
  ctx.translate(-x, -y);
  draw();
  ctx.restore();
}

const within = (t, start, end) => t >= start && t < end;
const beat = (t, start, end) => within(t, start, end)
  ? Math.sin(Math.PI * (t - start) / (end - start)) ** 2
  : 0;

function ease(from, to, t) {
  const progress = Math.max(0, Math.min(1, (t - from) / (to - from)));
  return progress * progress * (3 - 2 * progress);
}

function prepare(person, master, speak, accent, blink, gesture) {
  return {
    ...person,
    head: cutout(master, person.head),
    torso: cutout(master, person.torso),
    arms: person.arms.map(points => cutout(master, points)),
    hand: cutout(master, person.hands),
    speaking: patch(speak, person.face.mouth),
    accent: patch(accent, person.face.mouth),
    brows: patch(accent, person.face.brows),
    blink: patch(blink, person.face.eyes),
    gesture: patch(gesture, person.handArea),
    accentHand: person.accentHandArea && patch(accent, person.accentHandArea),
  };
}

function renderPerson(person, t, isHost) {
  const breath = (1 - Math.cos(2 * Math.PI * t / (isHost ? 4 : 6))) / 2;
  const nod = isHost ? beat(t, 2.9, 4.0) - beat(t, 9.3, 10.6) : beat(t, 5.0, 6.2);
  const guestEmphasis = ease(1.27, 1.94, t) * (1 - ease(2.31, 3.38, t));
  const gesture = isHost
    ? beat(t, 4.1, 6.2) + .75 * beat(t, 7.2, 8.7)
    : guestEmphasis - .19 * beat(t, .83, 1.27) + .5 * beat(t, 9.36, 10.69);
  const speaking = (isHost ? within(t, 4.1, 8.6) : within(t, .55, 3.65) || within(t, 9.1, 10.65));
  const syllable = Math.floor(t * 10) % 8;
  const blink = (isHost ? within(t, 1.48, 1.60) || within(t, 8.96, 9.08) : within(t, 4.3, 4.43) || within(t, 10.83, 10.96));
  drawAt(context, person.waist, .15 * breath, -.48 * breath, () => {
    context.drawImage(person.torso, 0, 0);
    context.drawImage(person.arms[0], 0, 0);
    drawAt(context, person.elbow, (isHost ? 1.4 : -3.7) * gesture, 0, () => {
      context.drawImage(person.arms[1], 0, 0);
      drawAt(context, person.wrist, (isHost ? .8 : -1.5) * gesture, 0, () => {
        context.drawImage(person.hand, 0, 0);
      });
    });
    if (gesture > .45 && (isHost || guestEmphasis > .78)) {
      const hand = isHost && t < 6.2 ? person.accentHand : person.gesture;
      context.drawImage(hand, 0, 0);
    }
    drawAt(context, person.neck, .65 * nod, -.28 * nod, () => {
      context.drawImage(person.head, 0, 0);
      if (speaking && syllable > 1 && syllable < 7) {
        context.drawImage(isHost && syllable > 4 ? person.accent : person.speaking, 0, 0);
        if (isHost && syllable > 4) context.drawImage(person.brows, 0, 0);
      }
      if (blink) context.drawImage(person.blink, 0, 0);
    });
  });
}

async function init() {
  const [empty, master, speaking, accent, blink, gesture] = await Promise.all([
    load(art + 'reference/empty-studio-2d.webp'),
    load(art + 'reference/master%20image.png'),
    load(art + 'host/pilot-speaking.webp'),
    load(art + 'host/pilot-accent.webp'),
    load(art + 'host/pilot-blink.webp'),
    load(art + 'guest/entrepreneur/pilot-gesture.webp'),
  ]);
  const seated = [cutout(master, guest.seat), cutout(master, host.seat)];
  const puppets = [
    prepare(guest, master, speaking, accent, blink, gesture),
    prepare(host, master, speaking, accent, blink, gesture),
  ];
  let position = 0;
  let previous = 0;
  let frame = 0;
  let playing = false;

  function render() {
    context.drawImage(empty, 0, 0);
    for (const base of seated) context.drawImage(base, 0, 0);
    renderPerson(puppets[0], position, false);
    renderPerson(puppets[1], position, true);
    const light = .017 * beat(position, 0, duration);
    const glow = context.createRadialGradient(130, 365, 20, 130, 365, 310);
    glow.addColorStop(0, `rgba(255,176,76,${light})`);
    glow.addColorStop(1, '#ffa54800');
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
    seek.value = position;
    time.value = position.toFixed(2) + ' s';
  }

  function tick(now) {
    if (previous) position = (position + (now - previous) / 1000) % duration;
    previous = now;
    render();
    frame = requestAnimationFrame(tick);
  }

  function toggle(next) {
    playing = next;
    play.textContent = next ? 'Pause' : 'Play';
    cancelAnimationFrame(frame);
    previous = 0;
    if (next) frame = requestAnimationFrame(tick);
  }

  play.onclick = () => toggle(!playing);
  replay.onclick = () => { position = 0; render(); toggle(true); };
  seek.oninput = () => { toggle(false); position = Number(seek.value); render(); };
  document.querySelector('#full').onchange = event => {
    canvas.parentElement.classList.toggle('full', event.target.checked);
  };
  document.querySelector('#view').onchange = event => {
    const compare = event.target.value === 'master';
    if (compare) toggle(false);
    canvas.hidden = compare;
    document.querySelector('#master').hidden = !compare;
    play.disabled = replay.disabled = seek.disabled = compare;
  };
  play.disabled = replay.disabled = seek.disabled = false;
  status.hidden = true;
  render();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) toggle(true);
}

init().catch(error => {
  console.error(error);
  status.textContent = 'The pilot artwork could not load. Check the asset paths and reload.';
});
