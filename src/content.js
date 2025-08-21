/* global Chart */

// =========================
// Constants & State
// =========================
const LS = {
  RATINGS: 'lc_ratings_cache_v1',
  RATINGS_TS: 'lc_ratings_cache_ts_v1',
  FOCUS: 'lc_focus_tags_v1',
  SOLVED: 'lc_solved_set_v1',
  TAGMAP: 'lc_tag_map_v1' // NEW: Map of slug -> [tags]
};

const RATING_SOURCES = [
  "https://raw.githubusercontent.com/zerotrac/leetcode_problem_rating/main/ratings.txt",
  "https://cdn.jsdelivr.net/gh/zerotrac/leetcode_problem_rating/ratings.txt"
];

let problemRatingsMap = null; // Map(slug -> { slug, rating, title })
let chartInstances = { rating: null, tags: null };

const KAGGLE_TAGS_URL = chrome.runtime.getURL('data/kaggle_tags.json');

// =========================
// Storage helpers
// =========================
const storageGet = (keys) => new Promise(res => chrome.storage.local.get(keys, res));
const storageSet = (obj)  => new Promise(res => chrome.storage.local.set(obj, res));

// =========================
/** Utilities */
// =========================
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uniq = (arr) => Array.from(new Set(arr));
const median = (arr) => {
  if (!arr?.length) return 0;
  const a = [...arr].sort((x,y)=>x-y), m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : Math.floor((a[m-1] + a[m]) / 2);
};

function pageParts() { return location.pathname.split('/').filter(Boolean); }
function isProblemPage() {
  const p = pageParts(); const i = p.indexOf('problems');
  return i >= 0 && !!p[i+1];
}
function isProfilePage() {
  // Typical profile urls: /u/<username>/ or /profile/<username> or /<username> (legacy)
  const p = pageParts();
  if (p.includes('problems')) return false;
  if (p[0] === 'u' && p[1]) return true;
  if (p[0] === 'profile' && p[1]) return true;
  // Heuristic: one segment (username) with trailing slash on home domain
  return p.length === 1 && !!p[0];
}
function getUsername() {
  const p = pageParts();
  if (p[0] === 'u' && p[1]) return p[1];
  if (p[0] === 'profile' && p[1]) return p[1];
  if (p.length === 1) return p[0];
  return null;
}

function parseTopicTags(raw) {
  if (!raw) return [];
  // split on comma/semicolon, remove "1+"/"2+", trim and normalize spacing/case
  return raw
    .split(/[;,]/g)
    .map(s => s.replace(/\b\d\+\b/g, '').trim())
    .filter(Boolean)
    .map(s => s.replace(/\s+/g, ' '))
    .map(s => s[0]?.toUpperCase() + s.slice(1)); // Title Case-ish
}

