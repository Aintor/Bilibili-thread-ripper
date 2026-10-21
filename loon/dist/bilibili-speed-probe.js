// src/bilibili-speed-probe.ts
var CANDIDATES = [
  "upos-sz-mirrorali.bilivideo.com",
  "upos-sz-mirrorhw.bilivideo.com",
  "upos-sz-mirrorcos.bilivideo.com",
  "upos-sz-mirror08c.bilivideo.com",
  "cn-hk-eq-01-01.bilivideo.com",
  "upos-sz-mirrorcosov.bilivideo.com",
  "upos-sz-mirroraliov.bilivideo.com"
];
function probeHost(host, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const testUrl = `https://${host}/upgcxcode/`;
    if (typeof $httpClient !== "undefined" && typeof $httpClient.head === "function") {
      $httpClient.head({ url: testUrl, timeout: timeoutMs / 1000 }, (error, response) => {
        const rtt = Date.now() - start;
        if (error || !response) {
          resolve({ host, rtt: Infinity, success: false });
        } else {
          resolve({ host, rtt, success: true });
        }
      });
    } else {
      fetch(testUrl, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) }).then(() => resolve({ host, rtt: Date.now() - start, success: true })).catch(() => resolve({ host, rtt: Infinity, success: false }));
    }
  });
}
async function runProbe() {
  console.log("[哔哩速度] 启动 CDN 异步测速探活...");
  const results = await Promise.all(CANDIDATES.map((host) => probeHost(host)));
  const validResults = results.filter((res) => res.success && Number.isFinite(res.rtt)).sort((a, b) => a.rtt - b.rtt);
  if (validResults.length === 0) {
    console.log("[哔哩速度] 测速探针未探测到有效节点，保持默认排序。");
    $done();
    return;
  }
  const sortedHosts = validResults.map((res) => res.host);
  if (typeof $persistentStore !== "undefined") {
    $persistentStore.write(JSON.stringify(sortedHosts), "bilibili_speed_cdn_ranking");
  }
  const fastest = validResults[0];
  const summary = validResults.slice(0, 3).map((item, idx) => `${idx + 1}. ${item.host.split(".")[0]}: ${item.rtt}ms`).join(`
`);
  console.log(`[哔哩速度] 最优 CDN: ${fastest.host} (${fastest.rtt}ms)`);
  if (typeof $notification !== "undefined") {
    $notification.post("⚡️ 哔哩速度 · CDN 测速完成", `当前网络最优节点: ${fastest.host.split(".")[0]} (${fastest.rtt}ms)`, `前三优选队列:
${summary}`);
  }
  $done();
}
runProbe();
