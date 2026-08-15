/** 服务端启动钩子：拉起后台采集轮询 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("./lib/poller")
    startPoller()
  }
}
