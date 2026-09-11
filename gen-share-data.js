// 生成 share/data.js：把后端 CONFIG 与全部 contents 内嵌为前端可直接使用的全局变量
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const contents = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'contents.json'), 'utf-8'));

const CONFIG = {
  CATEGORIES: ['膳食营养库', '慢病管理库', '生活实操库', '辟谣真相库', '专家答疑库', '健康陪伴库'],
  DISEASE_TAGS: ['高血压', '糖尿病', '高血脂', '骨质疏松', '慢阻肺', '普通健康', '食材红黑榜', '三餐搭配', '替代品认知', '食疗调理', '一周食谱', '慢病常识', '生活方式', '监测记录', '并发症预防', '用药尝试', '买菜指南', '下厨实操', '运动处方', '自测工具', '食疗误区', '保健品陷阱', '偏方核查', '代糖代盐真相', '一问一答', '直播回放', '误区纠正', '节气养生', '会员故事', '健康周报'],
  FORMAT_TAGS: ['图文', '短视频', '长视频', '音频答疑', '直播回放', '打卡任务', '自测工具'],
  JOURNEY_TAGS: ['认知层', '行动层', '深化层'],
  CATEGORY_COLOR: {
    '膳食营养库': '#2e9e5b',
    '慢病管理库': '#e8633a',
    '生活实操库': '#2f8fd6',
    '辟谣真相库': '#c0392b',
    '专家答疑库': '#8e44ad',
    '健康陪伴库': '#d4a017'
  }
};

const cleanContents = contents.map(it => {
  const { subTopics, ...rest } = it;
  return rest;
});

const out = `// 自动生成，请勿手改。由 gen-share-data.js 根据 data/contents.json 与后端 CONFIG 生成。
window.SITE_CONFIG = ${JSON.stringify(CONFIG, null, 2)};
window.SITE_CONTENTS = ${JSON.stringify(cleanContents, null, 2)};
`;

fs.writeFileSync(path.join(ROOT, 'share', 'data.js'), out, 'utf-8');
console.log('data.js written, contents:', contents.length);
