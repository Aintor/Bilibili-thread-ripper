/**
 * 哔哩速度 · 手机端专属 Loon 播放选路插件 (gRPC 二进制处理器)
 */

import { PlayViewUniteReply, PlayViewReply } from "./types";
import { optimizeStreamUrls, hostOf } from "./cdn-core";
import { gzip, ungzip } from "pako";

declare const $request: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
};

declare const $response: {
  status: number;
  headers: Record<string, string>;
  body?: string | Uint8Array;
  bodyBytes?: Uint8Array;
};

declare const $argument: string | undefined;

declare const $done: (data: any) => void;
declare const $persistentStore: {
  read: (key: string) => string | null;
  write: (value: string, key: string) => boolean;
};
declare const $utils: {
  ungzip?: (data: Uint8Array) => Uint8Array;
  gzip?: (data: Uint8Array) => Uint8Array;
};

function decodeGrpc(bytes: Uint8Array): { payload: Uint8Array; wasCompressed: boolean } {
  if (!bytes || bytes.length < 5) {
    return { payload: bytes, wasCompressed: false };
  }
  const wasCompressed = bytes[0] === 1;
  const rawData = bytes.subarray(5);
  let payload = rawData;

  if (wasCompressed) {
    try {
      if (typeof $utils !== "undefined" && typeof $utils.ungzip === "function") {
        payload = $utils.ungzip(rawData);
      } else {
        payload = ungzip(rawData);
      }
    } catch (e) {
      console.log(`[哔哩速度] ungzip 失败，尝试原始数据: ${e}`);
    }
  }

  return { payload, wasCompressed };
}

function encodeGrpc(payload: Uint8Array, wasCompressed: boolean): Uint8Array {
  let body = payload;
  let compFlag = 0;

  if (wasCompressed) {
    try {
      if (typeof $utils !== "undefined" && typeof $utils.gzip === "function") {
        body = $utils.gzip(payload);
      } else {
        body = gzip(payload);
      }
      compFlag = 1;
    } catch (e) {
      console.log(`[哔哩速度] gzip 压缩失败，采用明文传输: ${e}`);
      compFlag = 0;
      body = payload;
    }
  }

  const frame = new Uint8Array(5 + body.length);
  frame[0] = compFlag;
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(1, body.length, false); // 网络字节序 (Big-Endian)
  frame.set(body, 5);
  return frame;
}

function getRawBytes(): Uint8Array | null {
  if (typeof $response === "undefined" || !$response) return null;
  if ($response.body instanceof Uint8Array) return $response.body;
  if ($response.bodyBytes instanceof Uint8Array) return $response.bodyBytes;
  return null;
}

function getPluginMode(): "auto" | "overseas" | "mainland" {
  try {
    if (typeof $argument === "string" && $argument.trim()) {
      const match = $argument.match(/(?:mode=)?([a-z]+)/i);
      const val = (match ? match[1] : $argument).trim().toLowerCase();
      if (val === "overseas" || val === "mainland") return val;
    }
  } catch (_e) {}
  return "auto";
}

