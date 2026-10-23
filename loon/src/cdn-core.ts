/**
 * 哔哩速度核心 CDN 算法 (移植自 src/cdn-resolver.js)
 */

export const MAINLAND_HOSTS: readonly string[] = Object.freeze([
  "upos-sz-mirrorali.bilivideo.com",
  "upos-sz-mirrorhw.bilivideo.com",
  "upos-sz-mirrorbos.bilivideo.com",
  "upos-sz-mirror08c.bilivideo.com",
  "upos-sz-mirrorbd.bilivideo.com",
  "upos-sz-mirror14b.bilivideo.com",
  "upos-sz-estgoss.bilivideo.com",
  "upos-sz-mirrorcos.bilivideo.com",
  "upos-sz-mirrorcoso1.bilivideo.com"
]);

export const OVERSEAS_HOSTS: readonly string[] = Object.freeze([
  "upos-sz-mirrorcosov.bilivideo.com",
  "upos-sz-mirroraliov.bilivideo.com",
  "cn-hk-eq-01-01.bilivideo.com",
  "cn-hk-eq-01-03.bilivideo.com"
]);

export const GLOBAL_HOSTS: readonly string[] = Object.freeze([
  ...OVERSEAS_HOSTS,
  ...MAINLAND_HOSTS
]);

export function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * 判断是否为海外流媒体特征 (由 B 站官方调度器分发的海外节点特征)
 */
export function isOverseasContext(urls: string[]): boolean {
  return urls.some((raw) => {
    try {
      const host = new URL(raw).hostname.toLowerCase();
      return (
        host.endsWith(".akamaized.net") ||
        host.includes("gotcha") ||
        host.includes("mirroraliov") ||
        host.includes("mirrorcosov") ||
        host.includes("mirrorakam") ||
        host.includes("cn-hk-eq") ||
        host.includes("-ov-") ||
        host.includes("_ov_") ||
        host.includes(".ov.")
      );
    } catch {
      return false;
    }
  });
}

/**
 * 判断是否为海外 Akamai CDN
 */
export function isAkamaiUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase().endsWith(".akamaized.net");
  } catch {
    return false;
  }
}

/**
 * 判断是否为 UPOS / 官方自建分发架构
 */
export function isUposUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes("upos-") || host.includes("cn-hk-eq");
  } catch {
    return false;
  }
}

/**
 * 判断是否为海外专用 Gotcha 节点 (Zenlayer 等)
 */
export function isGotchaUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes("ov-gotcha") || host.includes("gotcha");
  } catch {
    return false;
  }
}

/**
 * 判断是否为 PCDN / MCDN / Relay 中继节点 (特征清洗)
 */
export function isRelayUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const port = url.port;
    return (
      host.endsWith(".mcdn.bilivideo.cn") ||
      url.pathname.startsWith("/v1/resource/") ||
      url.searchParams.get("os")?.toLowerCase() === "mcdn" ||
      port === "4480" ||
      port === "4483" ||
      port === "9102"
    );
  } catch {
    return false;
  }
}

/**
 * 跨节点签名移植 (Donor Synthesis)
 */
export function swapOrdinaryHost(rawUrl: string, targetHost: string, allowAkamai = false): string | null {
  if (!allowAkamai && isAkamaiUrl(rawUrl)) return null;
  const host = targetHost.toLowerCase().trim();
  try {
    const url = new URL(rawUrl);
    url.hostname = host;
    url.port = "";
    return url.href;
  } catch {
    return null;
  }
}

export interface OptimizedStream {
  baseUrl: string;
  backupUrls: string[];
}

/**
 * 核心优化调度器 (对齐原作者算法三档设计：不限 / 大陆 / 海外 + 纯测速排序)：
 * 1. 深度清洗 PCDN / MCDN
 * 2. 识别合规 UPOS/官方 Donor (供体)
 * 3. 针对「不限 / 大陆 / 海外」划分目标节点池
 * 4. 严格按照原版顺序组合 [...allowedOriginals, ...synthetic, ...relays]
 * 5. 结合实测探针延迟对节点进行精准打分重排
 */
