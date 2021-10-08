import { runtime } from "webextension-polyfill";
import { inject, ipc, Options, sha1 } from "../util";

inject("content/yt-player-overrides.inject.js");

const videoId = window.location.pathname.split("/").slice(-1)[0];
if (videoId) {
  inject("content/yt-player-overrides.inject.js");
}

(async () => {
  if (!(await Options.get("remoteLikeButton"))) return;
  async function getYtLikeData() {
    const doc = await fetch(`https://www.youtube.com/watch?v=${videoId}`).then((r) => r.text());
    const apiKey = doc.match(/"INNERTUBE_API_KEY":"(.*?)"/)?.[1];
    const context = JSON.parse(
      (doc.match(/\(\{"INNERTUBE_CONTEXT":([\w\W]*?)\}\)/) ||
        doc.match(/"INNERTUBE_CONTEXT":([\w\W]*?\}),"INNERTUBE/))?.[1] ?? "{}"
    );
    const ytClientName = doc.match(/"INNERTUBE_CONTEXT_CLIENT_NAME":(\d+),/)?.[1];
    const ytClientVersion = doc.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"(.*?)"/)?.[1];
    const pageId = doc.match(/"DELEGATED_SESSION_ID":"(.*?)"/)?.[1];
    const likeParams = doc.match(/"likeParams":"(.*?)"/)?.[1];
    const removeLikeParams = doc.match(/"removeLikeParams":"(.*?)"/)?.[1];
    const PAPISID = document.cookie.match(/3PAPISID=([^;]*);?.*$/)?.[1];
    if (
      !apiKey ||
      Object.keys(context).length === 0 ||
      !ytClientName ||
      !ytClientVersion ||
      // !pageId ||
      !likeParams ||
      !PAPISID
    ) {
      return null;
    }
    return { apiKey, context, ytClientName, ytClientVersion, pageId, likeParams, removeLikeParams, PAPISID };
  }

  async function like() {
    const ytLikeData = await getYtLikeData();
    if (!ytLikeData) return false;
    const { apiKey, context, pageId, ytClientName, ytClientVersion, PAPISID, likeParams } = ytLikeData;
    const nowTime = Math.floor(Date.now() / 1000);
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/like/like?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-AuthUser": "0",
          "X-Goog-Visitor-Id": context.client.visitorData,
          // "X-Goog-PageId": pageId,
          "X-Youtube-Client-Name": ytClientName,
          "X-Youtube-Client-Version": ytClientVersion,
          "X-Origin": "https://www.youtube.com",
          "SEC-CH-UA-ARCH": "x86",
          "sec-ch-ua-platform-version": "10.0.0",
          "sec-ch-ua-full-version": "93.0.4577.82",
          Authorization: `SAPISIDHASH ${nowTime}_${await sha1(`${nowTime} ${PAPISID} https://www.youtube.com`)}`,
        },
        body: JSON.stringify({
          context,
          target: { videoId },
          params: likeParams,
        }),
      }).then(async (r) => ({ status: r.status, body: await r.text() }));
      if (res.status === 200 && res.body.includes("Added to Liked videos")) {
        return true;
      }
    } catch (e) {
      console.error("[Holodex+] Error while sending like:", e);
    }
    return false;
  }
  ipc.on("like", async () => ((await like()) ? ipc.send("liked") : ipc.send("failed")));
})();