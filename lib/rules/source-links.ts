/** 规则依据的权威公开入口。待核验研究不提供伪链接，界面会明确标记。 */
const SOURCE_LINKS: Array<{ test: RegExp; url: string }> = [
  { test: /个人信息保护法/, url: "https://www.gov.cn/xinwen/2021-08/20/content_5632486.htm" },
  { test: /Flo Health/, url: "https://www.ftc.gov/news-events/news/press-releases/2021/06/ftc-finalizes-order-flo-health-fertility-tracking-app-shared-sensitive-health-data-facebook-google" },
  { test: /Premom/, url: "https://www.ftc.gov/news-events/news/press-releases/2023/05/ovulation-tracking-app-premom-will-be-barred-sharing-health-data-advertising-under-proposed-ftc" },
  { test: /NICE.*证据标准/, url: "https://www.nice.org.uk/corporate/ecd7" },
  { test: /ISO\/TS 82304-2/, url: "https://www.iso.org/standard/78182.html" },
  { test: /IMDRF.*临床评价/, url: "https://www.imdrf.org/documents/software-medical-device-samd-clinical-evaluation" },
  { test: /产前照护.*Digital Adaptation Kit/, url: "https://www.who.int/publications/i/item/9789240020306" },
  { test: /SMART Guidelines/, url: "https://www.who.int/teams/digital-health-and-innovation/smart-guidelines" },
  { test: /月经健康与权利/, url: "https://www.who.int/news/item/22-06-2022-who-statement-on-menstrual-health-and-rights" },
  { test: /尊重型孕产和新生儿照护/, url: "https://www.who.int/publications/i/item/9789241511216" },
];

export function getSourceUrl(ref: string): string | null {
  return SOURCE_LINKS.find((item) => item.test.test(ref))?.url ?? null;
}

export function isUnverifiedSource(ref: string): boolean {
  return /待核验|待填充/.test(ref);
}
