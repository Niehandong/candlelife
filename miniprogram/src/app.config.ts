export default defineAppConfig({
  // ⚠️ pages 只能列**已存在**的页面目录，否则 build:weapp 直接失败。
  // 后续每个任务负责把自己新建的页面加进这个列表：
  //   Task 8 → ritual        Task 9 → goodnight / reward
  //   Task 10 → journal-detail    Task 11 → art-detail
  pages: [
    'pages/home/index',
    'pages/journal/index',
    'pages/collection/index',
    'pages/settings/index',
    'pages/welcome/index',
    'pages/guide/index',
    'pages/story/index',
    'pages/ritual/index',
    'pages/goodnight/index',
    'pages/reward/index',
    'pages/journal-detail/index',
    'pages/art-detail/index',
  ],
  tabBar: {
    custom: true,
    color: '#c9becb',
    selectedColor: '#b9a3cd',
    backgroundColor: '#17141d',
    list: [
      { pagePath: 'pages/home/index', text: '今晚' },
      { pagePath: 'pages/journal/index', text: '夜记' },
      { pagePath: 'pages/collection/index', text: '收藏' },
      { pagePath: 'pages/settings/index', text: '设置' },
    ],
  },
  window: {
    backgroundTextStyle: 'dark',
    navigationStyle: 'custom',
    backgroundColor: '#17141d',
  },
})
