import(chrome.runtime.getURL('lib/content-main.js')).catch((error) => {
  console.error('[IP 悬停审核助手] 内容脚本加载失败', error);
});
