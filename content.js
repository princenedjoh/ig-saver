const IG_APP_ID = '936619743392459';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// Real shortcodes are 10+ chars; the length floor also rejects /reels/audio/<id>/ links
const SHORTCODE_RE = /\/(?:p|reel|reels|tv)\/([\w-]{10,})/;
const MIN_MEDIA_SIZE = 200;

const ICONS = {
  download:
    '<svg viewBox="0 0 24 24"><path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>',
  loading: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-6.2-8.55"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  error: '<svg viewBox="0 0 24 24"><path d="M12 7v6"/><path d="M12 17h.01"/></svg>',
};

const mediaCache = new Map();
const tracked = new Map(); // root element -> { button }

function shortcodeToId(shortcode) {
  let id = 0n;
  for (const char of shortcode.slice(0, 11)) id = id * 64n + BigInt(ALPHABET.indexOf(char));
  return id.toString();
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function fileKey(url) {
  try {
    return new URL(url).pathname.split('/').pop();
  } catch {
    return '';
  }
}

function largest(versions) {
  return versions.reduce((best, v) => (v.width * v.height > best.width * best.height ? v : best));
}

async function fetchMedia(id) {
  if (mediaCache.has(id)) return mediaCache.get(id);

  const res = await fetch(`/api/v1/media/${id}/info/`, {
    credentials: 'include',
    headers: {
      'x-ig-app-id': IG_APP_ID,
      'x-csrftoken': getCookie('csrftoken'),
      'x-requested-with': 'XMLHttpRequest',
    },
  });
  if (!res.ok) throw new Error(`Instagram returned ${res.status}`);

  const item = (await res.json()).items?.[0];
  if (!item) throw new Error('Post not found');

  const nodes = item.carousel_media ?? [item];
  const media = nodes.map((node) => {
    const isVideo = Boolean(node.video_versions?.length);
    // Every file name this slide can show up as on the page (any size, poster included)
    const keys = [...(node.image_versions2?.candidates ?? []), ...(node.video_versions ?? [])].map((v) =>
      fileKey(v.url)
    );
    return {
      type: isVideo ? 'video' : 'image',
      url: largest(isVideo ? node.video_versions : node.image_versions2.candidates).url,
      keys,
    };
  });

  mediaCache.set(id, media);
  return media;
}

function findShortcode(root) {
  const article = root.closest('article');
  if (article) {
    const codes = [];
    for (const link of article.querySelectorAll('a[href]')) {
      const match = link.getAttribute('href').match(SHORTCODE_RE);
      if (match) codes.push(match[1]);
    }
    // When a post is open the URL names it, which beats whichever link comes first
    const urlCode = location.pathname.match(SHORTCODE_RE)?.[1];
    if (urlCode && codes.includes(urlCode)) return urlCode;
    return codes[0] ?? null; // never guess from outside the article: it would be another post
  }
  // Reels often live in a container whose link sits on an ancestor. Accept an
  // ancestor only while it holds exactly one post, so we never pick a neighbour's.
  let node = root.parentElement;
  for (let i = 0; node && i < 8; i++, node = node.parentElement) {
    const codes = new Set();
    for (const link of node.querySelectorAll('a[href*="/reel/"], a[href*="/p/"]')) {
      const match = link.getAttribute('href').match(SHORTCODE_RE);
      if (match) codes.add(match[1]);
    }
    if (codes.size > 1) break;
    if (codes.size === 1) return [...codes][0];
  }
  // The reels feed stacks many videos with no per-reel links; the URL tracks the
  // one on screen, so it only identifies a video whose centre is in the viewport.
  const rect = root.getBoundingClientRect();
  const centre = rect.top + rect.height / 2;
  if (centre < 0 || centre > innerHeight) return null;
  return location.pathname.match(SHORTCODE_RE)?.[1] ?? null;
}

// Story URLs look like /stories/<user>/<mediaId>/; highlights use a reel id we can't resolve.
// The id is added a moment after the story opens, so wait for it briefly.
async function storyTarget() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const [, section, user, id] = location.pathname.split('/');
    if (section !== 'stories') return null;
    if (user === 'highlights') throw new Error('Highlights are not supported yet');
    if (/^\d+$/.test(id ?? '')) return { id, name: `story_${user}_${id}` };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Could not identify this story');
}

