// src/bilibili-speed-watchdog.ts
(function() {
  function hostOf(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }
  function isThrottledOrBadHost(host) {
    const h = host.toLowerCase();
    return h.endsWith(".akamaized.net") || h.includes("akam") || h.endsWith(".mcdn.bilivideo.cn") || h.includes("mcdn");
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
  function getPreferredHosts() {
    try {
      if (typeof $persistentStore === "undefined")
        return [];
      const raw = $persistentStore.read("bilibili_speed_cdn_ranking");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  function handleWatchdogRequest() {
    if (typeof $request === "undefined" || !$request.url) {
      if (typeof $done === "function")
        $done({});
      return;
    }
    const currentHost = hostOf($request.url);
    if (!isThrottledOrBadHost(currentHost)) {
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
    const sessions = getStoredSessions();
    const session = sessions[cleanPath];
    let targetHost = "";
    if (session && Array.isArray(session.hosts)) {
      targetHost = session.hosts.find((h) => !isThrottledOrBadHost(h)) || "";
    }
    if (!targetHost) {
      const preferred = getPreferredHosts();
      targetHost = preferred.find((h) => !isThrottledOrBadHost(h)) || "";
    }
    if (!targetHost) {
      targetHost = "upos-sz-mirrorcosov.bilivideo.com";
    }
    try {
      const newUrl = new URL($request.url);
      newUrl.hostname = targetHost;
      newUrl.port = "";
      console.log(`[哔哩速度·听诊救援] 拦截到受限节点分片请求: ${currentHost}，已极速无感救援重写至: ${targetHost}`);
      if (typeof $done === "function") {
        $done({ url: newUrl.href });
        return;
      }
    } catch {}
    if (typeof $done === "function")
      $done({});
  }
  handleWatchdogRequest();
})();