function linkToSlug(url) {
  const m = (url || '').match(/leetcode\.com\/problems\/([^\/?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

async function loadKaggleTagMap() {
  try {
    const r = await fetch(KAGGLE_TAGS_URL);
    if (!r.ok) return new Map();
    const data = await r.json();

    // Support both formats
    if (!Array.isArray(data)) {
      // Option A: { "slug": ["Tag1","Tag2"] }
      return new Map(Object.entries(data).map(([slug, tags]) => [slug.toLowerCase(), tags]));
    }

    // Option B: array of rows
    const map = new Map();
    for (const row of data) {
      const slug = linkToSlug(row.Question_Link) || (row.Slug?.toLowerCase());
      if (!slug) continue;
      const tags = Array.isArray(row.Topic_tags) ? row.Topic_tags : parseTopicTags(row.Topic_tags);
      if (tags.length) map.set(slug, tags);
    }
    return map;
  } catch {
    return new Map();
  }
}

// =========================
/** Ratings loader (weekly cache) */
// =========================
function parseRatingsText(txt) {
  const map = new Map();
  if (!txt) return map;

  const lines = txt.split(/\r?\n/).filter(Boolean);

  // Detect TSV with header (preferred path)
  const first = lines[0] || "";
  const looksTSV = first.includes("\t") && /title\s*slug/i.test(first);

  if (looksTSV) {
    for (const line of lines) {
      const parts = line.split("\t");
      // Skip header or malformed
      if (!parts || parts.length < 5 || /^rating$/i.test(parts[0])) continue;

      const rating = parseFloat(parts[0]);                     // "Rating"
      const slug = (parts[4] || "").trim().toLowerCase();     // "Title Slug"
      const title = (parts[2] || "").trim() || slug;          // "Title"

      if (!slug || !Number.isFinite(rating)) continue;
      // store rounded rating (int) for bucketing; keep exact if you prefer floats
      map.set(slug, { slug, rating: Math.round(rating), title });
    }
    if (map.size) return map;
  }

  // Fallback: legacy "slug rating title..."
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(\S+)\s+([\d.]+)\s+(.+)$/);
    if (!m) continue;
    const slug = m[1].toLowerCase();
    const rating = parseFloat(m[2]);
    const title = m[3].trim();
    if (!slug || !Number.isFinite(rating)) continue;
    map.set(slug, { slug, rating: Math.round(rating), title });
  }
  return map;
}

async function ensureRatingsLoaded() {
  if (problemRatingsMap) return true;

  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  const { [LS.RATINGS]: cached, [LS.RATINGS_TS]: ts } = await storageGet([LS.RATINGS, LS.RATINGS_TS]);

  if (cached && ts && now - ts < week) {
    problemRatingsMap = new Map(cached);
    return true;
  }

  let txt = null;
  for (const url of RATING_SOURCES) {
    try {
      const r = await fetch(url, { cache: "no-cache" });
      if (r.ok) { txt = await r.text(); break; }
    } catch (_) {}
  }
  if (!txt) return false;

  const parsed = parseRatingsText(txt);
  if (!parsed.size) return false;

  problemRatingsMap = parsed;
  await storageSet({ [LS.RATINGS]: Array.from(parsed.entries()), [LS.RATINGS_TS]: now });
  return true;
}

// =========================
/** Auth helper (for CSRF header on POST if needed) */
// =========================
async function getAuthCookies() {
  return await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_COOKIES' }, (res) => {
      resolve(res || { ok: false });
    });
  });
}

// =========================
/** GraphQL helpers */
// =========================
async function gql(query, variables = {}) {
  const { csrftoken } = (await getAuthCookies()) || {};
  const headers = {
    "Content-Type": "application/json",
    "X-CSRFToken": csrftoken || ""
  };
  const r = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ query, variables })
  });
  return r.json();
}

async function getSignedInUsername() {
  const Q = `query globalData { userStatus { isSignedIn username } }`;
  try {
    const j = await gql(Q, {});
    const s = j?.data?.userStatus;
    return s?.isSignedIn ? (s.username || null) : null;
  } catch { return null; }
}

async function fetchQuestionDetail(slug) {
  const Q = `
    query questionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        title
        difficulty
        topicTags { name }
      }
    }`;
  const j = await gql(Q, { titleSlug: slug });
  const q = j?.data?.question;
  if (!q) return null;
  return {
    title: q.title,
    difficulty: q.difficulty,
    tags: (q.topicTags || []).map(t => t.name)
  };
}

// Owner view: paginate problem list and keep status === "ac"
async function fetchSolvedByOwner() {
  const Q = `
    query problemsetQuestionList($skip: Int!, $limit: Int!, $filters: QuestionListFilterInput) {
      questionList(skip: $skip, limit: $limit, filters: $filters) {
        data {
          title
          titleSlug
          difficulty
          status
          topicTags { name }
        }
      }
    }`;

  const solved = [];
  for (let skip = 0; skip < 2000; skip += 50) { // up to ~2000 problems
    const j = await gql(Q, { skip, limit: 50, filters: {} });
    const arr = j?.data?.questionList?.data || [];
    if (!arr.length) break;
    for (const q of arr) {
      if (q?.status === "ac") {
        solved.push({
          slug: (q.titleSlug || "").toLowerCase(),
          title: q.title,
          difficulty: q.difficulty,
          tags: (q.topicTags || []).map(t => t.name)
        });
      }
    }
    if (arr.length < 50) break;
  }
  return solved;
}

// Pulls ALL problems with your AC status; cookies included because we're same-origin.
async function fetchSolvedByREST() {
  try {
    const r = await fetch("https://leetcode.com/api/problems/all/", { credentials: "include" });
    const j = await r.json();
    const arr = j?.stat_status_pairs || [];
    const solved = [];
    for (const it of arr) {
      if (it?.status === "ac") {
        const slug = (it.stat?.question__title_slug || "").toLowerCase();
        const title = it.stat?.question__title || slug;
        const level = it.difficulty?.level;
        const difficulty = level === 1 ? "Easy" : level === 2 ? "Medium" : level === 3 ? "Hard" : null;
        if (slug) solved.push({ slug, title, difficulty, tags: [] });
      }
    }
    return solved;
  } catch (e) {
    console.warn("REST solved fallback failed", e);
    return [];
  }
}

