import { PageFlip } from 'page-flip';

const duration = 12;
// Crop off the ceiling while keeping the logo, chair frames, and seated poses.
const cropTop = 129;
const cropHeight = 1125;
const canvasWidth = 627;
const assetRoot = './images/hero-ist/';
const roles = [
  { id: 'entrepreneur', name: 'Entrepreneur', count: 5 },
  { id: 'businessman', name: 'Businessman', count: 5 },
  { id: 'philosopher', name: 'Philosopher', count: 5 },
];
// The final page repeats the first guest so the library can perform a real curl
// at the end of every cycle, then reset invisibly to page zero.
const pageRoles = [0, 1, 2, 0];
const poseUrl = (group, role, index) => group === 'host'
  ? `${assetRoot}host/poses/host-${String(index + 1).padStart(2, '0')}.webp`
  : `${assetRoot}guest/${role}/poses/${role}-${String(index + 1).padStart(2, '0')}.webp`;
const $ = selector => document.querySelector(selector);
const pageElements = [...document.querySelectorAll('.guest-page')];
const pageCanvases = pageElements.map(element => element.querySelector('canvas'));
const hostCanvas = $('#host-canvas');
const hostContext = hostCanvas.getContext('2d');
const guestPagesRoot = $('#guest-pages');
const replayButton = $('#replay');
const seek = $('#seek');
const timeLabel = $('#time');
const guestName = $('#guest-name');
const status = $('#status');
const book = $('.book');
const audioSignal = $('.audio-transmission');
const hostTimeline = [[0, 0], [1.15, 1], [1.34, 0], [2.35, 2], [3.05, 3], [3.23, 0], [4.8, 4], [5.8, 5], [6.5, 6], [7.5, 7], [8.7, 8], [10.1, 9], [11.4, 0]];
const guestTimeline = [[0, 0], [.75, 1], [1.9, 2], [3.05, 1], [4.1, 2], [5.05, 4], [6.2, 0], [7.55, 3], [8.25, 0], [10.15, 4], [11.35, 0]];
let selected = 0;
let position = 0;
let turning = false;
let hostClock = 0;
let previous = 0;
let raf = 0;
let emptyStudio;
let guestPoses;
let hostPoses;
let pageFlip;
let resettingWrap = false;

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

function posesFor(group, role, count) {
  return Promise.all(Array.from({ length: count }, (_, index) => loadImage(poseUrl(group, role, index))));
}

function timelineIndex(timeline, time) {
  const t = Math.min(duration - .001, Math.max(0, time));
  let event = 0;
  while (event + 1 < timeline.length && timeline[event + 1][0] <= t) event += 1;
  const index = timeline[event][1];
  const following = timeline[event + 1];
  const fadeDuration = .18;
  const blend = following && t >= following[0] - fadeDuration
    ? Math.min(1, (t - (following[0] - fadeDuration)) / fadeDuration)
    : 0;
  return { index, nextIndex: following?.[1] ?? index, blend };
}

function drawCharacter(context, side, roleIndex, sceneTime, movementTime) {
  const role = roles[roleIndex];
  const poses = side === 'host' ? hostPoses : guestPoses[role.id];
  const sourceX = side === 'host' ? canvasWidth : 0;
  const { index, nextIndex, blend } = timelineIndex(side === 'host' ? hostTimeline : guestTimeline, sceneTime);
  const offsetX = Math.sin(movementTime * (side === 'host' ? .31 : .25)) * .7;
  const offsetY = Math.sin(movementTime * (side === 'host' ? .82 : .67)) * 1.2;
  context.save();
  context.translate(offsetX, offsetY);
  context.globalAlpha = 1 - blend;
  context.drawImage(poses[index], sourceX, cropTop, canvasWidth, cropHeight, 0, 0, canvasWidth, cropHeight);
  if (blend > 0) {
    context.globalAlpha = blend;
    context.drawImage(poses[nextIndex], sourceX, cropTop, canvasWidth, cropHeight, 0, 0, canvasWidth, cropHeight);
  }
  context.restore();
}

function paintBackground(context, side) {
  const sourceX = side === 'host' ? canvasWidth : 0;
  context.clearRect(0, 0, canvasWidth, cropHeight);
  context.drawImage(emptyStudio, sourceX, cropTop, canvasWidth, cropHeight, 0, 0, canvasWidth, cropHeight);
}

