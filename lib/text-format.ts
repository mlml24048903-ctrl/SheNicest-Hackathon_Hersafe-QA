/** 保留模型原有换行，并修复旧消息中被空格粘在一起的常见段落标签。 */
export function formatModelMessage(input: string): string {
  return input
    .replace(/&#x20;|&nbsp;/gi, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\s+(?=(?:记录事实|适用范围|风险更新预览|置信度|不适用依据|修改建议)：)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
