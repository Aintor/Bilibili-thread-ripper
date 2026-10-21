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

    const bin = PlayViewUniteReply.toBinary(dummy);
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
    const protoBytes = PlayViewUniteReply.toBinary(dummy);
    const compressed = gzip(protoBytes);

    // First byte of gzip is 0x1f (decimal 31) -> (3 << 3) | 7 = field 3, wire type 7!
    expect(compressed[0]).toBe(0x1f);

    // Uncompress and decode
    const uncompressed = ungzip(compressed);
    const reply = PlayViewUniteReply.fromBinary(uncompressed);
    expect(reply.vodInfo?.quality).toBe(112);
  });
});
