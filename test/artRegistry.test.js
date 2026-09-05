import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import {
  loadArtCatalog,
  selectArtwork,
  recordArtworkUsage,
  getRecentlyUsedArtworkIds
} from "../src/content/artRegistry.js";

function isolate() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "art-registry-test-"));
  const historyPath = path.join(tmpDir, "art_usage_history.json");
  return { tmpDir, historyPath };
}

test("Art Registry: 1. Master catalog loads and contains required schema fields", () => {
  const catalog = loadArtCatalog();
  assert.ok(catalog.length >= 15, "Catalog should have at least 15 artworks");

  for (const item of catalog) {
    assert.ok(item.id, "Missing id");
    assert.ok(item.filename, "Missing filename");
    assert.ok(item.title, "Missing title");
    assert.ok(item.artist, "Missing artist");
    assert.ok(item.label, "Missing label plaque");
    assert.ok(Array.isArray(item.themes), "Missing themes array");
    assert.ok(item.palette && typeof item.palette === "object", "Missing palette");
    assert.ok(Array.isArray(item.defaultRegion) && item.defaultRegion.length === 4, "Missing defaultRegion");
  }
});

test("Art Registry: 2. Newly expanded artworks physically exist in assets/studio/img/", () => {
  const imgDir = path.resolve(process.cwd(), "assets/studio/img");
  const newPaintings = [
    "degas_absinthe.jpg",
    "friedrich_abbey.jpg",
    "hammershoi_interior.jpg",
    "turner_steamer.jpg",
    "vermeer_geographer.jpg",
    "rembrandt_philosopher.jpg",
    "monet_parasol.jpg"
  ];

  for (const fname of newPaintings) {
    const fullPath = path.join(imgDir, fname);
    assert.ok(fs.existsSync(fullPath), `Expected artwork image to exist: ${fullPath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 50000, `Artwork image ${fname} is unusually small: ${stat.size} bytes`);
  }
});

test("Art Registry: 3. selectArtwork matches thematic keywords", () => {
  const art1 = selectArtwork({ theme: "疏离 虚无" });
  assert.ok(art1);
  assert.ok(["degas_absinthe", "anxiety"].includes(art1.id));

  const art2 = selectArtwork({ theme: "极简 留白 宁静" });
  assert.ok(art2);
  assert.equal(art2.id, "hammershoi_interior");
});

test("Art Registry: 4. Anti-fatigue cooldown rotates away from recently used artworks", () => {
  const { historyPath } = isolate();

  // Pick artwork for theme
  const first = selectArtwork({ theme: "自省 哲学", historyPath });
  assert.ok(first);

  // Record that this artwork was used
  recordArtworkUsage(first.id, "note-1", historyPath);
  const recent = getRecentlyUsedArtworkIds(4, historyPath);
  assert.ok(recent.includes(first.id));

  // Next selection for same theme must avoid first artwork due to cooldown
  const second = selectArtwork({ theme: "自省 哲学", cooldownCount: 1, historyPath });
  assert.notEqual(second.id, first.id, "Second selection should not repeat the first artwork within cooldown");
});
