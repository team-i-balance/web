// 배포·PC 적용: 지금 적용된 정책, 직원 PC가 받았는지(적용·거부와 사유), 배포 기록
import { useEffect, useState } from 'react'
import { MonitorCheck, RefreshCw, History, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { S, useStore } from '../../domain/store'
import { acksNow, historyFromServer, loadVersion, reasonKo, refreshAcks, type VersionView } from '../../api/policy'
import { Button, Empty, Meter, Notice, Tag } from '../../ds'
import { openDialog } from '../dialogs'
import { fmt } from '../../lib/util'
import d from './deploy.module.css'

export default function Deploy() {
  useStore()
  const P = S.policy, a = acksNow(), live = S.api.live
  const hist = [...S.history].filter(h => !live || h.server).reverse()
  const left = a ? a.devices - a.applied - a.rejected : 0
  return (
    <div className={d.wrap}>
      {P.changes.length > 0 && <div className={d.full}><Notice tone="info" title={`배포 대기 변경 ${P.changes.length}개`}
        actions={<Button variant="now" onClick={() => openDialog({ kind: 'publish' })}>서명 후 배포하기</Button>}>서명 후 배포해야 직원 PC에 적용돼요</Notice></div>}

      <section className={d.card} aria-label="지금 적용된 정책">
        <div className={d.ch}><h2>지금 정책</h2>{live ? <Tag tone="ok" dot>서버 기준</Tag> : <Tag dot>예시 데이터</Tag>}</div>
        {P.version === 'v0'
          ? <Empty icon={<MonitorCheck size={20} />} title="아직 배포한 정책이 없어요" text="정책을 고친 뒤 서명 후 배포하면 여기에 보여요" />
          : <>
            <div className={d.ver}><b>{P.version}</b><span>{P.deployed ? `${P.deployed} 배포` : '서버에 배포됨'}</span></div>
            <dl className={d.kv}>
              <dt>서명 키</dt><dd className={d.mono}>{live ? S.api.pol?.keyid ?? '—' : 'console-demo'}</dd>
              <dt>규칙</dt><dd>{P.learned.length}개 · 탐지 항목 {P.entities.filter(e => e.on).length}개 켬</dd>
              {live && S.api.pol?.sha && <><dt>번들 해시</dt><dd className={d.mono}>{S.api.pol.sha}</dd></>}
            </dl>
          </>}
      </section>

      <section className={d.card} aria-label="PC 적용 현황">
        <div className={d.ch}><h2>PC 적용{live && P.version !== 'v0' ? ` · ${P.version}` : ''}</h2>{live && <Button size="sm" variant="ghost" icon={<RefreshCw size={16} />} onClick={() => refreshAcks()}>새로고침</Button>}</div>
        {!a || !a.devices ? <Empty icon={<MonitorCheck size={20} />} title="아직 받은 PC가 없어요" text="직원 PC가 새 정책을 받으면 여기에 모여요" />
          : <>
            <div className={d.ver}><b>{Math.round((a.applied / a.devices) * 100)}%</b><span>{a.devices}대 중 {a.applied}대 적용</span></div>
            <Meter value={a.applied / a.devices} label="PC 적용 비율" />
            <div className={d.stats}>
              <div className={clsx(d.stat, d.good)}><span>적용</span><b>{a.applied}</b></div>
              <div className={clsx(d.stat, a.rejected > 0 && d.bad)}><span>거부</span><b>{a.rejected}</b></div>
              <div className={d.stat}><span>기다리는 중</span><b>{left}</b></div>
            </div>
            {a.rejected > 0 && <Notice tone="warning" title={`거부한 PC ${a.rejected}대`}><ul className={d.reasons}>{Object.entries(a.reject_reasons).map(([k, n]) => <li key={k}><span>{reasonKo(k)}</span><span>{n}대</span></li>)}</ul></Notice>}
            <p className={d.note}>PC는 서명과 버전을 확인한 뒤에만 새 정책을 적용해요. 거부한 PC는 지금 정책을 그대로 써요.</p>
          </>}
      </section>

      <section className={clsx(d.card, d.full)} aria-label="배포 기록">
        <div className={d.ch}><h2>배포 기록</h2>{live && !historyFromServer && <span className={d.note}>서버에 기록 목록이 없어 이 브라우저에서 배포한 것만 보여요</span>}</div>
        {hist.length ? <ol className={d.hist}>{hist.map(h => <li key={h.version + +h.at} className={d.hi}>
          <div className={d.hv}><b>{h.version}</b><span>{fmt(h.at)}</span></div>
          <ul className={d.hc}>{h.changes.map((c, i) => <li key={i}><span>{c.what}</span><em>{c.src}</em></li>)}</ul>
          {live && h.server && <VersionDetail n={+h.version.slice(1)} />}
        </li>)}</ol> : <Empty icon={<History size={20} />} title={live && !historyFromServer ? '이 브라우저에서 배포한 기록이 없어요' : '아직 배포한 기록이 없어요'} />}
      </section>
    </div>
  )
}

// 서버에 저장된 버전 내용: 펼칠 때 /policy/{n} 을 받아 앞 버전과 비교한다
function VersionDetail({ n }: { n: number }) {
  const [open, setOpen] = useState(false), [v, setV] = useState<VersionView | null>(null), [err, setErr] = useState('')
  useEffect(() => { if (open && !v) loadVersion(n).then(setV, e => setErr(String(e?.message || e))) }, [open, n, v])
  return (
    <div className={d.vd}>
      <Button size="sm" variant="ghost" aria-expanded={open} icon={<ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : undefined }} />} onClick={() => setOpen(o => !o)}>{open ? '내용 접기' : '이 버전 내용 보기'}</Button>
      {open && (err ? <p className={d.note}>버전 내용을 불러오지 못했어요 · {err}</p> : !v ? <p className={d.note}>불러오는 중…</p> : <>
        <dl className={d.kv}>
          <dt>앞 버전 대비</dt><dd>{n === 1 ? '첫 배포' : v.changed.length ? <ul className={d.vlist}>{v.changed.map(c => <li key={c}>{c}</li>)}</ul> : '바뀐 점 없음'}</dd>
          <dt>자동 변환 규칙</dt><dd>{v.rules.length ? <ul className={d.vlist}>{v.rules.map((r, i) => <li key={i}>{r.description} → {r.label} {r.action}</li>)}</ul> : '없음'}</dd>
          <dt>탐지 항목</dt><dd>{v.on}개 켬{v.off.length ? ` · 끔: ${v.off.join(', ')}` : ''}</dd>
          <dt>회사 고유 단어</dt><dd>{v.dict}개</dd>
          <dt>탐지 제외</dt><dd>{v.exclude}개</dd>
          <dt>서명 키</dt><dd className={d.mono}>{v.keyid ?? '—'}</dd>
        </dl>
      </>)}
    </div>
  )
}
