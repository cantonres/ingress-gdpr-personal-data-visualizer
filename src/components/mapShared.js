// Shared map constants for MapWorkspace and HeatmapWorkspace.
import { intelMapStyle } from "../data/intelMapStyle.js";
import { lightMapStyle } from "../data/lightMapStyle.js";

export const STYLES = { intel: intelMapStyle, light: lightMapStyle };

// Portal layer colors follow the in-game faction convention chosen by the
// user: UPV = purple, UPC = big red.
export const UPV_COLOR = "#9B7BE8";
export const UPC_COLOR = "#EA3B2E";

export const EVENT_COLORS = {
  deploy: "#378ADD",
  upgrade: "#45C6D8",
  mod: "#D4537E",
  attack: "#E24B4A",
  capture: "#EA3B2E",
  hack: "#97C459",
  link: "#7F77DD",
  portal_edit: "#6E9BD1",
  recharge: "#C58AE8",
  item: "#B4B2A9",
  login: "#888780",
  location: "#F09595",
  other: "#888780",
};

export const EVENT_LABELS = {
  deploy: "插脚",
  upgrade: "抬脚",
  mod: "mod",
  attack: "攻击",
  capture: "占领",
  hack: "hack",
  link: "link",
  portal_edit: "Portal 提交/编辑",
  recharge: "充能",
  item: "物品",
  login: "登录",
  location: "定位",
  other: "其他",
};

// Hover explanation for each event chip (shown as native tooltip).
export const EVENT_DESC = {
  deploy: "插脚：在 portal 上部署 resonator（部署新脚）",
  upgrade: "抬脚：升级 portal 上已部署的 resonator（换更高等级的脚）",
  mod: "mod：俗称「安装」，在 Po（portal）上装 Mod（盾、散热、多插头等）",
  attack: "炸：XMP（俗称炸弹）开火 / 炸掉敌方脚（resonator）。注意：坐标记录的是玩家自身位置，不落在 Po 上，所以点会与 portal 错开",
  hack: "hack：俗称「摸」，入侵 Po 获取道具（敌军/友军/中立均计）",
  capture: "占领：占领 portal（插上第一颗 resonator 即占领），全量未抽稀。UPC 图层即由此类事件聚合而来，两者完全一致（2015-09-29 之前的占领不在 game_log 中，故不含在 UPC 里）",
  link: "link：俗称「拉线 / 射 link」。坐标是出发点（当前所在 Po）",
  portal_edit: "Portal 提交/编辑：通过 scanner 提交的新 portal 申请或对现有 portal 的编辑（live/一次通过审核的记录），坐标为候选/目标 portal 位置",
  recharge: "充能：俗称「充电」，为脚（resonator）补充能量",
  item: "物品：捡起 / 丢弃 / 回收物品",
  login: "登录",
  location: "定位：设备位置上报",
  other: "其他：兑换 passcode（含 XM/AP 加成）、Hypercube（俗称超立方）、Comm 发言、aegis shield（俗称神盾）、drone 移动、kinetic capsule（动能胶囊）、mission 完成、ultra link amp 等杂项动作（坐标为玩家位置）",
  scout: "Scout Controlled：因提交 portal 新照片/信息而获得的标记（全数据仅 2 个）",
  opr: "OPR 建议位置：在 OPR 审核中为候选 portal 提交的位置修正坐标（来自 OprSubmissionLog 的 Suggested Location 列）",
};

export function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
