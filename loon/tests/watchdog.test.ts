import { describe, expect, it } from "bun:test";
import { rotateSessionHosts, resolveTargetHost, VideoSession } from "../src/bilibili-speed-watchdog";

describe("Bilibili Speed Watchdog (听诊器)", () => {
  it("should rotate failed host to the end of candidate list and promote #2 to #1", () => {
    const session: VideoSession = {
      hosts: [
        "cn-hk-eq-01-01.bilivideo.com",
        "upos-sz-mirrorcosov.bilivideo.com",
        "upos-sz-mirroraliov.bilivideo.com",
      ],
      updatedAt: 1000,
    };

    // Simulate #1 host returning HTTP 403 / timeout
    const rotated = rotateSessionHosts(session, "cn-hk-eq-01-01.bilivideo.com");
    expect(rotated).toBe(true);

    // Former #2 should now be #1
    expect(session.hosts[0]).toBe("upos-sz-mirrorcosov.bilivideo.com");
    // Former #1 should now be at the tail
    expect(session.hosts[2]).toBe("cn-hk-eq-01-01.bilivideo.com");
  });

  it("should never produce an empty host pool even under repeated failures", () => {
    const session: VideoSession = {
      hosts: ["node-a.bilivideo.com", "node-b.bilivideo.com"],
      updatedAt: 1000,
    };

    rotateSessionHosts(session, "node-a.bilivideo.com");
    expect(session.hosts[0]).toBe("node-b.bilivideo.com");

    rotateSessionHosts(session, "node-b.bilivideo.com");
    expect(session.hosts[0]).toBe("node-a.bilivideo.com");

    expect(session.hosts.length).toBe(2);
  });

  it("should rewrite requests targeting demoted hosts to the current primary host", () => {
    const session: VideoSession = {
      hosts: ["upos-sz-mirrorcosov.bilivideo.com", "cn-hk-eq-01-01.bilivideo.com"],
      updatedAt: 1000,
    };

    // Client requests demoted host
    const target = resolveTargetHost(session, "cn-hk-eq-01-01.bilivideo.com");
    expect(target).toBe("upos-sz-mirrorcosov.bilivideo.com");

    // Client already requests primary host -> no rewrite
    const noRewrite = resolveTargetHost(session, "upos-sz-mirrorcosov.bilivideo.com");
    expect(noRewrite).toBeNull();
  });
});
