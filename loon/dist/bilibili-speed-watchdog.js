// src/bilibili-speed-watchdog.ts
function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}
function rotateSessionHosts(session, failedHost) {
  if (!session || !Array.isArray(session.hosts) || session.hosts.length <= 1) {
    return false;
  }
  const normalizedFailed = failedHost.toLowerCase().trim();
  const currentPrimary = session.hosts[0].toLowerCase().trim();
  if (currentPrimary === normalizedFailed) {
    const demoted = session.hosts.shift();
    session.hosts.push(demoted);
    session.updatedAt = Date.now();
    return true;
  }
  return false;
}
function resolveTargetHost(session, currentHost) {
  if (!session || !Array.isArray(session.hosts) || session.hosts.length === 0) {
    return null;
  }
  const primary = session.hosts[0].toLowerCase().trim();
  const current = currentHost.toLowerCase().trim();
  if (current && primary && current !== primary) {
    return session.hosts[0];
  }
  return null;
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
function handleWatchdogLogic() {
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
  if (typeof $response !== "undefined") {
    const status = Number($response.status) || 0;
    if (status >= 400) {
      const sessions2 = getStoredSessions();
      const session2 = sessions2[cleanPath];
      if (session2 && rotateSessionHosts(session2, currentHost)) {
        saveStoredSessions(sessions2);
        console.log(`[哔哩速度·听诊器] 节点 ${currentHost} 响应异常 (HTTP ${status})，已移至队尾，下一顺位: ${session2.hosts[0]}`);
      }
    }
    if (typeof $done === "function")
      $done({});
    return;
  }
  const sessions = getStoredSessions();
  const session = sessions[cleanPath];
  if (session) {
    const targetHost = resolveTargetHost(session, currentHost);
    if (targetHost) {
      try {
        const newUrl = new URL($request.url);
        newUrl.hostname = targetHost;
        newUrl.port = "";
        console.log(`[哔哩速度·听诊器] 分片自动顺位重写: ${currentHost} -> ${targetHost}`);
        if (typeof $done === "function")
          $done({ url: newUrl.href });
        return;
      } catch {}
    }
  }
  if (typeof $done === "function")
    $done({});
}
if (typeof $done === "function") {
  handleWatchdogLogic();
}
export {
  rotateSessionHosts,
  resolveTargetHost,
  hostOf,
  handleWatchdogLogic
};
