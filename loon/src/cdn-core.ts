/**
 * 哔哩速度核心 CDN 算法 (移植自 src/cdn-resolver.js)
 */

export const MAINLAND_HOSTS: readonly string[] = Object.freeze([
  "upos-sz-mirrorali.bilivideo.com",
  "upos-sz-mirrorhw.bilivideo.com",
  "upos-sz-mirrorcos.bilivideo.com",
  "upos-sz-mirror08c.bilivideo.com",
  "upos-sz-mirrorbos.bilivideo.com",
  "upos-sz-mirrorbd.bilivideo.com",
  "upos-sz-mirror14b.bilivideo.com",
  "upos-sz-estgoss.bilivideo.com",
  "upos-sz-mirrorcoso1.bilivideo.com"
]);

export const OVERSEAS_HOSTS: readonly string[] = Object.freeze([
  "cn-hk-eq-01-01.bilivideo.com",
  "cn-hk-eq-01-03.bilivideo.com",
  "upos-sz-mirroraliov.bilivideo.com",
  "upos-sz-mirrorcosov.bilivideo.com"
]);

export const DEFAULT_PRIORITY_HOSTS: readonly string[] = Object.freeze([
  "upos-sz-mirrorali.bilivideo.com",
  "upos-sz-mirrorhw.bilivideo.com",
  "upos-sz-mirrorcos.bilivideo.com",
  "upos-sz-mirror08c.bilivideo.com",
  "cn-hk-eq-01-01.bilivideo.com",
  "upos-sz-mirrorcosov.bilivideo.com"
]);

export const OVERSEAS_PRIORITY_HOSTS: readonly string[] = Object.freeze([
  "cn-hk-eq-01-01.bilivideo.com",
  "cn-hk-eq-01-03.bilivideo.com",
  "upos-sz-mirroraliov.bilivideo.com",
  "upos-sz-mirrorcosov.bilivideo.com"
]);

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
 * 核心优化调度器：
 * 1. 剔除 PCDN / MCDN 垃圾节点
 * 2. 识别合规 Donor (供体)
 * 3. 跨节点合成高速官方 CDN 备选大军
 * 4. 结合实测测速打分排序，确定最优主节点与原生备用池
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

  // 2. 检测海外流媒体上下文 (自动根据 B 站下发的节点特征判定，或由参数强制指定)
  const isOverseas =
    forcedMode === "overseas" ||
    (forcedMode !== "mainland" && isOverseasContext(fallbackList));

  // 3. 检查是否有合法的 UPOS 供体
  const uposDonor = fallbackList.find(isUposUrl);

  // 如果原本全是 Gotcha 海外专用流且没有任何 UPOS 节点，切勿强行切为大陆 UPOS（会触发 403 惩罚导致起播严重卡顿）
  if (!uposDonor && fallbackList.some(isGotchaUrl)) {
    // 纯 Gotcha 流：清洗 PCDN，保留官方 Gotcha 主备节点，避免跨系统 403 回退
    return {
      baseUrl: fallbackList[0],
      backupUrls: fallbackList.slice(1),
    };
  }

  // 4. 寻找 Donor 签名供体 (优先非 Akamai 的 UPOS 节点)
  const donor = uposDonor || fallbackList.find((url) => !isAkamaiUrl(url)) || fallbackList[0];
  if (!donor) {
    return { baseUrl: primary, backupUrls: backup };
  }

  // 5. 确定候选 Host 清单与优先级 (根据环境自适应海外 vs 国内)
  let priorityList: readonly string[];
  if (preferredOrder && preferredOrder.length > 0) {
    priorityList = preferredOrder;
  } else if (isOverseas) {
    priorityList = OVERSEAS_PRIORITY_HOSTS;
  } else {
    priorityList = DEFAULT_PRIORITY_HOSTS;
  }

  const targetHosts = isOverseas
    ? Array.from(new Set([...priorityList, ...OVERSEAS_HOSTS, ...MAINLAND_HOSTS]))
    : Array.from(new Set([...priorityList, ...MAINLAND_HOSTS, ...OVERSEAS_HOSTS]));

  // 6. 合成备选节点 URL
  const syntheticList: string[] = [];
  for (const host of targetHosts) {
    const syn = swapOrdinaryHost(donor, host, isAkamaiUrl(donor));
    if (syn && !syntheticList.includes(syn)) {
      syntheticList.push(syn);
    }
  }

  // 7. 组合最终节点池 (先排实测优选的合成节点，再附带官方原始有效节点)
  // 海外模式下：将官方下发的高速海外节点 (如 Singapore 本地 Gotcha) 置于国内合成节点之前
  let combined: string[];
  if (isOverseas) {
    const validOverseasOriginals = fallbackList.filter((u) => isOverseasContext([u]));
    // 结构：海外合成节点 (如香港 Equinix) -> 官方海外本地节点 -> 大陆合成节点 -> 其他兜底
    combined = Array.from(new Set([
      ...syntheticList.filter((u) => isOverseasContext([u])),
      ...validOverseasOriginals,
      ...syntheticList,
      ...fallbackList
    ]));
  } else {
    combined = Array.from(new Set([...syntheticList, ...fallbackList]));
  }

  if (combined.length === 0) {
    return { baseUrl: primary, backupUrls: backup };
  }

  const bestUrl = combined[0];
  const backupUrls = combined.slice(1);

  return { baseUrl: bestUrl, backupUrls };
}
