/**
 * 哔哩速度 · 听诊器 (Watchdog) 动态分片重写与异常轮换调度器
 * 
 * 1. http-request: 拦截媒体分片请求，匹配当前视频/音频的有效顺位队列，
 *    若发现客户端仍在请求已被降权的旧节点，原地改写 URL 路由至当前第一顺位。
 * 
 * 2. http-response (requires-body=false): 监控分片响应头与状态码，
 *    若节点返回 4xx/5xx 报错或握手异常，立即将该节点从顺位队列移至队尾（轮换），
 *    自动晋升第二顺位为新第一顺位，并天然保证节点池不为空（循环保底）。
 */

declare const $request: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
};

declare const $response: {
  status: number;
  headers?: Record<string, string>;
} | undefined;

declare const $done: (data: any) => void;

declare const $persistentStore: {
  read: (key: string) => string | null;
  write: (value: string, key: string) => boolean;
};

export interface VideoSession {
  hosts: string[];
  updatedAt: number;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function rotateSessionHosts(session: VideoSession, failedHost: string): boolean {
  if (!session || !Array.isArray(session.hosts) || session.hosts.length <= 1) {
    return false;
  }
  const normalizedFailed = failedHost.toLowerCase().trim();
  const currentPrimary = session.hosts[0].toLowerCase().trim();

  // 仅当报错节点确实是当前首选节点时才执行移至队尾
  if (currentPrimary === normalizedFailed) {
    const demoted = session.hosts.shift()!;
    session.hosts.push(demoted);
    session.updatedAt = Date.now();
    return true;
  }
  return false;
}

export function resolveTargetHost(session: VideoSession, currentHost: string): string | null {
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

function getStoredSessions(): Record<string, VideoSession> {
  try {
    if (typeof $persistentStore === "undefined") return {};
    const raw = $persistentStore.read("bilibili_speed_sessions");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredSessions(sessions: Record<string, VideoSession>) {
  try {
    if (typeof $persistentStore !== "undefined") {
      $persistentStore.write(JSON.stringify(sessions), "bilibili_speed_sessions");
    }
  } catch {}
}

export function handleWatchdogLogic() {
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

  // 1. 响应阶段 (http-response, requires-body=false)
  if (typeof $response !== "undefined") {
    const status = Number($response.status) || 0;
    // 遇到 4xx (如 403 Forbidden, 404, 412, 429) 或 5xx 服务端错误，执行顺位轮换
    if (status >= 400) {
      const sessions = getStoredSessions();
      const session = sessions[cleanPath];
      if (session && rotateSessionHosts(session, currentHost)) {
        saveStoredSessions(sessions);
        console.log(`[哔哩速度·听诊器] 节点 ${currentHost} 响应异常 (HTTP ${status})，已移至队尾，下一顺位: ${session.hosts[0]}`);
      }
    }
    if (typeof $done === "function") $done({});
    return;
  }

  // 2. 请求阶段 (http-request)
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
        if (typeof $done === "function") $done({ url: newUrl.href });
        return;
      } catch {}
    }
  }

  if (typeof $done === "function") $done({});
}

// 在 Loon 环境下自执行
if (typeof $done === "function") {
  handleWatchdogLogic();
}