function getPreferredHosts(): string[] {
  try {
    const raw = typeof $persistentStore !== "undefined" ? $persistentStore.read("bilibili_speed_cdn_ranking") : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (_e) {}
  return [];
}

async function handleResponse() {
  const rawBytes = getRawBytes();
  if (!rawBytes) {
    console.log("[哔哩速度] 未收到有效的二进制响应体 (请确认 binary-body-mode=true)");
    $done({});
    return;
  }

  try {
    const { payload, wasCompressed } = decodeGrpc(rawBytes);
    const preferredHosts = getPreferredHosts();
    const pluginMode = getPluginMode();

    // 1. 反序列化 gRPC Protobuf 响应 (自动适配 PlayViewUnite 与 PlayView)
    const isPlayView = typeof $request !== "undefined" && $request?.url && $request.url.includes("/PlayView") && !$request.url.includes("/PlayViewUnite");
    const reply: any = isPlayView
      ? PlayViewReply.fromBinary(payload)
      : PlayViewUniteReply.fromBinary(payload);

    let videoCount = 0;
    let audioCount = 0;
    let selectedMainHost = "";

    // 2. 遍历流媒体列表，应用【哔哩速度】核心调度算法
    // A. 视频轨优化 (streamList: DashVideo / SegmentVideo)
    if (reply?.vodInfo?.streamList && Array.isArray(reply.vodInfo.streamList)) {
      for (const stream of reply.vodInfo.streamList) {
        if (stream.content?.oneofKind === "dashVideo" && stream.content.dashVideo) {
          const dash = stream.content.dashVideo;
          const optimized = optimizeStreamUrls(dash.baseUrl, dash.backupUrl || [], preferredHosts, pluginMode);
          dash.baseUrl = optimized.baseUrl;
          dash.backupUrl = optimized.backupUrls;
          if (!selectedMainHost && optimized.baseUrl) {
            try { selectedMainHost = new URL(optimized.baseUrl).hostname; } catch {}
          }
          videoCount++;
        } else if (stream.content?.oneofKind === "segmentVideo" && stream.content.segmentVideo) {
          const segVideo = stream.content.segmentVideo;
          if (Array.isArray(segVideo.segment)) {
            for (const seg of segVideo.segment) {
              const optimized = optimizeStreamUrls(seg.url, seg.backupUrl || [], preferredHosts, pluginMode);
              seg.url = optimized.baseUrl;
              seg.backupUrl = optimized.backupUrls;
              if (!selectedMainHost && optimized.baseUrl) {
                try { selectedMainHost = new URL(optimized.baseUrl).hostname; } catch {}
              }
              videoCount++;
            }
          }
        }
      }
    }

    // B. 音频轨优化 (dashAudio: DashItem - 伴音流)
    if (reply?.vodInfo?.dashAudio && Array.isArray(reply.vodInfo.dashAudio)) {
      for (const audio of reply.vodInfo.dashAudio) {
        if (audio.baseUrl) {
          const optimized = optimizeStreamUrls(audio.baseUrl, audio.backupUrl || [], preferredHosts, pluginMode);
          audio.baseUrl = optimized.baseUrl;
          audio.backupUrl = optimized.backupUrls;
          audioCount++;
        }
      }
    }

    // C. 杜比伴音轨优化 (dolby.audio: DashItem)
    if (reply?.vodInfo?.dolby?.audio && Array.isArray(reply.vodInfo.dolby.audio)) {
      for (const audio of reply.vodInfo.dolby.audio) {
        if (audio.baseUrl) {
          const optimized = optimizeStreamUrls(audio.baseUrl, audio.backupUrl || [], preferredHosts, pluginMode);
          audio.baseUrl = optimized.baseUrl;
          audio.backupUrl = optimized.backupUrls;
          audioCount++;
        }
      }
    }

    // D. Hi-Res 无损伴音轨优化 (lossLessItem.audio: DashItem)
    if (reply?.vodInfo?.lossLessItem?.audio && reply.vodInfo.lossLessItem.audio.baseUrl) {
      const audio = reply.vodInfo.lossLessItem.audio;
      const optimized = optimizeStreamUrls(audio.baseUrl, audio.backupUrl || [], preferredHosts, pluginMode);
      audio.baseUrl = optimized.baseUrl;
      audio.backupUrl = optimized.backupUrls;
      audioCount++;
    }

    const totalModified = videoCount + audioCount;
    if (totalModified === 0) {
      console.log("[哔哩速度] 响应中未找到可优化的音视频流");
      $done({});
      return;
    }

    const modeLabel = pluginMode === "overseas" ? "海外强制" : pluginMode === "mainland" ? "国内强制" : "智能自适应";
    console.log(`[哔哩速度] 成功优化 ${videoCount} 条视频流 + ${audioCount} 条音频流 (${modeLabel})，主节点提升为: ${selectedMainHost || "优质官方CDN"}`);

    // 3. 重新序列化 Protobuf 并封装 gRPC 帧头 (保持与客户端期望的压缩状态一致)
    const newProto = isPlayView
      ? PlayViewReply.toBinary(reply)
      : PlayViewUniteReply.toBinary(reply);
    const finalGrpcBytes = encodeGrpc(newProto, wasCompressed);

    $done({ body: finalGrpcBytes, bodyBytes: finalGrpcBytes });
  } catch (err) {
    // 容灾熔断：解析异常时直接放行原包，绝不阻断视频播放
    console.log(`[哔哩速度] 选路处理跳过或异常: ${err}`);
    $done({});
  }
}

handleResponse();