// Public fallback: recent ACs for a username (limited history)
async function fetchRecentAC(username) {
  const Q = `
    query recentAcSubmissions($username: String!) {
      recentAcSubmissionList(username: $username) {
        title
        titleSlug
      }
    }`;
  const j = await gql(Q, { username });
  const arr = j?.data?.recentAcSubmissionList || [];
  // De-dup by slug, keep only slug + fill detail later if needed
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const slug = (s?.titleSlug || "").toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: s?.title || s?.titleSlug, difficulty: null, tags: [] });
  }
  return out;
}

// Query by tag to gather candidates (used for recommendations & similar list)
async function queryByTag(tag, limitEach = 100) {
  const Q = `
    query problemsetByTag($skip:Int!, $limit:Int!, $filters: QuestionListFilterInput) {
      questionList(skip:$skip, limit:$limit, filters:$filters) {
        data { titleSlug title topicTags { name } }
      }
    }`;
  const out = [];
  const seen = new Set();
  for (let skip = 0; skip < limitEach; skip += 50) {
    const j = await gql(Q, { skip, limit: 50, filters: { tags: [tag] } });
    const arr = j?.data?.questionList?.data || [];
    if (!arr.length) break;
    for (const q of arr) {
      const slug = (q?.titleSlug || "").toLowerCase();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, title: q?.title, tags: (q?.topicTags || []).map(t => t.name) });
    }
    if (arr.length < 50) break;
  }
  return out;
}

// Fetch full question list with tags and cache slug -> [tags]
async function buildTagMap() {
  const { [LS.TAGMAP]: cached } = await storageGet([LS.TAGMAP]);
  if (Array.isArray(cached) && cached.length) return new Map(cached);

  // 1) Seed from Kaggle (instant)
  let tagMap = await loadKaggleTagMap();

  // 2) Overlay with GraphQL (authoritative, may add/refresh)
  const Q_A = `
    query Q_A($skip:Int!, $limit:Int!) {
      questionList(skip:$skip, limit:$limit, filters:{}) {
        data { titleSlug topicTags { name } }
      }
    }`;
  const Q_B = `
    query Q_B($categorySlug:String, $skip:Int!, $limit:Int!, $filters: QuestionListFilterInput) {
      problemsetQuestionList(categorySlug:$categorySlug, skip:$skip, limit:$limit, filters:$filters) {
        questions { titleSlug topicTags { name } }
      }
    }`;

  async function overlayWithQueryA() {
    for (let skip = 0; skip < 5000; skip += 50) {
      const j = await gql(Q_A, { skip, limit: 50 });
      const arr = j?.data?.questionList?.data || [];
      if (!arr.length) break;
      for (const q of arr) {
        const slug = (q?.titleSlug || '').toLowerCase();
        if (!slug) continue;
        const tags = (q?.topicTags || []).map(t => t.name);
        if (tags.length) tagMap.set(slug, tags);
      }
      if (arr.length < 50) break;
    }
  }

  async function overlayWithQueryB() {
    for (let skip = 0; skip < 5000; skip += 50) {
      const j = await gql(Q_B, { categorySlug: "all-code-essentials", skip, limit: 50, filters: {} });
      const arr = j?.data?.problemsetQuestionList?.questions || [];
      if (!arr.length) break;
      for (const q of arr) {
        const slug = (q?.titleSlug || '').toLowerCase();
        if (!slug) continue;
        const tags = (q?.topicTags || []).map(t => t.name);
        if (tags.length) tagMap.set(slug, tags);
      }
      if (arr.length < 50) break;
    }
  }

  await overlayWithQueryA();
  if (tagMap.size === 0) await overlayWithQueryB();

  // 3) Cache for future loads
  if (tagMap.size) await storageSet({ [LS.TAGMAP]: Array.from(tagMap.entries()) });
  return tagMap;
}

// Ensure solved[] has tags; if many are missing, hydrate from tag map
async function hydrateSolvedTags(solved) {
  const withTags = solved.filter(p => (p.tags && p.tags.length));
  const coverage = withTags.length / Math.max(solved.length, 1);
  if (coverage >= 0.6) return solved; // good enough

  const tagMap = await buildTagMap();
  for (const p of solved) {
    if (!p.tags || p.tags.length === 0) {
      const tags = tagMap.get((p.slug || "").toLowerCase());
      if (tags?.length) p.tags = tags;
    }
  }
  return solved;
}