export function optimizeStreamUrls(
  primary: string,
  backup: string[] = [],
  preferredOrder: string[] = [],
  forcedMode: "auto" | "overseas" | "mainland" = "auto"
): OptimizedStream {
  const allOriginals = [primary, ...backup].filter(Boolean);
  
  // 1. 深度清洗：移除所有 PCDN / MCDN 污染地址
  const cleanOriginals = allOriginals.filter((url) => !isRelayUrl(url));
  const fallbackList = cleanOriginals.length > 0 ? cleanOriginals : allOriginals;

  // 2. 检查是否有合法的 UPOS 供体
  const uposDonor = fallbackList.find(isUposUrl);

  // 如果原本全是 Gotcha 海外专用流且没有任何 UPOS 节点，切勿强行切为大陆 UPOS（会触发 403 惩罚导致起播严重卡顿）
  if (!uposDonor && fallbackList.some(isGotchaUrl)) {
    // 纯 Gotcha 流：清洗 PCDN，保留官方 Gotcha 主备节点，避免跨系统 403 回退
    return {
      baseUrl: fallbackList[0],
      backupUrls: fallbackList.slice(1),
    };
  }

  // 3. 寻找 Donor 签名供体 (优先非 Akamai 的 UPOS 节点)
  const donor = uposDonor || fallbackList.find((url) => !isAkamaiUrl(url)) || fallbackList[0];
  if (!donor) {
    return { baseUrl: primary, backupUrls: backup };
  }

  // 4. 三档模式划分与目标节点池 (严格对齐原版)
  let targetPool: readonly string[];
  let allowedOriginals: string[];

  if (forcedMode === "mainland") {
    // 大陆模式：仅使用大陆 9 大 CDN 节点，仅保留大陆原始节点
    targetPool = MAINLAND_HOSTS;
    allowedOriginals = cleanOriginals.filter((url) => MAINLAND_HOSTS.includes(hostOf(url)));
  } else if (forcedMode === "overseas") {
    // 海外模式：仅使用海外 4 大专线节点，排除大陆节点
    targetPool = OVERSEAS_HOSTS;
    allowedOriginals = cleanOriginals.filter((url) => !MAINLAND_HOSTS.includes(hostOf(url)));
  } else {
    // 不限模式 (auto)：候选池为全域 (海外 + 大陆)，纯凭测速打分排序
    // 若尚未测速，根据当前流是否包含海外特征决定海外节点还是大陆节点优先
    const isOverseas = isOverseasContext(fallbackList);
    targetPool = isOverseas
      ? GLOBAL_HOSTS
      : [...MAINLAND_HOSTS, ...OVERSEAS_HOSTS];
    allowedOriginals = cleanOriginals;
  }

  // 5. 若有测速探针数据，在对应模式池内按测速排序
  let sortedTargetHosts: string[];
  if (preferredOrder && preferredOrder.length > 0) {
    const pref = preferredOrder.map((h) => h.toLowerCase().trim());
    sortedTargetHosts = Array.from(targetPool).sort((a, b) => {
      const idxA = pref.indexOf(a.toLowerCase());
      const idxB = pref.indexOf(b.toLowerCase());
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });
  } else {
    sortedTargetHosts = Array.from(targetPool);
  }

  // 6. 合成备选节点 URL
  const syntheticList: string[] = [];
  for (const host of sortedTargetHosts) {
    const syn = swapOrdinaryHost(donor, host, isAkamaiUrl(donor));
    if (syn && !syntheticList.includes(syn)) {
      syntheticList.push(syn);
    }
  }

  // 7. 组合最终节点池 (普通原生节点优先，高速合成次之，彻底剔除 Akamai 与 PCDN 污染)
  // 注意：海外 Akamai (*.akamaized.net) 节点在亚太地区严重限速丢包，彻底排除，杜绝客户端备用链路拉取导致缓冲卡死
  const regularOriginals = allowedOriginals.filter((u) => !isAkamaiUrl(u));
  const relays = cleanOriginals.length > 0 ? [] : allOriginals;
  const combined = Array.from(new Set([
    ...regularOriginals,
    ...syntheticList,
    ...relays
  ]));

  // 8. 测速优先重排：若已有测速榜单，将实测最快的节点推向最前 (保持同节点下 allowedOriginals 优先)
  let rankedUrls: string[];
  if (preferredOrder && preferredOrder.length > 0) {
    const pref = preferredOrder.map((h) => h.toLowerCase().trim());
    rankedUrls = combined.slice().sort((urlA, urlB) => {
      const hostA = hostOf(urlA);
      const hostB = hostOf(urlB);
      const rankA = pref.indexOf(hostA);
      const rankB = pref.indexOf(hostB);
      if (rankA !== -1 && rankB !== -1) return rankA - rankB;
      if (rankA !== -1) return -1;
      if (rankB !== -1) return 1;
      return 0;
    });
  } else {
    rankedUrls = combined;
  }

  if (rankedUrls.length === 0) {
    return { baseUrl: primary, backupUrls: backup };
  }

  return {
    baseUrl: rankedUrls[0],
    backupUrls: rankedUrls.slice(1),
  };
}
