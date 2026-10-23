/**
 * 哔哩速度 · 听诊器 (Watchdog) 动态分片重写与异常降权切换
 * 
 * 拦截媒体分片请求 (http-request)：
 * 1. 匹配当前视频/音频的有效顺位队列；
 * 2. 检测客户端是否因首选节点异常而主动切换到 backup 备用节点；
 *    若是，立即将失效的首选节点移至队尾，并将该备用节点晋升为新顺位第一；
 * 3. 自动将后续分片请求原地重写至当前健康的第一顺位节点，实现平滑切流！
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

  function getStoredSessions(): Record<string, { hosts: string[]; updatedAt: number }> {
    try {
      if (typeof $persistentStore === "undefined") return {};
      const raw = $persistentStore.read("bilibili_speed_sessions");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveStoredSessions(sessions: Record<string, { hosts: string[]; updatedAt: number }>) {
    try {
      if (typeof $persistentStore !== "undefined") {
        $persistentStore.write(JSON.stringify(sessions), "bilibili_speed_sessions");
      }
    } catch {}
  }

  function handleWatchdogRequest() {
    if (typeof $request === "undefined" || !$request.url) {
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

    const currentHost = hostOf($request.url);
    const sessions = getStoredSessions();
    const session = sessions[cleanPath];

    if (session && Array.isArray(session.hosts) && session.hosts.length > 0) {
      const primaryHost = session.hosts[0].toLowerCase();
      const current = currentHost.toLowerCase();

      // 情况 A: 客户端正在请求 backup 列表中的节点（说明原首选节点失败或被播放器放弃）
      const backupIndex = session.hosts.findIndex((h, idx) => idx > 0 && h.toLowerCase() === current);
      if (backupIndex > 0) {
        // 晋升当前正在请求的备用节点为第一顺位，将旧的第一顺位移至队尾
        const failedPrimary = session.hosts.shift()!;
        session.hosts.push(failedPrimary);
        // 将成功响应的备用节点调至最前
        const newPrimaryIndex = session.hosts.findIndex((h) => h.toLowerCase() === current);
        if (newPrimaryIndex > 0) {
          const [promoted] = session.hosts.splice(newPrimaryIndex, 1);
          session.hosts.unshift(promoted);
        }
        session.updatedAt = Date.now();
        saveStoredSessions(sessions);
        console.log(`[哔哩速度·听诊器] 检测到播放器启用备用节点: ${current}，原首选节点 ${failedPrimary} 降权移至队尾，已锁定新第一顺位: ${session.hosts[0]}`);
      }
      // 情况 B: 客户端还在请求已经被降权的节点（即并非当前的第一顺位）
      else if (current && primaryHost && current !== primaryHost) {
        try {
          const newUrl = new URL($request.url);
          newUrl.hostname = session.hosts[0];
          newUrl.port = "";
          console.log(`[哔哩速度·听诊器] 分片自动顺位重写: ${current} -> ${session.hosts[0]}`);
          if (typeof $done === "function") {
            $done({ url: newUrl.href });
            return;
          }
        } catch {}
      }
    }

    if (typeof $done === "function") $done({});
  }

  handleWatchdogRequest();
})();