// =========================
/** Recommendations */
// =========================
function pickFocusTags(solved) {
  // choose 3 tags with smallest normalized coverage (min 3 solves to be meaningful)
  const count = {};
  for (const p of solved) for (const t of (p.tags || [])) count[t] = (count[t] || 0) + 1;
  const total = Math.max(solved.length, 1);
  const candidates = Object.entries(count)
    .map(([tag, c]) => ({ tag, c, ratio: c / total }))
    .filter(x => x.c >= 3)
    .sort((a,b) => a.ratio - b.ratio);
  return candidates.slice(0, 3).map(x => x.tag);
}

async function recommendProblems({ solvedSet, targetRating, selectedTags, cap = 12 }) {
  if (!selectedTags?.length || !problemRatingsMap) return [];
  const pools = await Promise.all(selectedTags.map(t => queryByTag(t, 100)));
  const slugs = uniq(pools.flat().map(x => x.slug));
  const withR = slugs
    .map(s => problemRatingsMap.get(s))
    .filter(Boolean)
    .filter(p => p.rating >= targetRating - 50 && p.rating <= targetRating + 150)
    .filter(p => !solvedSet.has(p.slug)); // unsolved only
  withR.sort((a,b) => {
    // prefer just-above target
    const da = a.rating >= targetRating ? (a.rating - targetRating) : (a.rating - targetRating) * 2;
    const db = b.rating >= targetRating ? (b.rating - targetRating) : (b.rating - targetRating) * 2;
    return da - db;
  });
  return withR.slice(0, cap).map(p => ({ slug: p.slug, title: p.title || p.slug, rating: p.rating }));
}

async function similarProblems({ baseSlug, baseRating, baseTags, solvedSet, cap = 10 }) {
  const tags = baseTags?.slice(0, 2) || [];
  if (!tags.length || !baseRating) return [];
  const recs = await recommendProblems({ solvedSet, targetRating: baseRating, selectedTags: tags, cap: 50 });
  const filtered = recs.filter(p => p.slug !== baseSlug)
                       .sort((a,b) => Math.abs(a.rating - baseRating) - Math.abs(b.rating - baseRating))
                       .slice(0, cap);
  return filtered;
}

// =========================
/** UI helpers */
// =========================
function injectAnalyticsContainer() {
  if (document.getElementById('lc-analytics-container')) return true;

  // Try main content column; fallback to body
  const mounts = [
    'main', '#__next main', '[data-testid="profile-content"]', '#main-content', 'body'
  ];
  let parent = null;
  for (const sel of mounts) { parent = document.querySelector(sel); if (parent) break; }
  if (!parent) parent = document.body;

  const box = document.createElement('div');
  box.id = 'lc-analytics-container';
  box.innerHTML = `
    <div class="lc-title"> Profile Analytics</div>
    <div class="lc-subtle" id="lc-note"></div>
    <div class="lc-grid lc-2" style="margin-top:10px">
      <div>
        <canvas id="lc-rating-chart" class="lc-canvas"></canvas>
      </div>
      <div>
        <canvas id="lc-tags-chart" class="lc-canvas"></canvas>
      </div>
    </div>
    <div style="margin-top:14px">
      <div style="font-weight:700;margin-bottom:6px;">Focus topics</div>
      <div id="lc-focus-tags" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
      <div class="lc-subtle" style="margin-top:6px;">Tip: click chips to toggle; saved automatically.</div>
    </div>
    <div style="margin-top:16px">
      <div class="lc-title" style="font-size:15px;margin-bottom:10px;">Recommended Problems</div>
      <div id="lc-recs" class="lc-list lc-subtle">Loading…</div>
    </div>
  `;
  parent.prepend(box);
  return true;
}

function injectProblemCard() {
  if (document.getElementById('lc-problem-helper')) return true;
  const mounts = ['aside', '#main-content', 'main', 'body'];
  let parent = null;
  for (const sel of mounts) { parent = document.querySelector(sel); if (parent) break; }
  if (!parent) parent = document.body;

  const card = document.createElement('div');
  card.id = 'lc-problem-helper';
  card.innerHTML = `
    <div class="lc-title">Problem Insights</div>
    <div id="lc-problem-rating" class="lc-subtle">Loading rating…</div>
    <div style="font-weight:700;margin:10px 0 6px;">Similar rated in same tags</div>
    <div id="lc-problem-similar" class="lc-list lc-subtle">Loading…</div>
  `;
  parent.prepend(card);
  return true;
}

