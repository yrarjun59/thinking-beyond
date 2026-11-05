const duration = 12;
const assetRoot = './images/hero-ist/';
const roles = [
  { id: 'entrepreneur', name: 'Entrepreneur', count: 5 },
  { id: 'businessman', name: 'Businessman', count: 5 },
  { id: 'philosopher', name: 'Philosopher', count: 5 },
];
const poseUrl = (group, role, index) => group === 'host'
  ? `${assetRoot}host/poses/host-${String(index + 1).padStart(2, '0')}.webp`
  : `${assetRoot}guest/${role}/poses/${role}-${String(index + 1).padStart(2, '0')}.webp`;
const $ = selector => document.querySelector(selector);
const front = $('#guest-front');
const back = $('#guest-back');
const hostCanvas = $('#host-canvas');
const frontContext = front.getContext('2d');
const backContext = back.getContext('2d');
const hostContext = hostCanvas.getContext('2d');
const book = $('.book');
const leaf = $('#guest-leaf');
const playButton = $('#play');
const replayButton = $('#replay');
const seek = $('#seek');
const timeLabel = $('#time');
const guestName = $('#guest-name');
const status = $('#status');
const hostTimeline = [[0, 0], [1.15, 1], [1.34, 0], [2.35, 2], [3.05, 3], [3.23, 0], [4.8, 4], [5.8, 5], [6.5, 6], [7.5, 7], [8.7, 8], [10.1, 9], [11.4, 0]];
const guestTimeline = [[0, 0], [.75, 1], [1.9, 2], [3.05, 1], [4.1, 2], [5.05, 4], [6.2, 0], [7.55, 3], [8.25, 0], [10.15, 4], [11.35, 0]];
let selected = 0;
let position = 0;
let playing = false;
let turning = false;
let previous = 0;
let raf = 0;

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

function posesFor(group, role, count) {
  return Promise.all(Array.from({ length: count }, (_, index) => loadImage(poseUrl(group, role, index))));
}

function drawPage(context, side, roleIndex, sceneTime, movementTime) {
  const role = roles[roleIndex];
  const poses = side === 'host' ? hostPoses : guestPoses[role.id];
  const backgroundX = side === 'host' ? 627 : 0;
  context.clearRect(0, 0, 627, 1254);
  context.drawImage(emptyStudio, backgroundX, 0, 627, 1254, 0, 0, 627, 1254);

  const timeline = side === 'host' ? hostTimeline : guestTimeline;
  const t = Math.min(duration - .001, Math.max(0, sceneTime));
  let event = 0;
  while (event + 1 < timeline.length && timeline[event + 1][0] <= t) event += 1;
  const index = timeline[event][1];
  const following = timeline[event + 1];
  const fadeDuration = .075;
  const blend = following && t >= following[0] - fadeDuration
    ? Math.min(1, (t - (following[0] - fadeDuration)) / fadeDuration)
    : 0;
  const nextIndex = following?.[1] ?? index;
  const offsetX = Math.sin(movementTime * (side === 'host' ? 0.63 : 0.48)) * 1.1;
  const offsetY = Math.sin(movementTime * (side === 'host' ? 1.35 : 1.06)) * 1.55;
  const sourceX = side === 'host' ? 627 : 0;
  context.save();
  context.translate(offsetX, offsetY);
  context.globalAlpha = 1 - blend;
  context.drawImage(poses[index], sourceX, 0, 627, 1254, 0, 0, 627, 1254);
  if (blend > 0) {
    context.globalAlpha = blend;
    context.drawImage(poses[nextIndex], sourceX, 0, 627, 1254, 0, 0, 627, 1254);
  }
  context.restore();
}

function render() {
  drawPage(frontContext, 'guest', selected, position, position);
  drawPage(hostContext, 'host', selected, position, position);
  seek.value = String(Math.min(duration, position));
  timeLabel.value = `${Math.min(duration, position).toFixed(2)} s`;
  guestName.value = `${roles[selected].name} guest`;
  book.setAttribute('aria-label', `Open book studio. ${roles[selected].name} guest on the left page and Manisha, the host, on the right page.`);
}

function prepareBack(nextIndex) {
  drawPage(backContext, 'guest', nextIndex, 0, 0);
}

function finishTurn() {
  if (!turning) return;
  leaf.classList.remove('is-turning');
  turning = false;
  leaf.removeEventListener('animationend', finishTurn);
  selected = pendingIndex;
  position = 0;
  render();
  // Prepare the reverse side for the next automatic turn.
  prepareBack((selected + 1) % roles.length);
  if (pendingPlay) {
    pendingPlay = false;
    start();
  }
}

let pendingIndex = 0;
let pendingPlay = false;
function turnTo(index, resumeAfter = false) {
  if (turning) return;
  if (index === selected) {
    position = 0;
    render();
    if (resumeAfter) start();
    return;
  }
  pendingIndex = index;
  pendingPlay = resumeAfter;
  turning = true;
  prepareBack(index);
  leaf.addEventListener('animationend', finishTurn, { once: true });
  leaf.classList.add('is-turning');
  // Reduced motion can make the CSS animation effectively instantaneous.
  window.setTimeout(finishTurn, 1250);
}

function tick(now) {
  if (!playing) return;
  if (previous) {
    const delta = Math.min(.08, (now - previous) / 1000);
    if (!turning) position += delta;
  }
  previous = now;
  if (!turning && position >= duration) {
    position = duration;
    turnTo((selected + 1) % roles.length, true);
  }
  render();
  raf = requestAnimationFrame(tick);
}

function start() {
  playing = true;
  playButton.textContent = 'Pause';
  cancelAnimationFrame(raf);
  previous = 0;
  raf = requestAnimationFrame(tick);
}

function pause() {
  playing = false;
  pendingPlay = false;
  playButton.textContent = 'Play';
  previous = 0;
  cancelAnimationFrame(raf);
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
    playButton.disabled = replayButton.disabled = seek.disabled = false;
    status.hidden = true;
    render();
    prepareBack(1);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) start();
  } catch (error) {
    status.textContent = `Could not load the pilot artwork: ${error.message}`;
    playButton.disabled = replayButton.disabled = seek.disabled = true;
    console.error(error);
  }
}

let emptyStudio;
let guestPoses;
let hostPoses;
playButton.addEventListener('click', () => playing ? pause() : start());
replayButton.addEventListener('click', () => {
  pause();
  if (selected !== 0) turnTo(0, true);
  else { position = 0; render(); start(); }
});
seek.addEventListener('input', () => {
  pause();
  position = Number(seek.value);
  render();
});
init();
