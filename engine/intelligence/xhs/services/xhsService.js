import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  listAccounts,
  getAccount,
  updateAccountStatus,
  listMyNotes,
  getNoteSnapshots,
  getLatestNoteSnapshot,
  listPublicCreators,
  upsertPublicCreator,
  listPublicNotes,
  getPublicNoteSnapshots,
  getLatestPublicSnapshot,
  listKeywords,
  addKeyword,
  removeKeyword,
  toggleKeyword
} from "../storage/repository.js";
import { MockXhsProvider } from "../providers/mockProvider.js";
import { CreatorCenterProvider } from "../providers/creatorCenterProvider.js";
import { PublicResearchProvider } from "../providers/publicResearchProvider.js";
import { computeSnapshotMetrics, computeVelocity, computeViralScore } from "../analysis/metrics.js";
import { generateDailyBrief } from "../analysis/brief.js";
import { CircadianGuard } from "./circadianGuard.js";

class XhsIntelligenceService {
  constructor() {
    this.mockProvider = new MockXhsProvider();
    this.creatorProvider = new CreatorCenterProvider();
    this.publicProvider = new PublicResearchProvider();
    this.activeMode = "real"; // 'real' or 'mock'
    this.currentJob = null;
    this.jobLogs = [];
    this.schedulerEnabled = false;
  }

  openAccountLoginWindow(accountKey) {
    const acc = getAccount(accountKey);
    if (!acc) throw new Error(`账号不存在: ${accountKey}`);

    const profileDir = path.resolve(process.cwd(), acc.profile_dir);
    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    // Hardware/Process level separation:
    // Account 1 (书斋) uses Google Chrome
    // Account 2 (X搬运) uses Microsoft Edge
    // Account 3 (个人IP) uses isolated Chrome profile
    let exe = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    if (accountKey === "xhs_account_2") {
      const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
      if (fs.existsSync(edge)) exe = edge;
    }

    if (!fs.existsSync(exe)) {
      exe = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    }

    // PowerShell Start-Process brings the GUI window to the foreground on Windows
    // --no-proxy-server forces Chrome/Edge to bypass system Global proxy and connect directly via domestic broadband
    const psCmd = `Start-Process -FilePath "${exe}" -ArgumentList @('--user-data-dir="${profileDir}"', '--new-window', '--no-first-run', '--no-default-browser-check', '--no-proxy-server', 'https://creator.xiaohongshu.com/login')`;
    spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", psCmd], { detached: true, stdio: "ignore" }).unref();

    this._log(`已为账号 [${acc.label} (${accountKey})] 打开独立登录窗口 (${path.basename(exe)})`);
    return {
      ok: true,
      accountKey,
      label: acc.label,
      browser: path.basename(exe),
      message: `已为 ${acc.label} 开启独立登录窗口 (${path.basename(exe)})，请在弹出的新窗口扫码`
    };
  }

