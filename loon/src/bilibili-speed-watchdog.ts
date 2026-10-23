/**
 * 哔哩速度 · 听诊救援 (Watchdog Rescue)
 * 
 * 专门针对慢速受限节点 (如 Akamai 或 PCDN) 的无感动态分片救援重写：
 * 1. 过滤健康节点：对于正常的 bilivideo CDN 官方高速节点，绝对不执行多余重写与死循环降权；
 * 2. 救援受限节点：当检测到客户端请求被限速的 Akamai (*.akamaized.net) 或 PCDN 时，
 *    立即将其重写至当前视频会话的最高顺位健康节点 (或测速最优海外 UPOS 节点)；
 * 3. 彻底根除并发预加载导致的节点“乒乓死循环” (Flapping)。
 */

(function () {
  declare const $request: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  };

  declare const $done: (data: any) => void;

  declare const $persistentStore: {
    read: (key: string) => string | null;
    write: (value: string, key: string) => boolean;
  };

  function hostOf(url: string): string {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function isThrottledOrBadHost(host: string): boolean {
    const h = host.toLowerCase();
    return (
      h.endsWith(".akamaized.net") ||
      h.includes("akam") ||
      h.endsWith(".mcdn.bilivideo.cn") ||
      h.includes("mcdn")
    );
  }

  function getStoredSessions(): Record<string, { hosts: string[]; updatedAt: number }> {
    try {
      if (typeof $persistentStore === "undefined") return {};
      const raw = $persistentStore.read("bilibili_speed_sessions");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function getPreferredHosts(): string[] {
    try {
      if (typeof $persistentStore === "undefined") return [];
      const raw = $persistentStore.read("bilibili_speed_cdn_ranking");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function handleWatchdogRequest() {
    if (typeof $request === "undefined" || !$request.url) {
      if (typeof $done === "function") $done({});
      return;
    }

    const currentHost = hostOf($request.url);

    // 只有受限/慢速节点才需要听诊重写救援；正常高速 bilivideo 节点直接硬件级直通，避免任何 JS 延迟
    if (!isThrottledOrBadHost(currentHost)) {
      if (typeof $done === "function") $done({});
      return;
    }

    let cleanPath = "";
    try {
      cleanPath = new URL($request.url).pathname;
    } catch {
      if (typeof $done === "function") $done({});
      return;
    }

    const sessions = getStoredSessions();
    const session = sessions[cleanPath];

    // 确定救援的目标健康节点
    let targetHost = "";
    if (session && Array.isArray(session.hosts)) {
      // 优先从当前会话的健康候选池中找到首个非 Akamai/非 PCDN 的高速节点
      targetHost = session.hosts.find((h) => !isThrottledOrBadHost(h)) || "";
    }

    if (!targetHost) {
      // 若无当前会话，从本地测速排行中选取最优海外/大陆 UPOS 节点
      const preferred = getPreferredHosts();
      targetHost = preferred.find((h) => !isThrottledOrBadHost(h)) || "";
    }

    if (!targetHost) {
      // 默认兜底海外高速腾讯节点
      targetHost = "upos-sz-mirrorcosov.bilivideo.com";
    }

    try {
      const newUrl = new URL($request.url);
      newUrl.hostname = targetHost;
      newUrl.port = "";
      console.log(`[哔哩速度·听诊救援] 拦截到受限节点分片请求: ${currentHost}，已 302 重定向救援至: ${targetHost}`);
      if (typeof $done === "function") {
        $done({
          response: {
            status: 302,
            headers: {
              Location: newUrl.href,
              "Access-Control-Allow-Origin": "*",
            },
          },
        });
        return;
      }
    } catch {}

    if (typeof $done === "function") $done({});
  }

  handleWatchdogRequest();
})();