// The carousel's dots: a row of tiny empty siblings, one per slide, where the
// active one is more opaque. They sit many levels away from the slide in the DOM,
// so find them by position instead: over or just under the slide on screen, with
// exactly one dot per slide so a stray group of small elements can't match.
function slideFromDots(el, count) {
  const frame = visibleRect(el);
  const rows = new Set();
  for (const dot of document.querySelectorAll('div:empty, span:empty')) {
    const r = dot.getBoundingClientRect();
    if (r.width === 0 || r.width > 12 || r.height === 0 || r.height > 12) continue;
    if (r.left < frame.left || r.right > frame.right || r.top < frame.top || r.top > frame.bottom + 60) continue;
    rows.add(dot.parentElement);
  }
  for (const row of rows) {
    const dots = [...row.children];
    if (dots.length !== count || dots.some((d) => d.children.length || d.getBoundingClientRect().width > 12)) continue;
    // The active dot carries an extra class the moment the slide changes; its
    // opacity only catches up after a short transition, so check the class first.
    const odd = dots.filter((d) => dots.filter((o) => o.className === d.className).length === 1);
    if (odd.length === 1) return dots.indexOf(odd[0]);
    const opacities = dots.map((d) => Number(getComputedStyle(d).opacity));
    const max = Math.max(...opacities);
    if (opacities.filter((o) => o === max).length === 1) return opacities.indexOf(max);
  }
  return -1;
}

// Index of the carousel slide on screen, or -1 if we can't tell
function currentSlide(root, media, shortcode) {
  const el = visibleMedia(root)?.el;
  if (!el) return -1;

  // Images (and videos with a poster) name their file, which the API lists per slide.
  // Carousel videos play from a blob: URL with no poster, so they need the fallbacks.
  const sources = [el.currentSrc, el.src, el.poster].filter((u) => u && !u.startsWith('blob:'));
  for (const src of sources) {
    const index = media.findIndex((m) => m.keys.includes(fileKey(src)));
    if (index !== -1) return index;
  }

  const fromDots = slideFromDots(el, media.length);
  if (fromDots !== -1) return fromDots;

  // An open post keeps ?img_index=<1-based slide> in the URL once you've moved off the first slide
  if (location.pathname.match(SHORTCODE_RE)?.[1] === shortcode) {
    const n = Number(new URLSearchParams(location.search).get('img_index') ?? 1);
    if (n >= 1 && n <= media.length) return n - 1;
  }
  return -1;
}

async function download(root, button) {
  setState(button, 'loading');
  try {
    const story = await storyTarget();
    const shortcode = story ? story.name : findShortcode(root);
    if (!shortcode) throw new Error('Could not identify this post');

    const media = await fetchMedia(story ? story.id : shortcodeToId(shortcode));
    const slide = media.length > 1 ? currentSlide(root, media, shortcode) : 0;
    if (slide === -1) throw new Error('Could not tell which slide is showing');

    const m = media[slide];
    const suffix = media.length > 1 ? `_${slide + 1}` : '';
    const items = [{ url: m.url, filename: `${shortcode}${suffix}.${m.type === 'video' ? 'mp4' : 'jpg'}` }];

    const res = await chrome.runtime.sendMessage({ type: 'download', items });
    if (!res?.ok) throw new Error(res?.error ?? 'Download failed');
    setState(button, 'done');
  } catch (err) {
    console.error('[IG Saver]', err);
    button.title = String(err.message ?? err);
    setState(button, 'error');
    showToast(button.title);
  }
  setTimeout(() => setState(button, 'idle'), 2000);
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'igs-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function setState(button, state) {
  button.dataset.state = state;
  button.innerHTML = ICONS[state === 'idle' ? 'download' : state];
}

