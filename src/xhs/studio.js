import { getContentObject, updateContentObject, CONTENT_STATES } from "./contentObject.js";
import { getXhsPolicy } from "./policy.js";

/**
 * Studio Content Factory generates full publication bundles:
 * title, body, hashtags, cover, images, source, content_angle, experiment_id
 */
export function generateContentPackage(contentId, options = {}) {
  const obj = getContentObject(contentId, options);
  if (!obj) throw new Error(`Content object not found: ${contentId}`);

  updateContentObject(contentId, { status: CONTENT_STATES.GENERATING }, options);

  const policy = getXhsPolicy(obj.account, options);
  const account = obj.account;
  const topic = obj.topic;

  let title = topic;
  let body = "";
  let hashtags = [];
  let cover = `data/content/covers/${contentId}_cover.png`;
  let images = [`data/content/images/${contentId}_01.png`, `data/content/images/${contentId}_02.png`];
  let content_angle = "";

  if (account === "x_curation") {
    // Gold chance track: X trend translation + feasibility critique
    title = topic.length > 20 ? topic.slice(0, 18) + ".." : topic;
    body = `今天在X上看到这篇高赞讨论，整理翻译并做了可行性事实核查：\n\n1. ✅ 基本靠谱：减少多任务切换，确实有认知心理学实验支持。\n2. ⚠️ 因果夸大：早起4点能暴富纯属包装，睡眠不足反而损伤前额叶皮层。\n3. ❌ 营销噱头：所谓效率药丸没有任何双盲实验数据，别交智商税。\n\n作者置顶排序建议：先做好第1条，比买任何工具都管用。`;
    hashtags = ["#搞钱思维", "#认知提升", "#事实核查", "#效率习惯", "#理性生活"];
    content_angle = "海外信息差与硬核求真纠偏";
  } else if (account === "shuzhai") {
    // good try track: Shuzhai book card standard
    title = topic.length > 20 ? topic.slice(0, 18) + ".." : topic;
    body = `今天深度拆解这本经典里的核心命题：${topic}\n\n很多人以为努力就能解决一切问题，其实往往陷入了低水平重复的效率陷阱。\n\n关键三个认知破局点：\n1. 区分“忙碌感”与“产出率”。\n2. 识别系统性摩擦力，不要用战术勤奋掩盖战略懒惰。\n3. 建立止损阈值，做不到就别硬撑。\n\n行动建议：停下手中的低价值操作，重新审视你的杠杆支点。`;
    hashtags = ["#深度阅读", "#个人成长", "#思维模型", "#读书笔记", "#自我提升"];
    content_angle = "经典社科深度拆解与行动指南";
  } else {
    // personal_ip track: Candid founder notes
    title = topic.length > 20 ? topic.slice(0, 18) + ".." : topic;
    body = `记录真实的创业实践：${topic}\n\n这几天我把真实业务交给AI自主跑了一圈，发现最大的难点不是写代码，而是“机器质检”和“真实数据闭环”。\n\n真实的3点体会：\n- 能自动化的千万别人工插手，人肉API是最大的瓶颈。\n- 不要有AI味，多讲大白话和事实。\n- 每一分钱的投入都要看转化，不产生商业价值的代码都是负债。`;
    hashtags = ["#一人创业", "#创始人思考", "#AI工作流", "#商业复盘", "#数字游民"];
    content_angle = "真实创业实践与闭环反思";
  }

  const generatedPackage = {
    title,
    body,
    hashtags,
    cover,
    images,
    video: null,
    source: obj.source,
    content_angle,
    experiment_id: obj.experiment_id || null,
    generatedAt: new Date().toISOString()
  };

  return updateContentObject(
    contentId,
    {
      status: CONTENT_STATES.QC,
      package: generatedPackage,
      historyNote: "Content package generated, moved to QC"
    },
    options
  );
}
