/**
 * Xiaohongshu Data Intelligence Analysis Engine
 * Deterministic metrics, Velocity (time-series growth), and ViralScore.
 */

// Centralized configuration for weights - fully tunable, zero magic numbers
export const VIRAL_SCORE_CONFIG = {
  // Metric weights
  weightFavoriteRate: 0.35,  // 收藏率权重 (小红书核心长尾与干货度指标)
  weightEngagementRate: 0.25,// 综合互动率权重
  weightVelocity: 0.25,      // 每小时点赞/互动爆发增速
  weightFreshness: 0.15,     // 时效性加成 (越新发布的增速越珍贵)

  // Benchmarks for normalization
  benchmarkEngagementRate: 0.08, // 8% 良好互动率
  benchmarkFavoriteRate: 0.05,   // 5% 良好收藏率
  benchmarkLikesPerHour: 50,     // 50赞/小时视为起量

  // Freshness decay
  freshnessHalfLifeHours: 48     // 48小时半衰期
};

/**
 * Compute deterministic performance metrics for a single snapshot
 */
export function computeSnapshotMetrics(snapshot) {
  if (!snapshot) return null;

  const { impressions, views, likes, favorites, comments, shares, followers_gained } = snapshot;

  const res = {
    impressionToViewRate: null,
    likeRate: null,
    favoriteRate: null,
    commentRate: null,
    engagementRate: null,
    followConversion: null
  };

  // Click / CTR
  if (impressions && views && impressions > 0) {
    res.impressionToViewRate = Math.round((views / impressions) * 10000) / 10000;
  }

  // Base on views first, fallback to impressions if views not present
  const baseCount = views || impressions;
  if (baseCount && baseCount > 0) {
    if (likes !== null && likes !== undefined) {
      res.likeRate = Math.round((likes / baseCount) * 10000) / 10000;
    }
    if (favorites !== null && favorites !== undefined) {
      res.favoriteRate = Math.round((favorites / baseCount) * 10000) / 10000;
    }
    if (comments !== null && comments !== undefined) {
      res.commentRate = Math.round((comments / baseCount) * 10000) / 10000;
    }
    if (followers_gained !== null && followers_gained !== undefined) {
      res.followConversion = Math.round((followers_gained / baseCount) * 10000) / 10000;
    }

    const totalInteractions = (likes || 0) + (favorites || 0) + (comments || 0) + (shares || 0);
    if (totalInteractions > 0) {
      res.engagementRate = Math.round((totalInteractions / baseCount) * 10000) / 10000;
    }
  }

  return res;
}

/**
 * Compute growth velocity between two chronological snapshots (first -> second)
 */
export function computeVelocity(snapPrev, snapCurr) {
  if (!snapPrev || !snapCurr) return null;

  const tPrev = new Date(snapPrev.snapshot_at).getTime();
  const tCurr = new Date(snapCurr.snapshot_at).getTime();
  const deltaHours = Math.max(0.01, (tCurr - tPrev) / (1000 * 60 * 60));

  const likesDelta = snapCurr.likes !== null && snapPrev.likes !== null
    ? snapCurr.likes - snapPrev.likes
    : null;

  const viewsDelta = snapCurr.views !== null && snapPrev.views !== null
    ? snapCurr.views - snapPrev.views
    : null;

  const favoritesDelta = snapCurr.favorites !== null && snapPrev.favorites !== null
    ? snapCurr.favorites - snapPrev.favorites
    : null;

  const commentsDelta = snapCurr.comments !== null && snapPrev.comments !== null
    ? snapCurr.comments - snapPrev.comments
    : null;

  return {
    deltaHours: Math.round(deltaHours * 10) / 10,
    likesDelta,
    viewsDelta,
    favoritesDelta,
    commentsDelta,
    likesPerHour: likesDelta !== null ? Math.round((likesDelta / deltaHours) * 10) / 10 : null,
    viewsPerHour: viewsDelta !== null ? Math.round((viewsDelta / deltaHours) * 10) / 10 : null,
    favoritesPerHour: favoritesDelta !== null ? Math.round((favoritesDelta / deltaHours) * 10) / 10 : null,
    isAccelerating: likesDelta !== null && likesDelta > 0
  };
}

/**
 * Compute multi-dimensional ViralScore (0 to 100)
 */
export function computeViralScore({ latestSnapshot, velocity, publishTime, creatorFollowers, config = VIRAL_SCORE_CONFIG }) {
  if (!latestSnapshot) return 0;

  const metrics = computeSnapshotMetrics(latestSnapshot);

  // 1. Favorite component (0 to 100)
  const favRate = metrics?.favoriteRate || 0;
  const favScore = Math.min(100, (favRate / config.benchmarkFavoriteRate) * 100);

  // 2. Engagement component (0 to 100)
  const engRate = metrics?.engagementRate || 0;
  const engScore = Math.min(100, (engRate / config.benchmarkEngagementRate) * 100);

  // 3. Velocity component (0 to 100)
  const likesPerHour = velocity?.likesPerHour || 0;
  const velScore = Math.min(100, (likesPerHour / config.benchmarkLikesPerHour) * 100);

  // 4. Freshness component (decay from 100 based on age)
  let freshnessScore = 50;
  if (publishTime) {
    const ageHours = Math.max(0, (Date.now() - new Date(publishTime).getTime()) / (1000 * 60 * 60));
    freshnessScore = Math.round(100 * Math.exp(-0.693 * (ageHours / config.freshnessHalfLifeHours)));
  }

  // 5. Follower baseline discount: if creator has 500k followers, 1000 likes is normal; if 500 followers, 1000 likes is hyper-viral
  let leverageMultiplier = 1.0;
  if (creatorFollowers && creatorFollowers > 0) {
    if (creatorFollowers < 5000) leverageMultiplier = 1.4;
    else if (creatorFollowers < 20000) leverageMultiplier = 1.2;
    else if (creatorFollowers > 200000) leverageMultiplier = 0.8;
  }

  const rawScore =
    favScore * config.weightFavoriteRate +
    engScore * config.weightEngagementRate +
    velScore * config.weightVelocity +
    freshnessScore * config.weightFreshness;

  const finalScore = Math.min(100, Math.round(rawScore * leverageMultiplier));

  return {
    score: finalScore,
    isViral: finalScore >= 70,
    components: {
      favScore: Math.round(favScore),
      engScore: Math.round(engScore),
      velScore: Math.round(velScore),
      freshnessScore: Math.round(freshnessScore),
      leverageMultiplier
    }
  };
}
