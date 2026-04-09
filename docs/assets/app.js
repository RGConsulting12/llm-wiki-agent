const OWNER = "RGConsulting12";
const REPO = "agent-skills";
const BRANCH = "main";

const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;

const SKILL_PHASE_MAP = {
  "idea-refine": "Define",
  "spec-driven-development": "Define",
  "planning-and-task-breakdown": "Plan",
  "incremental-implementation": "Build",
  "test-driven-development": "Build",
  "context-engineering": "Build",
  "source-driven-development": "Build",
  "frontend-ui-engineering": "Build",
  "api-and-interface-design": "Build",
  "browser-testing-with-devtools": "Verify",
  "debugging-and-error-recovery": "Verify",
  "code-review-and-quality": "Review",
  "code-simplification": "Review",
  "security-and-hardening": "Review",
  "performance-optimization": "Review",
  "git-workflow-and-versioning": "Ship",
  "ci-cd-and-automation": "Ship",
  "deprecation-and-migration": "Ship",
  "documentation-and-adrs": "Ship",
  "shipping-and-launch": "Ship",
  "using-agent-skills": "Meta",
};

const CACHE_KEY = "agent-skills-explorer-cache-v1";
const CACHE_TTL_MS = 1000 * 60 * 30;

const state = {
  data: null,
  filters: {
    search: "",
    phase: "all",
    sort: "phase_name",
  },
  selectedSkill: null,
};

const els = {
  overviewCards: document.getElementById("overview-cards"),
  lastUpdated: document.getElementById("last-updated"),
  searchInput: document.getElementById("search-input"),
  phaseSelect: document.getElementById("phase-select"),
  sortSelect: document.getElementById("sort-select"),
  skillsCount: document.getElementById("skills-count"),
  skillsList: document.getElementById("skills-list"),
  detail: document.getElementById("skill-detail"),
  refreshButton: document.getElementById("refresh-btn"),
  surfaceGrid: document.getElementById("surface-grid"),
};

function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDate(iso) {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleString();
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatter: {}, body: markdown };
  const lines = match[1].split("\n");
  const frontmatter = {};
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value.replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: markdown.slice(match[0].length) };
}

function parseSections(body) {
  const lines = body.split("\n");
  const sections = [];
  let current = { heading: "Overview", content: [] };
  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (current.content.length) sections.push(current);
      current = { heading: headingMatch[1].trim(), content: [] };
      continue;
    }
    current.content.push(line);
  }
  if (current.content.length) sections.push(current);
  return sections.map((s) => ({
    heading: s.heading,
    text: s.content.join("\n").trim(),
  }));
}

function extractBulletItems(sectionText, limit = 5) {
  if (!sectionText) return [];
  return sectionText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .slice(0, limit);
}

function normalizeSkill(name, markdown) {
  const { frontmatter, body } = parseFrontmatter(markdown);
  const sections = parseSections(body);
  const whenSection = sections.find((s) =>
    s.heading.toLowerCase().includes("when to use"),
  );
  const processSection = sections.find((s) =>
    s.heading.toLowerCase().includes("process"),
  );
  const verificationSection = sections.find((s) =>
    s.heading.toLowerCase().includes("verification"),
  );
  const phase = SKILL_PHASE_MAP[name] || "Unclassified";
  const triggers = extractBulletItems(whenSection?.text || "", 4);
  const sectionCount = sections.length;
  const bodyText = sections.map((s) => `${s.heading}\n${s.text}`).join("\n\n");

  return {
    name,
    title: frontmatter.name || name,
    description: frontmatter.description || "No description provided",
    phase,
    sections,
    sectionCount,
    triggers,
    processPreview: processSection?.text?.slice(0, 350) || "",
    verificationPreview: verificationSection?.text?.slice(0, 260) || "",
    sourceUrl: `https://github.com/${OWNER}/${REPO}/blob/${BRANCH}/skills/${name}/SKILL.md`,
    searchable: `${name} ${frontmatter.description || ""} ${bodyText}`.toLowerCase(),
  };
}

