import { BaseXhsProvider } from "./baseProvider.js";
import {
  upsertNote,
  appendNoteSnapshot,
  updateAccountStatus,
  upsertPublicCreator,
  upsertPublicNote,
  appendPublicNoteSnapshot
} from "../storage/repository.js";

export class MockXhsProvider extends BaseXhsProvider {
  constructor(options = {}) {
    super("MockProvider", options);
  }

  async collectAccount(accountKey, onProgress = () => {}) {
    this.status = "RUNNING";
    onProgress({ step: "start", message: `[Mock] 启动模拟创作者后台: ${accountKey}` });

    // Simulate 3 notes with progression
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - 3);

    const notes = [
      {
        noteId: `${accountKey}_note_viral_1`,
        title: "《思考，快与慢》残酷真相：越会讲道理，越会找借口",
        publishTime: baseDate.toISOString(),
        noteType: "normal",
        url: `https://www.xiaohongshu.com/explore/${accountKey}_note_viral_1`,
        history: [
          { dayOffset: 0, impressions: 1200, views: 500, likes: 100, favorites: 40, comments: 12, shares: 5, completionRate: 0.45 },
          { dayOffset: 1, impressions: 5800, views: 2400, likes: 500, favorites: 260, comments: 48, shares: 32, completionRate: 0.58 },
          { dayOffset: 2, impressions: 32000, views: 15400, likes: 3000, favorites: 1800, comments: 310, shares: 240, completionRate: 0.72 }
        ]
      },
      {
        noteId: `${accountKey}_note_steady_2`,
        title: "生活里没有那么多观众：阿德勒课题分离指南",
        publishTime: new Date(baseDate.getTime() + 86400000).toISOString(),
        noteType: "normal",
        url: `https://www.xiaohongshu.com/explore/${accountKey}_note_steady_2`,
        history: [
          { dayOffset: 1, impressions: 1500, views: 600, likes: 120, favorites: 90, comments: 15, shares: 8, completionRate: 0.62 },
          { dayOffset: 2, impressions: 2800, views: 1100, likes: 230, favorites: 180, comments: 28, shares: 14, completionRate: 0.60 }
        ]
      },
      {
        noteId: `${accountKey}_note_nulls_3`,
        title: "新笔记测试：部分后台数据仍在归因延迟中",
        publishTime: new Date().toISOString(),
        noteType: "normal",
        url: `https://www.xiaohongshu.com/explore/${accountKey}_note_nulls_3`,
        history: [
          // Crucial test case: impressions & completionRate are NULL (not 0)
          { dayOffset: 2, impressions: null, views: 80, likes: 15, favorites: 8, comments: 2, shares: null, completionRate: null }
        ]
      }
    ];

    onProgress({ step: "fetching_notes", message: `[Mock] 正在写入 ${notes.length} 篇笔记与时序快照` });

    for (const n of notes) {
      upsertNote({
        accountKey,
        noteId: n.noteId,
        title: n.title,
        publishTime: n.publishTime,
        noteType: n.noteType,
        url: n.url
      });

      for (const h of n.history) {
        const snapDate = new Date(baseDate.getTime() + h.dayOffset * 86400000);
        appendNoteSnapshot({
          accountKey,
          noteId: n.noteId,
          snapshotAt: snapDate.toISOString(),
          dataDate: snapDate.toISOString().split("T")[0],
          impressions: h.impressions,
          views: h.views,
          likes: h.likes,
          favorites: h.favorites,
          comments: h.comments,
          shares: h.shares,
          followersGained: Math.floor((h.likes || 0) * 0.08),
          twoSecondExitRate: 0.25,
          completionRate: h.completionRate,
          averageWatchTime: 18.5,
          source: "mock_creator"
        });
      }
    }

    updateAccountStatus(accountKey, "logged_in", null, true);
    this.status = "IDLE";
    this.lastRunAt = new Date().toISOString();
    onProgress({ step: "completed", message: `[Mock] 账号 ${accountKey} 采集完成` });

    return { ok: true, accountKey, notesCount: notes.length };
  }

  async collectPublic(keywords = ["AI", "认知"], creators = [], onProgress = () => {}) {
    this.status = "RUNNING";
    onProgress({ step: "start_public", message: `[Mock] 开始公共雷达检索` });

    // Mock benchmark creator
    const creatorId = "creator_benchmark_99";
    upsertPublicCreator({
      creatorId,
      nickname: "认知底层思维",
      profileUrl: "https://www.xiaohongshu.com/user/profile/creator_benchmark_99",
      followers: 128000,
      notesCount: 240,
      tracked: 1
    });

    const publicNotes = [
      {
        noteId: "pub_viral_kahneman",
        creatorId,
        title: "千万别把运气当实力：卡尼曼给所有野心家的清醒剂",
        text: "为什么越聪明的人越容易在投资和决策里栽大跟头？认知偏误不是智商低，而是系统一的偷懒机制...",
        publishTime: new Date(Date.now() - 86400000 * 2).toISOString(),
        url: "https://www.xiaohongshu.com/explore/pub_viral_kahneman",
        tags: "认知,心理学,书籍,思考快与慢",
        noteType: "normal",
        discoveredFrom: "keyword:认知",
        snapshots: [
          { hoursAgo: 36, likes: 800, favorites: 650, comments: 90, shares: 120 },
          { hoursAgo: 12, likes: 4500, favorites: 3800, comments: 420, shares: 680 }
        ]
      },
      {
        noteId: "pub_agent_trend",
        creatorId,
        title: "未来已来：超级个体如何利用 Multi-Agent 搭建一人公司",
        text: "不是生产更多内容，而是让自动化飞轮自我运转。拆解 7 个角色如何相互博弈质检...",
        publishTime: new Date(Date.now() - 86400000).toISOString(),
        url: "https://www.xiaohongshu.com/explore/pub_agent_trend",
        tags: "AI,Agent,超级个体,创业",
        noteType: "normal",
        discoveredFrom: "keyword:AI",
        snapshots: [
          { hoursAgo: 20, likes: 200, favorites: 180, comments: 30, shares: 25 },
          { hoursAgo: 2, likes: 1200, favorites: 1100, comments: 140, shares: 190 }
        ]
      }
    ];

    for (const pn of publicNotes) {
      upsertPublicNote({
        noteId: pn.noteId,
        creatorId: pn.creatorId,
        title: pn.title,
        text: pn.text,
        publishTime: pn.publishTime,
        url: pn.url,
        tags: pn.tags,
        noteType: pn.noteType,
        discoveredFrom: pn.discoveredFrom
      });

      for (const s of pn.snapshots) {
        const snapTime = new Date(Date.now() - s.hoursAgo * 3600000).toISOString();
        appendPublicNoteSnapshot({
          noteId: pn.noteId,
          snapshotAt: snapTime,
          likes: s.likes,
          favorites: s.favorites,
          comments: s.comments,
          shares: s.shares,
          creatorFollowers: 128000,
          source: "mock_public"
        });
      }
    }

    this.status = "IDLE";
    this.lastRunAt = new Date().toISOString();
    onProgress({ step: "completed_public", message: `[Mock] 公共雷达采集完成` });

    return { ok: true, notesCount: publicNotes.length };
  }
}