function updateGuestLabel() {
  const role = roles[selected];
  guestName.value = `${role.name} guest`;
  book.setAttribute('aria-label', `Podcast conversation: ${role.name} guest on the left, Manisha, the host, on the right.`);
}

function render() {
  if (!emptyStudio || !guestPoses || !hostPoses) return;
  const hostTime = hostClock % duration;
  paintBackground(hostContext, 'host');
  drawCharacter(hostContext, 'host', selected, hostTime, hostClock);

  pageCanvases.forEach((canvas, pageIndex) => {
    const roleIndex = pageRoles[pageIndex];
    const context = canvas.getContext('2d');
    paintBackground(context, 'guest');
    const sceneTime = !turning && pageIndex === pageFlip?.getCurrentPageIndex() ? position : 0;
    drawCharacter(context, 'guest', roleIndex, sceneTime, hostClock + (pageIndex * 1.7));
  });

  const speaker = turning ? 'turn' : (position < 4.5 || position >= 7.4 ? 'guest' : 'host');
  if (audioSignal.dataset.speaker !== speaker) audioSignal.dataset.speaker = speaker;

  seek.value = String(Math.min(duration, position));
  timeLabel.value = `${Math.min(duration, position).toFixed(2)} s`;
}

function onFlip({ data }) {
  if (resettingWrap) return;
  turning = false;
  book.classList.remove('is-turning');
  const index = Number(data);
  selected = pageRoles[index] ?? 0;
  position = 0;
  updateGuestLabel();

  // Page four repeats page one, so the curl is visible even on the wraparound.
  // Re-index the same four pages without a visual change after it lands.
  if (index === pageRoles.length - 1) {
    resettingWrap = true;
    pageFlip.updateFromHtml(pageElements);
    pageFlip.turnToPage(0);
    resettingWrap = false;
  }
  render();
}

function tick(now) {
  if (previous) {
    const delta = Math.min(.08, (now - previous) / 1000);
    hostClock += delta;
    if (!turning) position += delta;
  }
  previous = now;
  if (!turning && position >= duration) {
    position = duration;
    turning = true;
    book.classList.add('is-turning');
    pageFlip.flipNext('bottom');
  }
  render();
  raf = requestAnimationFrame(tick);
}

function start() {
  cancelAnimationFrame(raf);
  previous = 0;
  raf = requestAnimationFrame(tick);
}

async function init() {
  try {
    const [studio, guestLists, hosts] = await Promise.all([
      loadImage(assetRoot + 'reference/empty-studio-2d.webp'),
      Promise.all(roles.map(role => posesFor('guest', role.id, role.count))),
      posesFor('host', 'host', 10),
    ]);
    emptyStudio = studio;
    guestPoses = Object.fromEntries(roles.map((role, index) => [role.id, guestLists[index]]));
    hostPoses = hosts;
    await Promise.all(pageElements.map(page => page.querySelector('img').decode()));

    pageFlip = new PageFlip(guestPagesRoot, {
      width: 627,
      height: cropHeight,
      size: 'stretch',
      minWidth: 400,
      maxWidth: 1000,
      minHeight: 300,
      maxHeight: cropHeight,
      usePortrait: true,
      flippingTime: matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1100,
      drawShadow: true,
      maxShadowOpacity: .34,
      autoSize: false,
      showCover: false,
      mobileScrollSupport: false,
      showPageCorners: false,
      disableFlipByClick: true,
      useMouseEvents: false,
    });
    pageFlip.loadFromHTML(pageElements);
    pageFlip.on('flip', onFlip);

    replayButton.disabled = seek.disabled = false;
    status.hidden = true;
    updateGuestLabel();
    render();
    // Reduced-motion visitors retain the still first pose and skip autoplay.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) start();
  } catch (error) {
    status.textContent = `Could not load the pilot artwork: ${error.message}`;
    replayButton.disabled = seek.disabled = true;
    console.error(error);
  }
}

replayButton.addEventListener('click', () => {
  cancelAnimationFrame(raf);
  if (pageFlip.getCurrentPageIndex() !== 0) pageFlip.turnToPage(0);
  selected = 0;
  position = 0;
  updateGuestLabel();
  render();
  start();
});
seek.addEventListener('input', () => {
  position = Number(seek.value);
  render();
});
seek.addEventListener('change', () => {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) start();
});

init();