async function fetchJson(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${msg}`);
  }
  return res.json();
}

async function fetchRaw(path) {
  const res = await fetch(`${RAW_BASE}/${path}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch raw file (${path}): ${res.status}`);
  }
  return res.text();
}

function getCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.cachedAt > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function setCache(data) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        cachedAt: Date.now(),
        data,
      }),
    );
  } catch {
    // Ignore storage issues (private mode/quota).
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignore storage issues.
  }
}

async function loadData({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = getCache();
    if (cached) return cached;
  }

  const [repo, skillsDir, agentsDir, refsDir, commandsDir, docsDir] =
    await Promise.all([
      fetchJson(""),
      fetchJson("/contents/skills"),
      fetchJson("/contents/agents"),
      fetchJson("/contents/references"),
      fetchJson("/contents/.claude/commands"),
      fetchJson("/contents/docs"),
    ]);

  const skillDirs = skillsDir.filter((item) => item.type === "dir");
  const skillMarkdowns = await Promise.all(
    skillDirs.map((item) => fetchRaw(`skills/${item.name}/SKILL.md`)),
  );
  const skills = skillDirs.map((item, i) => normalizeSkill(item.name, skillMarkdowns[i]));

  const data = {
    fetchedAt: new Date().toISOString(),
    repo: {
      name: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      updatedAt: repo.updated_at,
      defaultBranch: repo.default_branch,
      url: repo.html_url,
    },
    skills,
    phases: [...new Set(skills.map((s) => s.phase))].sort(),
    agents: agentsDir.filter((x) => x.name.endsWith(".md")).map((x) => x.name),
    references: refsDir.filter((x) => x.name.endsWith(".md")).map((x) => x.name),
    commands: commandsDir.filter((x) => x.name.endsWith(".md")).map((x) => x.name),
    docs: docsDir.filter((x) => x.name.endsWith(".md")).map((x) => x.name),
  };
  setCache(data);
  return data;
}

function renderOverview(data) {
  const phaseCount = data.phases.length;
  const avgSections =
    data.skills.reduce((sum, skill) => sum + skill.sectionCount, 0) / data.skills.length;
  const cards = [
    { label: "Total skills", value: String(data.skills.length) },
    { label: "Lifecycle phases", value: String(phaseCount) },
    { label: "Agents", value: String(data.agents.length) },
    { label: "Commands", value: String(data.commands.length) },
    { label: "References", value: String(data.references.length) },
    { label: "Average sections / skill", value: avgSections.toFixed(1) },
  ];

  els.overviewCards.innerHTML = cards
    .map(
      (c) => `
      <article class="card">
        <p class="label">${escapeHtml(c.label)}</p>
        <p class="value">${escapeHtml(c.value)}</p>
      </article>
    `,
    )
    .join("");

  els.lastUpdated.textContent = `Repo updated ${formatDate(
    data.repo.updatedAt,
  )} • Explorer fetched ${formatDate(data.fetchedAt)}`;
}

function renderPhaseOptions(phases) {
  const options = [`<option value="all">All phases</option>`]
    .concat(
      phases.map((phase) => `<option value="${phase.toLowerCase()}">${escapeHtml(phase)}</option>`),
    )
    .join("");
  els.phaseSelect.innerHTML = options;
}

function getFilteredSkills() {
  const q = state.filters.search.toLowerCase().trim();
  const phase = state.filters.phase;
  let items = state.data.skills.filter((skill) => {
    const phaseOk = phase === "all" || skill.phase.toLowerCase() === phase;
    const textOk = !q || skill.searchable.includes(q);
    return phaseOk && textOk;
  });

  if (state.filters.sort === "name") {
    items = items.sort((a, b) => a.name.localeCompare(b.name));
  } else if (state.filters.sort === "section_count") {
    items = items.sort((a, b) => b.sectionCount - a.sectionCount || a.name.localeCompare(b.name));
  } else {
    items = items.sort(
      (a, b) => a.phase.localeCompare(b.phase) || a.name.localeCompare(b.name),
    );
  }

  return items;
}

function renderSkillList() {
  const skills = getFilteredSkills();
  els.skillsCount.textContent = `${skills.length} skill${
    skills.length === 1 ? "" : "s"
  } shown`;

  if (!skills.length) {
    els.skillsList.innerHTML = `<p class="muted">No skills match current filters.</p>`;
    return;
  }

  els.skillsList.innerHTML = skills
    .map((skill) => {
      const active = state.selectedSkill?.name === skill.name ? "active" : "";
      const triggers = skill.triggers.length
        ? `Triggers: ${escapeHtml(skill.triggers.join(" | "))}`
        : "Triggers: not explicitly listed";
      return `
        <article class="skill-card ${active}" data-skill="${escapeHtml(skill.name)}">
          <div class="skill-title-row">
            <h3>${escapeHtml(skill.name)}</h3>
            <span class="tag">${escapeHtml(skill.phase)}</span>
          </div>
          <p class="muted">${escapeHtml(skill.description)}</p>
          <div class="skill-meta">
            <span>${escapeHtml(triggers)}</span>
            <span>Sections: ${skill.sectionCount}</span>
          </div>
        </article>
      `;
    })
    .join("");

  els.skillsList.querySelectorAll(".skill-card").forEach((card) => {
    card.addEventListener("click", () => {
      const name = card.getAttribute("data-skill");
      const skill = state.data.skills.find((item) => item.name === name);
      if (!skill) return;
      state.selectedSkill = skill;
      renderSkillList();
      renderSkillDetail(skill);
    });
  });
}

function renderSkillDetail(skill) {
  if (!skill) {
    els.detail.className = "skill-detail empty-state";
    els.detail.textContent = "Select a skill to see details.";
    return;
  }

  const metaCards = [
    { k: "Phase", v: skill.phase },
    { k: "Sections", v: String(skill.sectionCount) },
    { k: "Triggers", v: skill.triggers.length ? skill.triggers.length : "0" },
  ];

  const sectionsHtml = skill.sections
    .map(
      (section) => `
      <section class="detail-section">
        <h4>${escapeHtml(section.heading)}</h4>
        <pre>${escapeHtml(section.text || "(empty)")}</pre>
      </section>
    `,
    )
    .join("");

  els.detail.className = "skill-detail";
  els.detail.innerHTML = `
    <header class="detail-header">
      <h3>${escapeHtml(skill.name)}</h3>
      <p class="muted">${escapeHtml(skill.description)}</p>
      <p>
        <a href="${skill.sourceUrl}" target="_blank" rel="noreferrer">Open SKILL.md on GitHub</a>
      </p>
    </header>
    <div class="detail-grid">
      ${metaCards
        .map(
          (m) => `
          <article class="card">
            <p class="label">${escapeHtml(m.k)}</p>
            <p class="value">${escapeHtml(m.v)}</p>
          </article>
        `,
        )
        .join("")}
    </div>
    ${sectionsHtml}
  `;
}

function renderSurfaceMap(data) {
  const blocks = [
    {
      title: "Agents",
      items: data.agents,
      base: `https://github.com/${OWNER}/${REPO}/tree/${BRANCH}/agents`,
    },
    {
      title: "Slash Commands",
      items: data.commands,
      base: `https://github.com/${OWNER}/${REPO}/tree/${BRANCH}/.claude/commands`,
    },
    {
      title: "Reference Checklists",
      items: data.references,
      base: `https://github.com/${OWNER}/${REPO}/tree/${BRANCH}/references`,
    },
    {
      title: "Documentation",
      items: data.docs,
      base: `https://github.com/${OWNER}/${REPO}/tree/${BRANCH}/docs`,
    },
  ];

  els.surfaceGrid.innerHTML = blocks
    .map(
      (block) => `
      <section class="card surface-block">
        <h3>${escapeHtml(block.title)}</h3>
        <ul class="surface-list">
          ${block.items
            .map(
              (item) =>
                `<li><a href="${block.base}/${encodeURIComponent(item)}" target="_blank" rel="noreferrer">${escapeHtml(item)}</a></li>`,
            )
            .join("")}
        </ul>
      </section>
    `,
    )
    .join("");
}

function wireEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    renderSkillList();
  });

  els.phaseSelect.addEventListener("change", (event) => {
    state.filters.phase = event.target.value;
    renderSkillList();
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.filters.sort = event.target.value;
    renderSkillList();
  });

  els.refreshButton.addEventListener("click", async () => {
    els.refreshButton.disabled = true;
    els.refreshButton.textContent = "Refreshing...";
    clearCache();
    try {
      await initialize({ forceRefresh: true });
    } finally {
      els.refreshButton.disabled = false;
      els.refreshButton.textContent = "Refresh Data";
    }
  });
}

function renderError(error) {
  els.lastUpdated.innerHTML = `<span class="error">Failed to load data: ${escapeHtml(
    error.message || String(error),
  )}</span>`;
  els.overviewCards.innerHTML = "";
  els.skillsList.innerHTML = `<p class="error">Could not load skills from GitHub API.</p>`;
  els.surfaceGrid.innerHTML = "";
}

async function initialize({ forceRefresh = false } = {}) {
  try {
    state.data = await loadData({ forceRefresh });
    renderOverview(state.data);
    renderPhaseOptions(state.data.phases);
    renderSkillList();
    renderSkillDetail(state.selectedSkill);
    renderSurfaceMap(state.data);
  } catch (error) {
    renderError(error);
  }
}

wireEvents();
initialize();
