import { describe, expect, it } from "bun:test";
import { isRelayUrl, isAkamaiUrl, swapOrdinaryHost, optimizeStreamUrls } from "../src/cdn-core";
import { PlayViewUniteReply, Stream, VodInfo, DashVideo } from "../src/types";

describe("CDN Core Algorithms Ported from 哔哩速度", () => {
  it("should correctly identify PCDN and relay URLs", () => {
    expect(isRelayUrl("https://12345.mcdn.bilivideo.cn:8082/v1/resource/123")).toBe(true);
    expect(isRelayUrl("https://upos-sz-mirrorali.bilivideo.com:4480/upgcxcode/123")).toBe(true);
    expect(isRelayUrl("https://upos-sz-mirrorali.bilivideo.com/upgcxcode/123?os=mcdn")).toBe(true);
    expect(isRelayUrl("https://upos-sz-mirrorali.bilivideo.com/upgcxcode/123")).toBe(false);
  });

  it("should correctly identify Akamai URLs", () => {
    expect(isAkamaiUrl("https://upos-sz-mirrorakam.akamaized.net/upgcxcode/123")).toBe(true);
    expect(isAkamaiUrl("https://upos-sz-mirrorali.bilivideo.com/upgcxcode/123")).toBe(false);
  });

  it("should swap ordinary host safely while stripping custom ports", () => {
    const raw = "https://upos-sz-mirrorali.bilivideo.com:4483/upgcxcode/video.m4s?token=abc";
    const swapped = swapOrdinaryHost(raw, "upos-sz-mirrorcos.bilivideo.com");
    expect(swapped).toBe("https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/video.m4s?token=abc");
  });

  it("should clean PCDN, find donor, synthesize candidate CDN nodes and respect ranking", () => {
    const primaryPcdn = "https://abc.mcdn.bilivideo.cn:8082/v1/resource/video.m4s?os=mcdn";
    const backupOrdinary = "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/video.m4s?deadline=123&token=sec";
    
    // Simulate probe ranking preferring Huawei first
    const preferredOrder = ["upos-sz-mirrorhw.bilivideo.com", "upos-sz-mirrorcos.bilivideo.com"];

    const result = optimizeStreamUrls(primaryPcdn, [backupOrdinary], preferredOrder);

    // Primary should be promoted to the #1 preferred host
    expect(result.baseUrl).toContain("upos-sz-mirrorhw.bilivideo.com");
    // PCDN must be completely removed from candidate backup URLs
    expect(result.backupUrls.some(url => isRelayUrl(url))).toBe(false);
    // Synthetic hosts must contain Tencent
    expect(result.backupUrls.some(url => url.includes("upos-sz-mirrorcos.bilivideo.com"))).toBe(true);
  });

  it("should correctly encode and decode PlayViewUniteReply Protobuf binary", () => {
    const dummy = {
      vodInfo: {
        quality: 80,
        format: "mp4",
        timelength: 60000,
        videoCodecid: 7,
        streamList: [
          {
            streamInfo: {
              quality: 80,
              format: "dash",
              description: "1080P",
              errCode: 0,
              needVip: false,
              needLogin: false,
              intact: true,
              noRexcode: false,
              attribute: 0,
              newDescription: "1080P 高清",
              displayDesc: "1080P",
              superscript: "",
              vipFree: true,
              subtitle: "",
              supportDrm: false,
            },
            content: {
              oneofKind: "dashVideo",
              dashVideo: {
                baseUrl: "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/sample.m4s?token=abc",
                backupUrl: ["https://upos-sz-mirrorcos.bilivideo.com/upgcxcode/sample.m4s?token=abc"],
                bandwidth: 2000000,
                codecid: 7,
                md5: "dummy",
                size: 5000000,
                audioId: 0,
                noRexcode: false,
                frameRate: "30",
                width: 1920,
                height: 1080,
                widevinePssh: "",
              }
            }
          }
        ]
      }
    };

    const bin = PlayViewUniteReply.toBinary(PlayViewUniteReply.create(dummy));
    expect(bin.length).toBeGreaterThan(0);

    const decoded = PlayViewUniteReply.fromBinary(bin);
    expect(decoded.vodInfo?.quality).toBe(80);
    expect(decoded.vodInfo?.streamList?.[0]?.content?.oneofKind).toBe("dashVideo");
  });

  it("should handle GZIP-compressed gRPC frame and prevent wire type 7 error", async () => {
    const { gzip, ungzip } = await import("pako");
    const dummy = {
      vodInfo: {
        quality: 112,
        format: "mp4",
        timelength: 120000,
        videoCodecid: 12,
        streamList: []
      }
    };
    const protoBytes = PlayViewUniteReply.toBinary(PlayViewUniteReply.create(dummy));
    const compressed = gzip(protoBytes);

    // First byte of gzip is 0x1f (decimal 31) -> (3 << 3) | 7 = field 3, wire type 7!
    expect(compressed[0]).toBe(0x1f);

    // Uncompress and decode
    const uncompressed = ungzip(compressed);
    const reply = PlayViewUniteReply.fromBinary(uncompressed);
    expect(reply.vodInfo?.quality).toBe(112);
  });

  it("should correctly identify Gotcha overseas URLs and avoid cross-protocol 403 on pure Gotcha streams", () => {
    const gotcha1 = "https://d1--ov-gotcha07.bilivideo.com/gotcha/video.m4s?token=zen";
    const gotcha2 = "https://d1--ov-gotcha07b.bilivideo.com/gotcha/video.m4s?token=zen";
    const pcdn = "https://test.mcdn.bilivideo.cn:8082/resource/video.m4s";

    const res = optimizeStreamUrls(pcdn, [gotcha1, gotcha2]);
    // Should clean PCDN and keep Gotcha baseUrl directly without forcing mainland UPOS 403
    expect(res.baseUrl).toContain("d1--ov-gotcha07.bilivideo.com");
    expect(res.backupUrls[0]).toContain("d1--ov-gotcha07b.bilivideo.com");
    expect(res.backupUrls.some(u => u.includes("mcdn"))).toBe(false);
  });

  it("should serialize and deserialize audio tracks including dashAudio, dolby, and lossLessItem", () => {
    const dummy = {
      vodInfo: {
        quality: 80,
        format: "mp4",
        timelength: 60000,
        videoCodecid: 7,
        streamList: [],
        dashAudio: [
          {
            id: 30280,
            baseUrl: "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/audio.m4s",
            backupUrl: ["https://upos-sz-mirrorhw.bilivideo.com/upgcxcode/audio.m4s"],
            bandwidth: 192000,
            codecid: 0,
            md5: "audiomd5",
            size: 1500000,
          }
        ],
        dolby: {
          type: 1,
          audio: [
            {
              id: 30250,
              baseUrl: "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/dolby.m4s",
              backupUrl: [],
              bandwidth: 256000,
              codecid: 0,
              md5: "dolbymd5",
              size: 2000000,
            }
          ]
        },
        lossLessItem: {
          isLosslessAudio: true,
          needVip: true,
          audio: {
            id: 30251,
            baseUrl: "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/hires.m4s",
            backupUrl: [],
            bandwidth: 960000,
            codecid: 0,
            md5: "hiresmd5",
            size: 8000000,
          }
        }
      }
    };

    const bin = PlayViewUniteReply.toBinary(dummy);
    const decoded = PlayViewUniteReply.fromBinary(bin);
    expect(decoded.vodInfo?.dashAudio?.[0]?.baseUrl).toContain("audio.m4s");
    expect(decoded.vodInfo?.dolby?.audio?.[0]?.id).toBe(30250);
    expect(decoded.vodInfo?.lossLessItem?.isLosslessAudio).toBe(true);
    expect(decoded.vodInfo?.lossLessItem?.audio?.baseUrl).toContain("hires.m4s");
  });

  it("should serialize and deserialize PlayViewReply (PGC / Legacy PlayURL)", async () => {
    const { PlayViewReply } = await import("../src/types");
    const dummy = {
      vodInfo: {
        quality: 112,
        format: "dash",
        timelength: 140000,
        videoCodecid: 7,
        streamList: [],
        dashAudio: [
          {
            id: 30280,
            baseUrl: "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/pgc_audio.m4s",
            backupUrl: [],
            bandwidth: 192000,
            codecid: 0,
            md5: "pgcmd5",
            size: 2500000,
          }
        ],
      }
    };

    const bin = PlayViewReply.toBinary(PlayViewReply.create(dummy));
    const decoded = PlayViewReply.fromBinary(bin);
    expect(decoded.vodInfo?.quality).toBe(112);
    expect(decoded.vodInfo?.dashAudio?.[0]?.baseUrl).toContain("pgc_audio.m4s");
  });

  it("should automatically detect overseas environment and prioritize overseas nodes over mainland edges", async () => {
    const { optimizeStreamUrls, isOverseasContext } = await import("../src/cdn-core");

    const overseasUrls = [
      "https://cn-hk-eq-01-01.bilivideo.com/upgcxcode/sample.m4s",
      "https://d1--ov-gotcha05.bilivideo.com/gotcha/sample.m4s",
      "https://upos-sz-mirroraliov.bilivideo.com/upgcxcode/sample.m4s",
    ];
    expect(isOverseasContext(overseasUrls)).toBe(true);

    const mainlandUrls = [
      "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/sample.m4s",
      "https://upos-sz-mirrorhw.bilivideo.com/upgcxcode/sample.m4s",
    ];
    expect(isOverseasContext(mainlandUrls)).toBe(false);

    // When original response comes from overseas (like Singapore user seeing Gotcha or HK Equinix)
    const rawPrimary = "https://upos-sz-mirroraliov.bilivideo.com/upgcxcode/sample.m4s?e=123&deadline=456";
    const rawBackup = [
      "https://d1--ov-gotcha05.bilivideo.com/gotcha/sample.m4s?e=123",
      "https://118.228.23.25.mcdn.bilivideo.cn:4480/resource/sample.m4s" // PCDN
    ];

    // When probe ranking is passed, it ranks by probe speed
    const probeRanked = optimizeStreamUrls(rawPrimary, rawBackup, ["cn-hk-eq-01-01.bilivideo.com"], "auto");
    expect(probeRanked.baseUrl).toContain("cn-hk-eq-01-01.bilivideo.com");

    // Without probe, genuine original overseas node is kept safely first
    const defaultOpt = optimizeStreamUrls(rawPrimary, rawBackup, [], "auto");
    expect(defaultOpt.baseUrl).toContain("upos-sz-mirroraliov.bilivideo.com");
    // Singapore local Gotcha node must be preserved in backup list
    expect(defaultOpt.backupUrls.some(u => u.includes("d1--ov-gotcha05"))).toBe(true);
    // PCDN must be stripped
    expect(defaultOpt.backupUrls.some(u => u.includes("mcdn"))).toBe(false);
  });

  it("should respect forced mode ('overseas' vs 'mainland')", async () => {
    const { optimizeStreamUrls } = await import("../src/cdn-core");
    const rawPrimary = "https://upos-sz-mirrorali.bilivideo.com/upgcxcode/sample.m4s";

    // Forced 'overseas' mode puts original author's overseas nodes (cosov) first
    const overseasOpt = optimizeStreamUrls(rawPrimary, [], [], "overseas");
    expect(overseasOpt.baseUrl).toContain("upos-sz-mirrorcosov.bilivideo.com");

    // If probe prefers HK Equinix, probe ranking takes precedence
    const overseasWithProbe = optimizeStreamUrls(rawPrimary, [], ["cn-hk-eq-01-01.bilivideo.com"], "overseas");
    expect(overseasWithProbe.baseUrl).toContain("cn-hk-eq-01-01.bilivideo.com");

    // Forced 'mainland' mode puts mainland nodes first
    const mainlandOpt = optimizeStreamUrls(rawPrimary, [], [], "mainland");
    expect(mainlandOpt.baseUrl).toContain("upos-sz-mirrorali.bilivideo.com");
  });
});
