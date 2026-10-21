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
  "upos-sz-mirrorcoso1.bilivideo.com"
]);

export const OVERSEAS_HOSTS: readonly string[] = Object.freeze([
  "cn-hk-eq-01-01.bilivideo.com",
  "cn-hk-eq-01-03.bilivideo.com",
  "upos-sz-mirrorcosov.bilivideo.com",
  "upos-sz-mirroraliov.bilivideo.com"
]);

export const DEFAULT_PRIORITY_HOSTS: readonly string[] = Object.freeze([
  "upos-sz-mirrorali.bilivideo.com",
  "upos-sz-mirrorhw.bilivideo.com",
  "upos-sz-mirrorcos.bilivideo.com",
  "upos-sz-mirror08c.bilivideo.com",
  "cn-hk-eq-01-01.bilivideo.com",
  "upos-sz-mirrorcosov.bilivideo.com"
]);

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
  preferredOrder: string[] = []
): OptimizedStream {
  const allOriginals = [primary, ...backup].filter(Boolean);
  
  // 1. 深度清洗：移除所有 PCDN / MCDN 污染地址
  const cleanOriginals = allOriginals.filter((url) => !isRelayUrl(url));
  const fallbackList = cleanOriginals.length > 0 ? cleanOriginals : allOriginals;

  // 2. 寻找 Donor 签名供体 (优先非 Akamai 的普通大陆/官方节点)
  const donor = fallbackList.find((url) => !isAkamaiUrl(url)) || fallbackList[0];
  if (!donor) {
    return { baseUrl: primary, backupUrls: backup };
  }

  // 3. 确定候选 Host 清单与优先级
  const priorityList = (preferredOrder && preferredOrder.length > 0)
    ? preferredOrder
    : DEFAULT_PRIORITY_HOSTS;

  const targetHosts = Array.from(new Set([...priorityList, ...MAINLAND_HOSTS, ...OVERSEAS_HOSTS]));

  // 4. 合成备选节点 URL
  const syntheticList: string[] = [];
  for (const host of targetHosts) {
    const syn = swapOrdinaryHost(donor, host, isAkamaiUrl(donor));
    if (syn && !syntheticList.includes(syn)) {
      syntheticList.push(syn);
    }
  }

  // 5. 组合最终节点池 (先排实测优选的合成节点，再附带官方原始有效节点)
  const combined = Array.from(new Set([...syntheticList, ...fallbackList]));
  if (combined.length === 0) {
    return { baseUrl: primary, backupUrls: backup };
  }

  const bestUrl = combined[0];
  const backupUrls = combined.slice(1);

  return { baseUrl: bestUrl, backupUrls };
}
