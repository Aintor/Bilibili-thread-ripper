// src/bilibili-speed-watchdog.ts
(function() {
  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  function getStoredSessions() {
    try {
      if (typeof $persistentStore === "undefined")
        return {};
      const raw = $persistentStore.read("bilibili_speed_sessions");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  function saveStoredSessions(sessions) {
    try {
      if (typeof $persistentStore !== "undefined") {
        $persistentStore.write(JSON.stringify(sessions), "bilibili_speed_sessions");
      }
    } catch {}
  }
  function handleWatchdogRequest() {
    if (typeof $request === "undefined" || !$request.url) {
      if (typeof $done === "function")
        $done({});
      return;
    }
    let cleanPath = "";
    try {
      cleanPath = new URL($request.url).pathname;
    } catch {
      if (typeof $done === "function")
        $done({});
      return;
    }
    const currentHost = hostOf($request.url);
    const sessions = getStoredSessions();
    const session = sessions[cleanPath];
    if (session && Array.isArray(session.hosts) && session.hosts.length > 0) {
      const primaryHost = session.hosts[0].toLowerCase();
      const current = currentHost.toLowerCase();
      const backupIndex = session.hosts.findIndex((h, idx) => idx > 0 && h.toLowerCase() === current);
      if (backupIndex > 0) {
        const failedPrimary = session.hosts.shift();
        session.hosts.push(failedPrimary);
        const newPrimaryIndex = session.hosts.findIndex((h) => h.toLowerCase() === current);
        if (newPrimaryIndex > 0) {
          const [promoted] = session.hosts.splice(newPrimaryIndex, 1);
          session.hosts.unshift(promoted);
        }
        session.updatedAt = Date.now();
        saveStoredSessions(sessions);
        console.log(`[哔哩速度·听诊器] 检测到播放器启用备用节点: ${current}，原首选节点 ${failedPrimary} 降权移至队尾，已锁定新第一顺位: ${session.hosts[0]}`);
      } else if (current && primaryHost && current !== primaryHost) {
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
    if (typeof $done === "function")
      $done({});
  }
  handleWatchdogRequest();
})();