function renderChips(allTags, selected, onToggle) {
  const wrap = document.getElementById('lc-focus-tags');
  wrap.innerHTML = '';
  for (const tag of allTags) {
    const b = document.createElement('button');
    b.className = 'lc-chip' + (selected.has(tag) ? ' lc-chip--active' : '');
    b.textContent = tag;
    b.onclick = () => onToggle(tag);
    wrap.appendChild(b);
  }
}

function renderRecs(list) {
  const el = document.getElementById('lc-recs');
  if (!list.length) {
    el.innerHTML = `<div>No candidates found for current topics. Try toggling chips.</div>`;
    return;
  }
  el.innerHTML = list.map(r => `
    <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
      <a href="https://leetcode.com/problems/${r.slug}/" target="_blank">${r.title}</a>
      <span class="lc-badge">${r.rating}</span>
    </div>
  `).join('');
}

// =========================
/** Charts */
// =========================
function drawRatingChart(ctx, ratings) {
  const buckets = {};
  for (const r of ratings) {
    const b = Math.floor(r / 200) * 200; // 0–199, 200–399, …
    buckets[b] = (buckets[b] || 0) + 1;
  }
  const keys = Object.keys(buckets).map(Number).sort((a,b)=>a-b);
  const labels = keys.map(k => `${k}-${k+199}`);
  const data = keys.map(k => buckets[k]);

  if (chartInstances?.rating) chartInstances.rating.destroy();
  chartInstances.rating = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Solved by rating band", data }] },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { grid: { color: "#222" } }, y: { grid: { color: "#222" }, beginAtZero: true } }
    }
  });
}

function drawTagsChart(ctx, tagCounts) {
  const entries = Object.entries(tagCounts).filter(([,c]) => c > 0).sort((a,b)=>b[1]-a[1]).slice(0, 12);
  if (chartInstances?.tags) chartInstances.tags.destroy();

  if (!entries.length) {
    // draw a small note instead of an empty chart
    const c = ctx.canvas;
    const g = ctx;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#a7a7a7';
    g.font = '12px system-ui, -apple-system, Segoe UI';
    g.fillText('No tag data yet. Open a few problem pages or refresh once.', 8, 20);
    return;
  }

  chartInstances.tags = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: entries.map(e=>e[0]), datasets: [{ data: entries.map(e=>e[1]) }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#ddd' } } } }
  });
}

