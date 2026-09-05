import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultCatalogPath = path.resolve(__dirname, "../../assets/studio/art_library.json");
const defaultHistoryPath = path.resolve(__dirname, "../../data/content/art_usage_history.json");

export function loadArtCatalog(catalogPath = defaultCatalogPath) {
  if (!fs.existsSync(catalogPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  } catch (err) {
    console.error("Failed to load art catalog:", err);
    return [];
  }
}

export function loadUsageHistory(historyPath = defaultHistoryPath) {
  if (!fs.existsSync(historyPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(historyPath, "utf8"));
  } catch {
    return [];
  }
}

export function recordArtworkUsage(artworkId, noteId = "", historyPath = defaultHistoryPath) {
  const dir = path.dirname(historyPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const history = loadUsageHistory(historyPath);
  history.push({
    artworkId,
    noteId,
    usedAt: new Date().toISOString()
  });

  // Keep last 100 entries
  const trimmed = history.slice(-100);
  fs.writeFileSync(historyPath, JSON.stringify(trimmed, null, 2), "utf8");
}

export function getRecentlyUsedArtworkIds(limit = 4, historyPath = defaultHistoryPath) {
  const history = loadUsageHistory(historyPath);
  const recent = history.slice(-limit).map((h) => h.artworkId);
  return Array.from(new Set(recent));
}

/**
 * Intelligent theme-based artwork selector with anti-fatigue cooldown.
 */
export function selectArtwork({
  theme = "",
  intent = "",
  cooldownCount = 4,
  catalogPath = defaultCatalogPath,
  historyPath = defaultHistoryPath
} = {}) {
  const catalog = loadArtCatalog(catalogPath);
  if (catalog.length === 0) return null;

  const queryText = `${theme} ${intent}`.toLowerCase().trim();
  const recentIds = getRecentlyUsedArtworkIds(cooldownCount, historyPath);

  // 1. Filter candidates by theme / keyword match
  let candidates = catalog;
  if (queryText) {
    const scored = catalog.map((item) => {
      let score = 0;
      const searchable = [
        item.title,
        item.artist,
        item.movement,
        item.mood,
        ...(item.themes || [])
      ].join(" ").toLowerCase();

      for (const token of queryText.split(/\s+/)) {
        if (!token) continue;
        if (searchable.includes(token)) score += 1;
      }
      return { item, score };
    }).filter((s) => s.score > 0);

    if (scored.length > 0) {
      scored.sort((a, b) => b.score - a.score);
      candidates = scored.map((s) => s.item);
    }
  }

  // 2. Anti-fatigue rotation: exclude recently used artworks
  const freshCandidates = candidates.filter((c) => !recentIds.includes(c.id));
  const pool = freshCandidates.length > 0 ? freshCandidates : candidates;

  // Pick random from top matching candidates to keep variety
  const topSlice = pool.slice(0, Math.min(3, pool.length));
  const chosen = topSlice[Math.floor(Math.random() * topSlice.length)] || catalog[0];

  return chosen;
}
