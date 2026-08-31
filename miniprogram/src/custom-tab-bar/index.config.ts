// `component: true` 是微信自定义 tabBar 组件的原生约定字段，
// Taro 的 PageConfig 类型未收录该字段，故此处显式绕过类型检查。
export default definePageConfig({ component: true } as unknown as Parameters<typeof definePageConfig>[0])

