import Field from '../../components/Field'
import ConfigFormShell from './ConfigFormShell'
import { useConfigForm } from './useConfigForm'

export default function RecordsPage() {
  const form = useConfigForm()
  const c = form.config
  const err = form.fieldErrors

  return (
    <ConfigFormShell
      title="记录与奖励"
      description="夜记展示、按时容差与收藏奖励。"
      form={form}
    >
      {c && (
        <>
          <Field label="默认展示最近天数" htmlFor="rc-days"
                 error={err['records.journal_days']}>
            <input id="rc-days" className="input" type="number" min={1} max={365}
                   value={c.records.journal_days}
                   aria-invalid={Boolean(err['records.journal_days'])}
                   onChange={(e) =>
                     form.setField('records', 'journal_days', Number(e.target.value))} />
          </Field>

          {/* 这个字段属于 ritual 组而非 records 组：按含义存，不按原型页面存。
              原型把它画在 records 页，但它在领域里是仪式的判定参数。 */}
          <Field label="按时完成容差（分钟）" htmlFor="rc-tolerance"
                 hint="改动只影响此后的仪式夜，已写入的历史夜记不会被修正"
                 error={err['ritual.tolerance_minutes']}>
            <input id="rc-tolerance" className="input" type="number" min={0} max={180}
                   value={c.ritual.tolerance_minutes}
                   aria-invalid={Boolean(err['ritual.tolerance_minutes'])}
                   onChange={(e) =>
                     form.setField('ritual', 'tolerance_minutes',
                                   Number(e.target.value))} />
          </Field>

          <Field label="夜记空状态" htmlFor="rc-empty" full
                 error={err['records.journal_empty_copy']}>
            <input id="rc-empty" className="input" value={c.records.journal_empty_copy}
                   aria-invalid={Boolean(err['records.journal_empty_copy'])}
                   onChange={(e) =>
                     form.setField('records', 'journal_empty_copy', e.target.value)} />
          </Field>

          <Field label="比较反馈模板" htmlFor="rc-compare" full
                 hint="{minutes} 会被替换成实际分钟数"
                 error={err['records.comparison_copy']}>
            <input id="rc-compare" className="input" value={c.records.comparison_copy}
                   aria-invalid={Boolean(err['records.comparison_copy'])}
                   onChange={(e) =>
                     form.setField('records', 'comparison_copy', e.target.value)} />
          </Field>

          <Field label="收藏总数量" htmlFor="rc-limit"
                 error={err['records.collection_limit']}>
            <input id="rc-limit" className="input" type="number" min={1} max={500}
                   value={c.records.collection_limit}
                   aria-invalid={Boolean(err['records.collection_limit'])}
                   onChange={(e) =>
                     form.setField('records', 'collection_limit',
                                   Number(e.target.value))} />
          </Field>

          <Field label="奖励出现时间" htmlFor="rc-timing"
                 error={err['records.reward_timing']}>
            <select id="rc-timing" className="select" value={c.records.reward_timing}
                    onChange={(e) =>
                      form.setField('records', 'reward_timing',
                                    e.target.value as 'next-day' | 'immediate')}>
              <option value="next-day">次日首次打开</option>
              <option value="immediate">仪式完成后</option>
            </select>
          </Field>

          <Field label="次日奖励文案" htmlFor="rc-reward" full
                 error={err['records.reward_copy']}>
            <input id="rc-reward" className="input" value={c.records.reward_copy}
                   aria-invalid={Boolean(err['records.reward_copy'])}
                   onChange={(e) =>
                     form.setField('records', 'reward_copy', e.target.value)} />
          </Field>

          <Field label="收藏空状态" htmlFor="rc-collection-empty" full
                 error={err['records.collection_empty_copy']}>
            <input id="rc-collection-empty" className="input"
                   value={c.records.collection_empty_copy}
                   aria-invalid={Boolean(err['records.collection_empty_copy'])}
                   onChange={(e) =>
                     form.setField('records', 'collection_empty_copy', e.target.value)} />
          </Field>

          <Field label="名画随机解锁" htmlFor="rc-random" full
                 hint="从已上架的作品库中随机抽取，不绑定某支蜡烛">
            <input id="rc-random" type="checkbox" checked={c.records.random_art_enabled}
                   onChange={(e) =>
                     form.setField('records', 'random_art_enabled', e.target.checked)} />
          </Field>

          <Field label="图片加载失败显示统一占位" htmlFor="rc-fallback" full
                 hint="避免收藏页出现空白或临时彩色矩形">
            <input id="rc-fallback" type="checkbox"
                   checked={c.records.image_fallback_enabled}
                   onChange={(e) =>
                     form.setField('records', 'image_fallback_enabled',
                                   e.target.checked)} />
          </Field>
        </>
      )}
    </ConfigFormShell>
  )
}
