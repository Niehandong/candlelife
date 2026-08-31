import Field from '../../components/Field'
import ConfigFormShell from './ConfigFormShell'
import { useConfigForm } from './useConfigForm'

export default function OnboardingPage() {
  const form = useConfigForm()
  const c = form.config
  const err = form.fieldErrors

  return (
    <ConfigFormShell
      title="开场引导"
      description="首次进入时的欢迎与序章。"
      form={form}
    >
      {c && (
        <>
          <Field label="欢迎页标题" htmlFor="ob-title" full
                 error={err['onboarding.welcome_title']}>
            <input id="ob-title" className="input" value={c.onboarding.welcome_title}
                   aria-invalid={Boolean(err['onboarding.welcome_title'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'welcome_title', e.target.value)} />
          </Field>

          <Field label="游客说明" htmlFor="ob-guest" full
                 error={err['onboarding.guest_copy']}>
            <input id="ob-guest" className="input" value={c.onboarding.guest_copy}
                   aria-invalid={Boolean(err['onboarding.guest_copy'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'guest_copy', e.target.value)} />
          </Field>

          <Field label="第一幕" htmlFor="ob-rest" error={err['onboarding.guide_rest']}>
            <input id="ob-rest" className="input" value={c.onboarding.guide_rest}
                   aria-invalid={Boolean(err['onboarding.guide_rest'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'guide_rest', e.target.value)} />
          </Field>

          <Field label="第二幕" htmlFor="ob-light" error={err['onboarding.guide_light']}>
            <input id="ob-light" className="input" value={c.onboarding.guide_light}
                   aria-invalid={Boolean(err['onboarding.guide_light'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'guide_light', e.target.value)} />
          </Field>

          <Field label="第三幕" htmlFor="ob-gift" full error={err['onboarding.guide_gift']}>
            <input id="ob-gift" className="input" value={c.onboarding.guide_gift}
                   aria-invalid={Boolean(err['onboarding.guide_gift'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'guide_gift', e.target.value)} />
          </Field>

          <Field label="视频资源路径" htmlFor="ob-video"
                 hint="相对 ASSET_BASE_URL 的路径，如 story/zhusheng-prologue.mp4"
                 error={err['onboarding.story_video_path']}>
            <input id="ob-video" className="input" value={c.onboarding.story_video_path}
                   aria-invalid={Boolean(err['onboarding.story_video_path'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'story_video_path', e.target.value)} />
          </Field>

          <Field label="封面资源" htmlFor="ob-poster"
                 hint="视频加载前显示的静态图"
                 error={err['onboarding.story_poster']}>
            <input id="ob-poster" className="input" value={c.onboarding.story_poster}
                   aria-invalid={Boolean(err['onboarding.story_poster'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'story_poster', e.target.value)} />
          </Field>

          <Field label="播放提示" htmlFor="ob-status" full
                 error={err['onboarding.story_status']}>
            <input id="ob-status" className="input" value={c.onboarding.story_status}
                   aria-invalid={Boolean(err['onboarding.story_status'])}
                   onChange={(e) =>
                     form.setField('onboarding', 'story_status', e.target.value)} />
          </Field>

          <Field label="允许跳过序章" htmlFor="ob-skip" full
                 hint="播放失败或减少动态效果时可以直接继续">
            <input id="ob-skip" type="checkbox" checked={c.onboarding.skip_story_enabled}
                   onChange={(e) =>
                     form.setField('onboarding', 'skip_story_enabled', e.target.checked)} />
          </Field>
        </>
      )}
    </ConfigFormShell>
  )
}
