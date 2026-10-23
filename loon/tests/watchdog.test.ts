import { describe, expect, it } from "bun:test";

interface VideoSession {
  hosts: string[];
  updatedAt: number;
}

function processWatchdogRotation(session: VideoSession, requestedHost: string): { action: "promoted" | "rewritten" | "pass"; target?: string } {
  if (!session || !Array.isArray(session.hosts) || session.hosts.length === 0) {
    return { action: "pass" };
  }

  const current = requestedHost.toLowerCase().trim();
  const primaryHost = session.hosts[0].toLowerCase().trim();

  // 情况 A: 客户端正在请求 backup 列表中的节点（说明原首选节点失败或被播放器放弃）
  const backupIndex = session.hosts.findIndex((h, idx) => idx > 0 && h.toLowerCase() === current);
  if (backupIndex > 0) {
    const failedPrimary = session.hosts.shift()!;
    session.hosts.push(failedPrimary);
    const newPrimaryIndex = session.hosts.findIndex((h) => h.toLowerCase() === current);
    if (newPrimaryIndex > 0) {
      const [promoted] = session.hosts.splice(newPrimaryIndex, 1);
      session.hosts.unshift(promoted);
    }
    session.updatedAt = Date.now();
    return { action: "promoted", target: session.hosts[0] };
  }

  // 情况 B: 客户端还在请求已经被降权的节点
  if (current && primaryHost && current !== primaryHost) {
    return { action: "rewritten", target: session.hosts[0] };
  }

  return { action: "pass" };
}

describe("Bilibili Speed Watchdog (听诊器) Auto-Rotation", () => {
  it("should detect when player falls back to backup node, demote failed primary, and lock in new primary", () => {
    const session: VideoSession = {
      hosts: [
        "cn-hk-eq-01-01.bilivideo.com",
        "upos-sz-mirrorcosov.bilivideo.com",
        "upos-sz-mirroraliov.bilivideo.com",
      ],
      updatedAt: 1000,
    };

    // Client requests backup node (cosov) because primary (hk-eq) failed
    const result = processWatchdogRotation(session, "upos-sz-mirrorcosov.bilivideo.com");
    expect(result.action).toBe("promoted");
    expect(result.target).toBe("upos-sz-mirrorcosov.bilivideo.com");

    // cosov should now be #1
    expect(session.hosts[0]).toBe("upos-sz-mirrorcosov.bilivideo.com");
    // hk-eq should now be at the tail
    expect(session.hosts[2]).toBe("cn-hk-eq-01-01.bilivideo.com");
  });

  it("should rewrite requests targeting old demoted nodes to the active primary", () => {
    const session: VideoSession = {
      hosts: ["upos-sz-mirrorcosov.bilivideo.com", "cn-hk-eq-01-01.bilivideo.com"],
      updatedAt: 1000,
    };

    // If client requests an unlisted/old host not in backups, rewrite to primary
    const result = processWatchdogRotation(session, "upos-sz-mirrorali.bilivideo.com");
    expect(result.action).toBe("rewritten");
    expect(result.target).toBe("upos-sz-mirrorcosov.bilivideo.com");

    // When client requests current primary, pass through with 0 delay
    const pass = processWatchdogRotation(session, "upos-sz-mirrorcosov.bilivideo.com");
    expect(pass.action).toBe("pass");
  });
});