function createButton(root) {
  const button = document.createElement('button');
  button.className = 'igs-btn';
  button.type = 'button';
  button.title = 'Download';
  button.setAttribute('aria-label', 'Download');
  setState(button, 'idle');
  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (button.dataset.state === 'loading') return;
    download(root, button);
  });
  document.body.appendChild(button);
  return button;
}

// The part of an element you can actually see: its box cut down by the viewport
// and by every ancestor that clips. A carousel lays its neighbouring slides out
// beside the current one and hides them with overflow, so the viewport alone
// would count them as fully visible.
function visibleRect(el) {
  const r = el.getBoundingClientRect();
  let left = Math.max(r.left, 0);
  let top = Math.max(r.top, 0);
  let right = Math.min(r.right, innerWidth);
  let bottom = Math.min(r.bottom, innerHeight);
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (right <= left || bottom <= top) break;
    const style = getComputedStyle(node);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const c = node.getBoundingClientRect();
    left = Math.max(left, c.left);
    top = Math.max(top, c.top);
    right = Math.min(right, c.right);
    bottom = Math.min(bottom, c.bottom);
  }
  return { left, top, right, bottom, width: Math.max(right - left, 0), height: Math.max(bottom - top, 0) };
}

// The visible media inside a root ({ el, rect }): the <img>/<video> with the most on screen
function visibleMedia(root) {
  const candidates = root.matches('img, video') ? [root] : root.querySelectorAll('img, video');
  let best = null;
  let bestArea = 0;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    if (r.width < MIN_MEDIA_SIZE || r.height < MIN_MEDIA_SIZE) continue;
    const rect = visibleRect(el);
    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = { el, rect };
      bestArea = area;
    }
  }
  return best;
}

function reposition() {
  for (const [root, { button }] of tracked) {
    if (!root.isConnected) {
      button.remove();
      tracked.delete(root);
      continue;
    }
    const rect = visibleMedia(root)?.rect;
    // Only show for media that's mostly on screen
    const visible = rect && rect.top < innerHeight - 80 && rect.bottom > 80;
    button.dataset.visible = String(Boolean(visible));
    if (!visible) continue;

    const top = Math.max(rect.top, 0) + 12;
    const right = Math.min(rect.right, innerWidth);
    button.style.top = `${Math.max(top, 64)}px`;
    button.style.left = `${right - 36 - 12}px`;
  }
}

let frame = 0;
function scheduleReposition() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    reposition();
  });
}

function isStorySized(el) {
  const r = el.getBoundingClientRect();
  return r.width >= 300 && r.height >= 400;
}

function scan() {
  const inStories = location.pathname.startsWith('/stories/');
  const roots = new Set(document.querySelectorAll('article'));
  for (const video of document.querySelectorAll('video')) {
    // Skip grid tiles (Explore, profiles): each is a video inside a post link
    if (video.closest('article, a[href*="/p/"], a[href*="/reel/"]')) continue;
    if (inStories && !isStorySized(video)) continue; // neighbouring users' small previews
    roots.add(video);
  }
  if (inStories) {
    for (const img of document.querySelectorAll('img')) {
      if (isStorySized(img)) roots.add(img); // story photo, not avatars
    }
  } else if (SHORTCODE_RE.test(location.pathname)) {
    // An open post (its own page or the overlay) isn't wrapped in an <article>, so
    // its photos need roots of their own. Skip the "more posts" tiles, which are links.
    for (const img of document.querySelectorAll('img')) {
      if (img.closest('article, a[href]')) continue;
      const r = img.getBoundingClientRect();
      if (r.width >= MIN_MEDIA_SIZE && r.height >= MIN_MEDIA_SIZE) roots.add(img);
    }
  }
  for (const root of roots) {
    if (!tracked.has(root)) tracked.set(root, { button: createButton(root) });
  }
  scheduleReposition();
}

new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
addEventListener('scroll', scheduleReposition, { capture: true, passive: true });
addEventListener('resize', scheduleReposition);
setInterval(scheduleReposition, 300); // catches carousel slides and reel snap transforms
setInterval(scan, 1000); // story photos load without a DOM mutation we observe
scan();
