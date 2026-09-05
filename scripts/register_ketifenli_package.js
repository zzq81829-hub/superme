import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createPackage, freezePackage, getPackage } from "../src/content/store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const pkgDir = "小红书/小红书图文_课题分离_20260903";
const copyPath = path.join(root, pkgDir, "发布文案.md");
const copyContent = fs.readFileSync(copyPath, "utf8");

const pkgId = "shuzhai-xhs-ketifenli-20260903";

const existing = getPackage(pkgId);
if (existing) {
  console.log(`Package ${pkgId} already exists, skipping create.`);
} else {
  const pkg = createPackage({
    id: pkgId,
    project: "shuzhai",
    platform: "xiaohongshu",
    title: "《被讨厌的勇气》：别人怎么看你，真的跟你没关系",
    body: copyContent,
    layout: {
      templateId: "shuzhai-editorial-v1",
      callToAction: "收藏这篇清单，下次内耗前拿出来看一遍"
    },
    media: [
      { kind: "image", path: `${pkgDir}/01_封面.png` },
      { kind: "image", path: `${pkgDir}/02_行为清单.png` },
      { kind: "image", path: `${pkgDir}/03_机制解释.png` },
      { kind: "image", path: `${pkgDir}/04_经典书证.png` },
      { kind: "image", path: `${pkgDir}/05_双面剖析.png` },
      { kind: "image", path: `${pkgDir}/06_结尾.png` },
      { kind: "document", path: `${pkgDir}/发布文案.md` },
      { kind: "document", path: `${pkgDir}/README_审批说明.md` },
      { kind: "document", path: `${pkgDir}/qa-report.json` },
      { kind: "document", path: `${pkgDir}/render_cards.py` }
    ],
    links: [],
    layers: {
      facts: [
        {
          id: "fact-ketifenli-01",
          text: "围绕阿德勒个体心理学经典《被讨厌的勇气》（岸见一郎、古贺史健）中的课题分离原则做六页解构。",
          source: "《被讨厌的勇气》第3夜"
        }
      ],
      expressions: [
        {
          id: "expr-ketifenli-01",
          text: "别人怎么看你，真的跟你没关系。"
        },
        {
          id: "expr-ketifenli-02",
          text: "关于自己的课题，怎么做是你的课题；别人怎么评价，是别人的课题。"
        },
        {
          id: "expr-ketifenli-03",
          text: "边界不是冷酷的墙，是筛子：留下该你负责的，放走不该你扛的。"
        },
        {
          id: "expr-ketifenli-04",
          text: "真正的自由，不是被所有人喜欢，而是别人的课题，终于不再是你的包袱。"
        }
      ],
      viewpoints: []
    }
  });

  console.log(`Created draft package: ${pkg.id}, hash: ${pkg.payloadHash}`);

  const frozen = freezePackage(pkgId);
  console.log(`Frozen package: ${frozen.id}, status: ${frozen.status}, approvalStatus: ${frozen.approvalStatus}, hash: ${frozen.payloadHash}`);
}
