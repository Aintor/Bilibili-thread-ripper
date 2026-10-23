import { describe, expect, it } from "bun:test";

interface VideoSession {
  hosts: string[];
  updatedAt: number;
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

function processWatchdogRescue(
  session: VideoSession | undefined,
  requestedHost: string,
  preferredRanking: string[] = []
): { action: "rescued" | "pass"; status?: number; target?: string } {
  const current = requestedHost.toLowerCase().trim();

  // 1. 如果请求的是正常高速 bilivideo 节点，直接放行，绝不干扰播放器并发预加载，彻底杜绝乒乓抖动
  if (!isThrottledOrBadHost(current)) {
    return { action: "pass" };
  }

  // 2. 只有受限节点 (Akamai / PCDN) 才触发 302 救援重定向
  let targetHost = "";
  if (session && Array.isArray(session.hosts)) {
    targetHost = session.hosts.find((h) => !isThrottledOrBadHost(h)) || "";
  }
  if (!targetHost && preferredRanking.length > 0) {
    targetHost = preferredRanking.find((h) => !isThrottledOrBadHost(h)) || "";
  }
  if (!targetHost) {
    targetHost = "upos-sz-mirrorcosov.bilivideo.com";
  }

  return { action: "rescued", status: 302, target: targetHost };
}

describe("Bilibili Speed Watchdog (听诊救援) Logic", () => {
  it("should pass healthy nodes without flapping or altering order during concurrent prefetch", () => {
    const session: VideoSession = {
      hosts: [
        "upos-sz-mirrorcosov.bilivideo.com",
        "upos-sz-mirroraliov.bilivideo.com",
        "cn-hk-eq-01-01.bilivideo.com",
      ],
      updatedAt: 1000,
    };

    // Client prefetches from backup node (aliov) while primary (cosov) is also active
    const aliovRes = processWatchdogRescue(session, "upos-sz-mirroraliov.bilivideo.com");
    expect(aliovRes.action).toBe("pass");

    // Client fetches from primary node (cosov)
    const cosovRes = processWatchdogRescue(session, "upos-sz-mirrorcosov.bilivideo.com");
    expect(cosovRes.action).toBe("pass");

    // Session order remains strictly stable — zero flapping!
    expect(session.hosts[0]).toBe("upos-sz-mirrorcosov.bilivideo.com");
    expect(session.hosts[1]).toBe("upos-sz-mirroraliov.bilivideo.com");
  });

  it("should instantly rescue throttled Akamai requests to the healthy session host", () => {
    const session: VideoSession = {
      hosts: [
        "upos-sz-mirrorcosov.bilivideo.com",
        "upos-sz-mirroraliov.bilivideo.com",
        "upos-hz-mirrorakam.akamaized.net",
      ],
      updatedAt: 1000,
    };

    // Client requests slow Akamai node
    const res = processWatchdogRescue(session, "upos-hz-mirrorakam.akamaized.net");
    expect(res.action).toBe("rescued");
    expect(res.status).toBe(302);
    expect(res.target).toBe("upos-sz-mirrorcosov.bilivideo.com");
  });

  it("should rescue Akamai request using preferred ranking or default fallback when session is missing", () => {
    const res1 = processWatchdogRescue(undefined, "upos-hz-mirrorakam.akamaized.net", ["upos-sz-mirroraliov.bilivideo.com"]);
    expect(res1.action).toBe("rescued");
    expect(res1.status).toBe(302);
    expect(res1.target).toBe("upos-sz-mirroraliov.bilivideo.com");

    const res2 = processWatchdogRescue(undefined, "upos-hz-mirrorakam.akamaized.net", []);
    expect(res2.action).toBe("rescued");
    expect(res2.status).toBe(302);
    expect(res2.target).toBe("upos-sz-mirrorcosov.bilivideo.com");
  });

  it("should rescue PCDN / MCDN requests to a healthy UPOS node", () => {
    const session: VideoSession = {
      hosts: ["upos-sz-mirrorcosov.bilivideo.com"],
      updatedAt: 1000,
    };

    const res = processWatchdogRescue(session, "node-1.mcdn.bilivideo.cn");
    expect(res.action).toBe("rescued");
    expect(res.status).toBe(302);
    expect(res.target).toBe("upos-sz-mirrorcosov.bilivideo.com");
  });
});