// =========================
/** Profile flow */
// =========================
async function startProfile() {
  if (!await ensureRatingsLoaded()) return;

  injectAnalyticsContainer();

  const noteEl = document.getElementById('lc-note');
  const pageUser = (getUsername() || "").toLowerCase();
  const signedInUser = (await getSignedInUsername() || "").toLowerCase();

  const isOwner = signedInUser && pageUser && signedInUser === pageUser;
  let solved = [];

  try {
    if (isOwner) {
      // Prefer GraphQL owner path; fallback to REST if it yields 0
      solved = await fetchSolvedByOwner();
      if (!solved.length) solved = await fetchSolvedByREST();
      noteEl.textContent = "Owner mode (full solved set).";
    } else {
      // Public fallback: recent ACs + tag backfill
      const recent = await fetchRecentAC(pageUser);
      for (let i = 0; i < Math.min(recent.length, 100); i++) {
        const d = await fetchQuestionDetail(recent[i].slug);
        if (d) { recent[i].tags = d.tags; recent[i].difficulty = d.difficulty; recent[i].title = d.title || recent[i].title; }
      }
      solved = recent;
      noteEl.textContent = "Public mode (recent ACs only). Sign in on LeetCode for full analytics.";
    }
  } catch {
    noteEl.textContent = "Failed to fetch solved set.";
  }

  // Persist solved set for problem page
  const solvedSet = new Set(solved.map(x => x.slug));
  await storageSet({ [LS.SOLVED]: Array.from(solvedSet) });

  // ---- Ratings join & charts ----
  const ratedSolved = solved
    .map(s => ({ ...s, rating: problemRatingsMap.get((s.slug || "").toLowerCase())?.rating }))
    .filter(s => Number.isFinite(s.rating));

  const ratingArr = ratedSolved.map(s => s.rating);

  // If still empty, show a friendly hint instead of a blank chart
  if (!ratingArr.length) {
    const c = document.getElementById('lc-rating-chart');
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#a7a7a7';
    ctx.font = '12px system-ui, -apple-system, Segoe UI';
    ctx.fillText('No ratings matched yet. Open a few problem pages or refresh your profile.', 8, 20);
  } else {
    const ctxR = document.getElementById('lc-rating-chart').getContext('2d');
    drawRatingChart(ctxR, ratingArr);
  }

  // Fill missing tags using global tag map (one-time cached)
  solved = await hydrateSolvedTags(solved);

  // Tags chart (works even in public mode)
  const tagCounts = {};
  for (const p of solved) for (const t of (p.tags || [])) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const ctxT = document.getElementById('lc-tags-chart').getContext('2d');
  drawTagsChart(ctxT, tagCounts);

  // Focus tags + recommendations
  const { [LS.FOCUS]: storedFocus } = await storageGet([LS.FOCUS]);
  const autoFocus = (function pickFocusTagsLocal() {
    const count = {};
    for (const p of solved) for (const t of (p.tags || [])) count[t] = (count[t] || 0) + 1;
    const total = Math.max(solved.length, 1);
    return Object.entries(count)
      .map(([tag, c]) => ({ tag, c, ratio: c/total }))
      .filter(x => x.c >= 3)
      .sort((a,b) => a.ratio - b.ratio)
      .slice(0, 3).map(x => x.tag);
  })();

  const allTags = Array.from(new Set(solved.flatMap(x => x.tags || []))).sort();
  const selected = new Set(Array.isArray(storedFocus) && storedFocus.length ? storedFocus : autoFocus);
  if (!storedFocus) await storageSet({ [LS.FOCUS]: Array.from(selected) });
  
  async function toggleChip(tag) {
    if (selected.has(tag)) selected.delete(tag); else selected.add(tag);
    await storageSet({ [LS.FOCUS]: Array.from(selected) });
    renderChips(allTags, selected, toggleChip);           // keep the handler wired
    const recs = await recommendProblems({
      solvedSet,
      selectedTags: Array.from(selected),
      targetRating: median(ratingArr),
      cap: 12
    });
    renderRecs(recs);
  }
  renderChips(allTags, selected, toggleChip);

  const recs = await recommendProblems({
    solvedSet, selectedTags: Array.from(selected),
    targetRating: median(ratingArr), cap: 12
  });
  renderRecs(recs);
}

// =========================
/** Problem page flow */
// =========================
async function startProblem() {
  if (!await ensureRatingsLoaded()) return;

  injectProblemCard();

  const p = pageParts(); const idx = p.indexOf('problems');
  const slug = (p[idx + 1] || '').toLowerCase();
  if (!slug) return;

  const ratingEntry = problemRatingsMap.get(slug);
  const detail = await fetchQuestionDetail(slug);

  const { [LS.SOLVED]: stored } = await storageGet([LS.SOLVED]);
  const solvedSet = new Set(Array.isArray(stored) ? stored : []);

  const ratingEl = document.getElementById('lc-problem-rating');
  if (ratingEntry) {
    ratingEl.innerHTML = `Rating: <strong style="color:#f5a623">${ratingEntry.rating}</strong>
      ${detail?.difficulty ? `&nbsp;•&nbsp;${detail.difficulty}` : ''}`;
  } else {
    ratingEl.textContent = "No community rating found.";
  }

  const sim = await similarProblems({
    baseSlug: slug,
    baseRating: ratingEntry?.rating || null,
    baseTags: detail?.tags || [],
    solvedSet,
    cap: 10
  });
  const simEl = document.getElementById('lc-problem-similar');
  if (!sim.length) {
    simEl.textContent = "No close matches found for this tag/rating window.";
  } else {
    simEl.innerHTML = sim.map(r => `
      <div style="display:flex;align-items:center;gap:8px;margin:6px 0;">
        <a href="https://leetcode.com/problems/${r.slug}/" target="_blank">${r.title}</a>
        <span class="lc-badge">${r.rating}</span>
      </div>
    `).join('');
  }
}

// =========================
/** Router + SPA handling */
// =========================
function runRouter() {
  // Avoid double-injection
  if (isProfilePage()) return startProfile();
  if (isProblemPage()) return startProblem();
}

let lastUrl = location.href;
const mo = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // small delay for new DOM mount
    setTimeout(runRouter, 300);
  }
});
mo.observe(document, { childList: true, subtree: true });

// initial poke
(async () => {
  // poll a bit during first load (SSR/SPA)
  for (let i = 0; i < 10; i++) {
    runRouter();
    await sleep(400);
  }
})();
