import Field from '../../components/Field'
import ConfigFormShell from './ConfigFormShell'
import { useConfigForm } from './useConfigForm'

export default function BasicPage() {
  const form = useConfigForm()
  const c = form.config

  return (
    <ConfigFormShell
      title="基础设置"
      description="小程序的名称、定位与默认作息时间。"
      form={form}
    >
      {c && (
        <>
          <Field label="小程序名称" htmlFor="app-name" error={form.fieldErrors['app.name']}>
            <input id="app-name" className="input" value={c.app.name}
                   aria-invalid={Boolean(form.fieldErrors['app.name'])}
                   onChange={(e) => form.setField('app', 'name', e.target.value)} />
          </Field>

          <Field label="一句话定位" htmlFor="app-slogan"
                 error={form.fieldErrors['app.slogan']}>
            <input id="app-slogan" className="input" value={c.app.slogan}
                   aria-invalid={Boolean(form.fieldErrors['app.slogan'])}
                   onChange={(e) => form.setField('app', 'slogan', e.target.value)} />
          </Field>

          <Field label="首页核心问题" htmlFor="app-question" full
                 error={form.fieldErrors['app.home_question']}>
            <input id="app-question" className="input" value={c.app.home_question}
                   aria-invalid={Boolean(form.fieldErrors['app.home_question'])}
                   onChange={(e) => form.setField('app', 'home_question', e.target.value)} />
          </Field>

          <Field label="默认就寝时间" htmlFor="bedtime"
                 error={form.fieldErrors['schedule.bedtime']}>
            <input id="bedtime" className="input" type="time" value={c.schedule.bedtime}
                   onChange={(e) => form.setField('schedule', 'bedtime', e.target.value)} />
          </Field>

          <Field label="默认起床时间" htmlFor="wake-time"
                 error={form.fieldErrors['schedule.wake_time']}>
            <input id="wake-time" className="input" type="time" value={c.schedule.wake_time}
                   onChange={(e) => form.setField('schedule', 'wake_time', e.target.value)} />
          </Field>

          <Field label="可选最早就寝时间" htmlFor="min-time"
                 hint="资格窗口的下界，早于这个时间熄灯不计为按时"
                 error={form.fieldErrors['schedule.min_time']}>
            <input id="min-time" className="input" type="time" value={c.schedule.min_time}
                   onChange={(e) => form.setField('schedule', 'min_time', e.target.value)} />
          </Field>

          <Field label="可选最晚就寝时间" htmlFor="max-time"
                 hint="资格窗口的上界，可跨午夜。不得与下界相同"
                 error={form.fieldErrors['schedule.max_time']}>
            <input id="max-time" className="input" type="time" value={c.schedule.max_time}
                   onChange={(e) => form.setField('schedule', 'max_time', e.target.value)} />
          </Field>

          <Field label="允许跳过今晚" htmlFor="skip-tonight" full
                 hint="用户可结束当晚仪式，不影响历史记录">
            <input id="skip-tonight" type="checkbox" checked={c.app.skip_tonight_enabled}
                   onChange={(e) =>
                     form.setField('app', 'skip_tonight_enabled', e.target.checked)} />
          </Field>

          <Field label="首次使用显示引导" htmlFor="onboarding-enabled" full
                 hint="注册授权后播放保留的视觉序章">
            <input id="onboarding-enabled" type="checkbox" checked={c.app.onboarding_enabled}
                   onChange={(e) =>
                     form.setField('app', 'onboarding_enabled', e.target.checked)} />
          </Field>

          <Field label="减少动态效果选项" htmlFor="reduce-motion" full
                 hint="为敏感用户提供静态版仪式">
            <input id="reduce-motion" type="checkbox" checked={c.app.reduce_motion_default}
                   onChange={(e) =>
                     form.setField('app', 'reduce_motion_default', e.target.checked)} />
          </Field>

          <Field label="允许匿名事件统计" htmlFor="anon-analytics" full
                 hint="仅在用户同意后记录不含正文的功能事件">
            <input id="anon-analytics" type="checkbox"
                   checked={c.app.anonymous_analytics_enabled}
                   onChange={(e) =>
                     form.setField('app', 'anonymous_analytics_enabled', e.target.checked)} />
          </Field>
        </>
      )}
    </ConfigFormShell>
  )
}