  resetAccount(accountKey) {
    const acc = getAccount(accountKey);
    if (!acc) throw new Error(`账号不存在: ${accountKey}`);
    const profileDir = path.resolve(process.cwd(), acc.profile_dir);
    try {
      const killCmd = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${accountKey}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`;
      spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", killCmd], { stdio: "ignore" });
      setTimeout(() => {
        try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
        try { fs.mkdirSync(profileDir, { recursive: true }); } catch {}
      }, 500);
    } catch (e) {}

    updateAccountStatus(accountKey, "need_login", "已重置登录态，请重新扫码");
    this._log(`已重置账号 [${acc.label} (${accountKey})] 的登录态缓存`);
    return { ok: true, accountKey, message: `已成功清空 ${acc.label} 的登录缓存` };
  }

  setMode(mode) {
    this.activeMode = mode === "mock" ? "mock" : "real";
  }

  getStatus() {
    const accounts = listAccounts();
    const myNotes = listMyNotes(null, 1);
    const pubNotes = listPublicNotes(1);

    return {
      ok: true,
      mode: this.activeMode,
      schedulerEnabled: this.schedulerEnabled,
      currentJob: this.currentJob,
      creatorStatus: this.activeMode === "mock" ? this.mockProvider.getStatus() : this.creatorProvider.getStatus(),
      publicStatus: this.activeMode === "mock" ? this.mockProvider.getStatus() : this.publicProvider.getStatus(),
      counts: {
        accounts: accounts.length,
        hasNotes: myNotes.length > 0,
        hasPublicNotes: pubNotes.length > 0
      },
      circadian: CircadianGuard.getHumanStatus(),
      recentLogs: this.jobLogs.slice(-10)
    };
  }

  _log(msg) {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    this.jobLogs.push(entry);
    if (this.jobLogs.length > 50) this.jobLogs.shift();
  }

  async collectAccount(accountKey, forceMock = false) {
    const useMock = forceMock || this.activeMode === "mock";
    const provider = useMock ? this.mockProvider : this.creatorProvider;

    this.currentJob = {
      type: "collect_account",
      target: accountKey,
      step: "starting",
      startedAt: new Date().toISOString()
    };
    this._log(`开始采集账号: ${accountKey} (${useMock ? "Mock模式" : "真实浏览器模式"})`);

    try {
      const res = await provider.collectAccount(accountKey, ({ step, message }) => {
        if (this.currentJob) this.currentJob.step = step;
        this._log(message);
      });
      this.currentJob = null;
      return res;
    } catch (err) {
      this.currentJob = null;
      this._log(`采集出错: ${err.message}`);
      throw err;
    }
  }

  async collectAllAccounts(forceMock = false, isManual = false) {
    const guard = CircadianGuard.checkCanCollect(isManual);
    if (!guard.allowed) {
      this._log(`[生理作息守卫] ${guard.reason}`);
      return { ok: false, sleepMode: true, reason: guard.reason, results: [] };
    }

    const accounts = listAccounts().filter((a) => a.enabled);
    const results = [];
    for (const acc of accounts) {
      try {
        const r = await this.collectAccount(acc.account_key, forceMock);
        results.push(r);
      } catch (err) {
        results.push({ ok: false, accountKey: acc.account_key, error: err.message });
      }
    }
    return { ok: true, results };
  }

  async collectPublic(keywords = [], forceMock = false) {
    const useMock = forceMock || this.activeMode === "mock";
    const provider = useMock ? this.mockProvider : this.publicProvider;

    const kwList = keywords.length ? keywords : listKeywords().filter((k) => k.enabled).map((k) => k.keyword);
    const creators = listPublicCreators().filter((c) => c.tracked);

    this.currentJob = {
      type: "collect_public",
      step: "starting",
      startedAt: new Date().toISOString()
    };
    this._log(`开始外部雷达扫描: ${kwList.join(", ")}`);

    try {
      const res = await provider.collectPublic(kwList, creators, ({ step, message }) => {
        if (this.currentJob) this.currentJob.step = step;
        this._log(message);
      });
      this.currentJob = null;
      return res;
    } catch (err) {
      this.currentJob = null;
      this._log(`公共采集出错: ${err.message}`);
      throw err;
    }
  }

  getAccounts() {
    const accs = listAccounts();
    return accs.map((a) => {
      const notes = listMyNotes(a.account_key, 100);
      const recentNotes = notes.slice(0, 3).map((n) => {
        const snaps = getNoteSnapshots(n.note_id, 1);
        const snap = snaps[snaps.length - 1] || null;
        return {
          note_id: n.note_id,
          title: n.title,
          publish_time: n.publish_time,
          views: snap?.views,
          likes: snap?.likes,
          favorites: snap?.favorites
        };
      });
      return {
        ...a,
        notesCount: notes.length,
        recentNotes
      };
    });
  }

  getNotes(accountKey = null) {
    const notes = listMyNotes(accountKey, 50);
    return notes.map((n) => {
      const snaps = getNoteSnapshots(n.note_id, 10);
      const latest = snaps[snaps.length - 1] || null;
      const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
      const metrics = computeSnapshotMetrics(latest);
      const velocity = computeVelocity(prev, latest);
      return {
        ...n,
        latestSnapshot: latest,
        metrics,
        velocity,
        snapshotsCount: snaps.length
      };
    });
  }

  getNoteHistory(noteId) {
    const snaps = getNoteSnapshots(noteId, 50);
    const history = [];
    for (let i = 0; i < snaps.length; i++) {
      const curr = snaps[i];
      const prev = i > 0 ? snaps[i - 1] : null;
      history.push({
        snapshot: curr,
        metrics: computeSnapshotMetrics(curr),
        velocity: prev ? computeVelocity(prev, curr) : null
      });
    }
    return { noteId, snapshots: history };
  }

  getCompetitors() {
    const creators = listPublicCreators();
    return creators;
  }

  addCompetitor({ creatorId, nickname, profileUrl }) {
    upsertPublicCreator({ creatorId, nickname, profileUrl, tracked: 1 });
    return { ok: true, creatorId };
  }

  getTrending() {
    const publicNotes = listPublicNotes(50);
    return publicNotes.map((pn) => {
      const snaps = getPublicNoteSnapshots(pn.note_id, 10);
      const latest = snaps[snaps.length - 1] || null;
      const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
      const velocity = prev && latest ? computeVelocity(prev, latest) : null;
      const viral = computeViralScore({
        latestSnapshot: latest,
        velocity,
        publishTime: pn.publishTime,
        creatorFollowers: latest?.creator_followers
      });
      return {
        ...pn,
        latestSnapshot: latest,
        velocity,
        viralScore: viral.score,
        viralDetails: viral
      };
    }).sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
  }

  getDailyBrief() {
    return generateDailyBrief();
  }

  getKeywords() {
    return listKeywords();
  }

  addKeyword(keyword) {
    return addKeyword(keyword);
  }

  removeKeyword(id) {
    return removeKeyword(id);
  }

  toggleKeyword(id, enabled) {
    return toggleKeyword(id, enabled);
  }
}

export const xhsIntelligenceService = new XhsIntelligenceService();
