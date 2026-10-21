/**
 * 哔哩速度 · 手机端专属 Loon 播放选路插件 (gRPC 二进制处理器)
 */

import { PlayViewUniteReply } from "./types";
import { optimizeStreamUrls } from "./cdn-core";

declare const $response: {
  status: number;
  headers: Record<string, string>;
  body?: string | Uint8Array;
  bodyBytes?: Uint8Array;
};

declare const $done: (data: any) => void;
declare const $persistentStore: {
  read: (key: string) => string | null;
  write: (value: string, key: string) => boolean;
};

function decodeGrpc(bytes: Uint8Array): Uint8Array {
  if (!bytes || bytes.length < 5) return bytes;
  return bytes.subarray(5);
}

function encodeGrpc(payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(5 + payload.length);
  frame[0] = 0; // 未压缩标志
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(1, payload.length, false); // 网络字节序 (Big-Endian)
  frame.set(payload, 5);
  return frame;
}

function getRawBytes(): Uint8Array | null {
  if (typeof $response === "undefined" || !$response) return null;
  if ($response.body instanceof Uint8Array) return $response.body;
  if ($response.bodyBytes instanceof Uint8Array) return $response.bodyBytes;
  return null;
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
    const protoPayload = decodeGrpc(rawBytes);
    const preferredHosts = getPreferredHosts();

    // 1. 反序列化 gRPC Protobuf 响应
    const reply = PlayViewUniteReply.fromBinary(protoPayload);

    let modifiedCount = 0;
    let selectedMainHost = "";

    // 2. 遍历流媒体列表，应用【哔哩速度】核心调度算法
    if (reply?.vodInfo?.streamList && Array.isArray(reply.vodInfo.streamList)) {
      for (const stream of reply.vodInfo.streamList) {
        if (stream.content?.oneofKind === "dashVideo" && stream.content.dashVideo) {
          const dash = stream.content.dashVideo;
          const optimized = optimizeStreamUrls(dash.baseUrl, dash.backupUrl || [], preferredHosts);
          dash.baseUrl = optimized.baseUrl;
          dash.backupUrl = optimized.backupUrls;
          if (!selectedMainHost && optimized.baseUrl) {
            try { selectedMainHost = new URL(optimized.baseUrl).hostname; } catch {}
          }
          modifiedCount++;
        } else if (stream.content?.oneofKind === "segmentVideo" && stream.content.segmentVideo) {
          const segVideo = stream.content.segmentVideo;
          if (Array.isArray(segVideo.segment)) {
            for (const seg of segVideo.segment) {
              const optimized = optimizeStreamUrls(seg.url, seg.backupUrl || [], preferredHosts);
              seg.url = optimized.baseUrl;
              seg.backupUrl = optimized.backupUrls;
              if (!selectedMainHost && optimized.baseUrl) {
                try { selectedMainHost = new URL(optimized.baseUrl).hostname; } catch {}
              }
              modifiedCount++;
            }
          }
        }
      }
    }

    if (modifiedCount === 0) {
      console.log("[哔哩速度] 响应中未找到可优化的视频流");
      $done({});
      return;
    }

    console.log(`[哔哩速度] 成功优化 ${modifiedCount} 条流，主节点提升为: ${selectedMainHost || "优质官方CDN"}`);

    // 3. 重新序列化 Protobuf 并封装 gRPC 帧头
    const newProto = PlayViewUniteReply.toBinary(reply);
    const finalGrpcBytes = encodeGrpc(newProto);

    $done({ body: finalGrpcBytes, bodyBytes: finalGrpcBytes });
  } catch (err) {
    // 容灾熔断：解析异常时直接放行原包，绝不阻断视频播放
    console.log(`[哔哩速度] 选路处理跳过或异常: ${err}`);
    $done({});
  }
}

handleResponse();
