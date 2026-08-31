import { useEffect, useState } from 'react'

import Field from '../../components/Field'
import ConfigFormShell from './ConfigFormShell'
import { useConfigForm } from './useConfigForm'

export default function RitualPage() {
  const form = useConfigForm()
  const c = form.config
  const err = form.fieldErrors

  /* 阻力选项是「一行一项」的 textarea，但存进配置的是过滤掉空行的数组。
     两者不能同一份状态：如果每次按键都用过滤后的数组回填 textarea，
     回车产生的尾部换行会被立刻吃掉，用户根本打不出第二项。
     所以本地保留一份原始文本，只在写入配置时过滤。 */
  const [rawOptions, setRawOptions] = useState<string | null>(null)

  // dirty 回到 false = 撤销或保存完成，本地草稿要跟着回到权威值
  useEffect(() => { if (!form.dirty) setRawOptions(null) }, [form.dirty])

  const optionsText = rawOptions ?? c?.ritual.resistance_options.join('\n') ?? ''

  return (
    <ConfigFormShell
      title="仪式设置"
      description="仪式的四个阶段、时长与文案。"
      form={form}
    >
      {c && (
        <>
          <Field label="默认仪式时长（分钟）" htmlFor="rt-minutes"
                 error={err['ritual.ritual_minutes']}>
            <input id="rt-minutes" className="input" type="number" min={1} max={180}
                   value={c.ritual.ritual_minutes}
                   aria-invalid={Boolean(err['ritual.ritual_minutes'])}
                   onChange={(e) =>
                     form.setField('ritual', 'ritual_minutes', Number(e.target.value))} />
          </Field>

          <Field label="提前变暗（分钟）" htmlFor="rt-dim"
                 error={err['ritual.dim_minutes']}>
            <input id="rt-dim" className="input" type="number" min={0} max={60}
                   value={c.ritual.dim_minutes}
                   aria-invalid={Boolean(err['ritual.dim_minutes'])}
                   onChange={(e) =>
                     form.setField('ritual', 'dim_minutes', Number(e.target.value))} />
          </Field>

          <Field label="感恩输入数量" htmlFor="rt-gratitude"
                 error={err['ritual.gratitude_count']}>
            <input id="rt-gratitude" className="input" type="number" min={1} max={5}
                   value={c.ritual.gratitude_count}
                   aria-invalid={Boolean(err['ritual.gratitude_count'])}
                   onChange={(e) =>
                     form.setField('ritual', 'gratitude_count', Number(e.target.value))} />
          </Field>

          <Field label="明日计划数量" htmlFor="rt-plan"
                 error={err['ritual.plan_count']}>
            <input id="rt-plan" className="input" type="number" min={1} max={5}
                   value={c.ritual.plan_count}
                   aria-invalid={Boolean(err['ritual.plan_count'])}
                   onChange={(e) =>
                     form.setField('ritual', 'plan_count', Number(e.target.value))} />
          </Field>

          <Field label="晚间阻力选项" htmlFor="rt-resistance" full
                 hint="一行一项，最多 8 项，每项不超过 32 字"
                 error={err['ritual.resistance_options']}>
            <textarea id="rt-resistance" className="textarea" rows={4}
                      value={optionsText}
                      aria-invalid={Boolean(err['ritual.resistance_options'])}
                      onChange={(e) => {
                        setRawOptions(e.target.value)
                        form.setField(
                          'ritual', 'resistance_options',
                          e.target.value.split('\n').filter((s) => s.trim()))
                      }} />
          </Field>

          <Field label="默认温柔回应" htmlFor="rt-reply" full
                 error={err['ritual.resistance_reply']}>
            <input id="rt-reply" className="input" value={c.ritual.resistance_reply}
                   aria-invalid={Boolean(err['ritual.resistance_reply'])}
                   onChange={(e) =>
                     form.setField('ritual', 'resistance_reply', e.target.value)} />
          </Field>

          <Field label="完成文案" htmlFor="rt-goodnight" full
                 error={err['ritual.goodnight_text']}>
            <input id="rt-goodnight" className="input" value={c.ritual.goodnight_text}
                   aria-invalid={Boolean(err['ritual.goodnight_text'])}
                   onChange={(e) =>
                     form.setField('ritual', 'goodnight_text', e.target.value)} />
          </Field>

          <Field label="中断后的温柔提醒" htmlFor="rt-interrupt" full
                 error={err['ritual.interrupt_text']}>
            <textarea id="rt-interrupt" className="textarea" rows={2}
                      value={c.ritual.interrupt_text}
                      aria-invalid={Boolean(err['ritual.interrupt_text'])}
                      onChange={(e) =>
                        form.setField('ritual', 'interrupt_text', e.target.value)} />
          </Field>

          <Field label="阶段一 · 未开始" htmlFor="rt-stage1"
                 hint="今晚几点熄灯？环境偏暖，蜡烛未点燃">
            <input id="rt-stage1" type="checkbox"
                   checked={c.ritual.stage_not_started_enabled}
                   onChange={(e) =>
                     form.setField('ritual', 'stage_not_started_enabled',
                                   e.target.checked)} />
          </Field>

          <Field label="阶段二 · 准备入睡" htmlFor="rt-stage2"
                 hint="火苗稳定，背景渐暗，显示感恩与明日三件事">
            <input id="rt-stage2" type="checkbox"
                   checked={c.ritual.stage_wind_down_enabled}
                   onChange={(e) =>
                     form.setField('ritual', 'stage_wind_down_enabled',
                                   e.target.checked)} />
          </Field>

          <Field label="阶段三 · 即将入睡" htmlFor="rt-stage3"
                 hint="火苗缩小，文字和操作弱化，不再新增刺激内容">
            <input id="rt-stage3" type="checkbox"
                   checked={c.ritual.stage_quieting_enabled}
                   onChange={(e) =>
                     form.setField('ritual', 'stage_quieting_enabled',
                                   e.target.checked)} />
          </Field>

          <Field label="阶段四 · 已完成" htmlFor="rt-stage4"
                 hint="火焰熄灭，只保留低频呼吸光与完成反馈">
            <input id="rt-stage4" type="checkbox"
                   checked={c.ritual.stage_done_enabled}
                   onChange={(e) =>
                     form.setField('ritual', 'stage_done_enabled', e.target.checked)} />
          </Field>

          {/* 只读说明，不是开关。原型把这一条画成可关的复选框，但正文加密在
              阶段一已是架构级保证（MultiFernet + 后端 AST 测试禁止 admin 代码
              引用 decrypt_*），运营关不掉它。做成开关会谎称一个不存在的能力。 */}
          <div style={{
            gridColumn: '1 / -1', background: 'var(--soft)',
            borderRadius: 10, padding: '12px 16px',
          }}>
            <strong>书写内容仅保存在用户端与加密列中</strong>
            <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>
              感恩与明日计划的正文以 MultiFernet 加密存储，管理后台没有任何接口可以
              读取或解密它们。这是架构保证，不是可配置项。
            </p>
          </div>
        </>
      )}
    </ConfigFormShell>
  )
}
