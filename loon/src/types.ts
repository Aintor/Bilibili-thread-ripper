import { MessageType } from "@protobuf-ts/runtime";

export class StreamInfo$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.StreamInfo", [
      { no: 1, name: "quality", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 2, name: "format", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 3, name: "description", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 4, name: "err_code", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 6, name: "need_vip", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
      { no: 7, name: "need_login", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
      { no: 8, name: "intact", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
      { no: 9, name: "no_rexcode", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
      { no: 10, name: "attribute", kind: "scalar", T: 3 /*ScalarType.INT64*/, L: 2 /*LongType.NUMBER*/ },
      { no: 11, name: "new_description", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 12, name: "display_desc", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 13, name: "superscript", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 14, name: "vip_free", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
      { no: 15, name: "subtitle", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 17, name: "support_drm", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
    ]);
  }
}
export const StreamInfo = new StreamInfo$Type();

export class DashVideo$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.DashVideo", [
      { no: 1, name: "base_url", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 2, name: "backup_url", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
      { no: 3, name: "bandwidth", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 4, name: "codecid", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 5, name: "md5", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 6, name: "size", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 2 /*LongType.NUMBER*/ },
      { no: 7, name: "audio_id", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 8, name: "no_rexcode", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
      { no: 9, name: "frame_rate", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 10, name: "width", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
      { no: 11, name: "height", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
      { no: 12, name: "widevine_pssh", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
    ]);
  }
}
export const DashVideo = new DashVideo$Type();

export class ResponseUrl$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.ResponseUrl", [
      { no: 1, name: "order", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 2, name: "length", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 2 /*LongType.NUMBER*/ },
      { no: 3, name: "size", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 2 /*LongType.NUMBER*/ },
      { no: 4, name: "url", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 5, name: "backup_url", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
      { no: 6, name: "md5", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
    ]);
  }
}
export const ResponseUrl = new ResponseUrl$Type();

export class SegmentVideo$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.SegmentVideo", [
      { no: 1, name: "segment", kind: "message", repeat: 1 /*RepeatType.PACKED*/, T: () => ResponseUrl },
    ]);
  }
}
export const SegmentVideo = new SegmentVideo$Type();

export class DashItem$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.DashItem", [
      { no: 1, name: "id", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 2, name: "base_url", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 3, name: "backup_url", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
      { no: 4, name: "bandwidth", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 5, name: "codecid", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 6, name: "md5", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 7, name: "size", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 2 /*LongType.NUMBER*/ },
    ]);
  }
}
export const DashItem = new DashItem$Type();

export class DolbyItem$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.DolbyItem", [
      { no: 1, name: "type", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
      { no: 2, name: "audio", kind: "message", repeat: 2 /*RepeatType.UNPACKED*/, T: () => DashItem },
    ]);
  }
}
export const DolbyItem = new DolbyItem$Type();

export class LossLessItem$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.LossLessItem", [
      { no: 1, name: "is_lossless_audio", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
      { no: 2, name: "audio", kind: "message", T: () => DashItem },
      { no: 3, name: "need_vip", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
    ]);
  }
}
export const LossLessItem = new LossLessItem$Type();

export class Stream$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.Stream", [
      { no: 1, name: "stream_info", kind: "message", T: () => StreamInfo },
      { no: 2, name: "dash_video", kind: "message", oneof: "content", T: () => DashVideo },
      { no: 3, name: "segment_video", kind: "message", oneof: "content", T: () => SegmentVideo },
    ]);
  }
}
export const Stream = new Stream$Type();

export class VodInfo$Type extends MessageType<any> {
  constructor() {
    super("bilibili.playershared.VodInfo", [
      { no: 1, name: "quality", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 2, name: "format", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
      { no: 3, name: "timelength", kind: "scalar", T: 4 /*ScalarType.UINT64*/, L: 2 /*LongType.NUMBER*/ },
      { no: 4, name: "video_codecid", kind: "scalar", T: 13 /*ScalarType.UINT32*/ },
      { no: 5, name: "stream_list", kind: "message", repeat: 2 /*RepeatType.UNPACKED*/, T: () => Stream },
      { no: 6, name: "dash_audio", kind: "message", repeat: 2 /*RepeatType.UNPACKED*/, T: () => DashItem },
      { no: 7, name: "dolby", kind: "message", T: () => DolbyItem },
      { no: 9, name: "loss_less_item", kind: "message", T: () => LossLessItem },
    ]);
  }
}
export const VodInfo = new VodInfo$Type();

export class PlayViewUniteReply$Type extends MessageType<any> {
  constructor() {
    super("bilibili.app.playerunite.v1.PlayViewUniteReply", [
      { no: 1, name: "vod_info", kind: "message", T: () => VodInfo },
    ]);
  }
}
export const PlayViewUniteReply = new PlayViewUniteReply$Type();

export class PlayViewReply$Type extends MessageType<any> {
  constructor() {
    super("bilibili.pgc.gateway.player.v2.PlayViewReply", [
      { no: 2, name: "vod_info", kind: "message", T: () => VodInfo },
    ]);
  }
}
export const PlayViewReply = new PlayViewReply$Type();
