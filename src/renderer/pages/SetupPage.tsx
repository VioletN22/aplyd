import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, FileText, Brain, MessageSquareHeart, Sparkles, Link2, PenLine, Lock, Wand2, Check, ThumbsUp, ThumbsDown, Play, Pause, Square, Send, Inbox, AlertTriangle, RotateCcw, Search, SkipForward } from 'lucide-react';
import { AnswerBankEntry, LockerDocument, VoiceNote, VoiceNoteKind, PortfolioLink, CoverLetter } from '../../shared/types';

const api = () => window.electronAPI.setup;

const card: React.CSSProperties = {
  border: '1px solid var(--ink, rgba(0,0,0,.12))',
  borderRadius: 14,
  padding: 18,
  marginBottom: 18,
  background: 'var(--panel, rgba(0,0,0,.02))',
};
const input: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ink, rgba(0,0,0,.2))',
  background: 'transparent', color: 'var(--ink, inherit)', fontSize: 13, width: '100%',
};
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
  border: '1px solid var(--ink, rgba(0,0,0,.2))', background: 'transparent', cursor: 'pointer',
  fontSize: 13, fontWeight: 600, color: 'var(--ink, inherit)',
};
const tagChip: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
  padding: '2px 7px', borderRadius: 6, border: '1px solid var(--ink, rgba(0,0,0,.25))', opacity: 0.7,
};

export const SetupPage: React.FC = () => {
  const [answers, setAnswers] = useState<AnswerBankEntry[]>([]);
  const [docs, setDocs] = useState<LockerDocument[]>([]);
  const [notes, setNotes] = useState<VoiceNote[]>([]);
  const [links, setLinks] = useState<PortfolioLink[]>([]);
  const [letters, setLetters] = useState<CoverLetter[]>([]);

  const reload = async () => {
    setAnswers(await api().getAnswerBank());
    setDocs(await api().getDocuments());
    setNotes(await api().getVoiceNotes());
    setLinks(await api().getPortfolioLinks());
    setLetters(await api().getCoverLetters());
  };
  useEffect(() => { reload(); }, []);

  const core = { answers, docs, notes, links, letters, reload };
  return <SetupView core={core} />;
};

// The setup the Chrome extension and cover letters read from: profile, resumes,
// answers, assets, voice, letters. The Easy Apply autofill happens in the extension
// (it fills, you submit).
const SETUP_TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'answers', label: 'Answers' },
  { id: 'resumes', label: 'Resume' },
  { id: 'assets', label: 'Assets' },
  { id: 'voice', label: 'Voice' },
  { id: 'letters', label: 'Letters' },
] as const;
const SetupView: React.FC<{ core: CoreData }> = ({ core }) => {
  const [tab, setTab] = useState<(typeof SETUP_TABS)[number]['id']>('profile');
  const tabBtn: React.CSSProperties = { fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', color: 'var(--muted,#888)', background: 'transparent' };
  const tabOn: React.CSSProperties = { color: '#fff', background: 'var(--ink,#111)' };
  return (
    <div style={{ position: 'fixed', top: 58, left: 'var(--nav-w, 256px)', right: 0, bottom: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--ink)', transition: 'left .18s ease' }}>
      <div style={{ padding: '16px 24px 12px', borderBottom: '1px solid var(--line,rgba(0,0,0,.1))' }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.01em' }}>LinkedIn Easy Apply</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted,#888)', marginTop: 4, lineHeight: 1.55, maxWidth: 720 }}>
          Set up what aplyd knows about you below. On LinkedIn, the aplyd Chrome extension fills Easy Apply forms from this. You review and hit Submit yourself. Nothing is sent on its own.
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
          {SETUP_TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ ...tabBtn, ...(tab === t.id ? tabOn : {}) }}>{t.label}</button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 24px 40px' }}>
        <div style={{ maxWidth: 720 }}>
          {tab === 'profile' && <ProfileSection />}
          {tab === 'answers' && <AnswerBankSection answers={core.answers} reload={core.reload} />}
          {tab === 'resumes' && <ResumesPanel docs={core.docs} reload={core.reload} />}
          {tab === 'assets' && <>
            <DocumentLockerSection docs={core.docs} reload={core.reload} />
            <PortfolioSection links={core.links} reload={core.reload} />
          </>}
          {tab === 'voice' && <VoiceSection notes={core.notes} reload={core.reload} />}
          {tab === 'letters' && <CoverLetterSection letters={core.letters} reload={core.reload} />}
        </div>
      </div>
    </div>
  );
};
type CoreData = { answers: AnswerBankEntry[]; docs: LockerDocument[]; notes: VoiceNote[]; links: PortfolioLink[]; letters: CoverLetter[]; reload: () => void };
const ResumesPanel: React.FC<{ docs: LockerDocument[]; reload: () => void }> = ({ docs, reload }) => {
  const resumes = docs.filter((d) => d.tags.includes('resume'));
  const [focus, setFocus] = useState<Record<string, string>>({});
  useEffect(() => { window.electronAPI.setup.getResumeFocus().then(setFocus); }, [docs.length]);
  const add = async () => {
    const fp = await window.electronAPI.setup.pickDocument();
    if (!fp) return;
    const label = (fp.split('/').pop() || 'Resume').replace(/\.[^.]+$/, '');
    await window.electronAPI.setup.addDocument(label, fp, ['resume'], resumes.length === 0);
    reload();
  };
  const saveFocus = (id: string, v: string) => { setFocus((f) => ({ ...f, [id]: v })); window.electronAPI.setup.setResumeFocus(id, v); };
  return (
    <section style={card}>
      <SectionHead icon={<FileText size={15} />} title="Resumes" count={resumes.length}
        action={<button style={btn} onClick={add}><Plus size={14} /> Add</button>} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>Keep a variant per angle and note each one's <b>focus</b>, so you can grab the right resume for a role (the default is the fallback when only one fits).</p>
      {resumes.length === 0 && <Empty>No resume yet. Add your main one (and an ecommerce variant when ready).</Empty>}
      {resumes.map((d) => (
        <Row key={d.id} onDelete={async () => { await window.electronAPI.setup.deleteDocument(d.id); reload(); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0 }}>{d.label}</div>
            {d.isDefault
              ? <span style={{ ...tagChip, borderColor: 'rgba(242,58,23,.5)', color: 'var(--accent,#f23a17)' }}>default</span>
              : <button style={{ ...btn, fontSize: 11, padding: '3px 8px' }} onClick={async () => { await window.electronAPI.setup.setDocumentDefault(d.id); reload(); }}>Make default</button>}
          </div>
          <input style={{ ...input, fontSize: 11, marginTop: 5 }} value={focus[d.id] || ''} placeholder='Focus (e.g. "full-stack software" / "ecommerce, Shopify, WooCommerce")'
            onChange={(e) => setFocus((f) => ({ ...f, [d.id]: e.target.value }))} onBlur={(e) => saveFocus(d.id, e.target.value)} />
          <div style={{ fontSize: 10, opacity: 0.45, marginTop: 3 }}>{d.filePath.split('/').pop()}</div>
        </Row>
      ))}
    </section>
  );
};

const PROFILE_FIELDS = ['Legal first name', 'Legal last name', 'Preferred name', 'Email', 'Phone', 'Location', 'Work authorization', 'Require visa sponsorship', 'Years of experience', 'Current title', 'LinkedIn', 'GitHub', 'Portfolio', 'Salary expectation', 'Notice period', 'Open to remote'];
// Hints shown under the name fields so the distinction is obvious.
const FIELD_HINT: Record<string, string> = {
  'Legal first name': 'your name as it appears on official documents',
  'Legal last name': 'your surname as it appears on official documents',
  'Preferred name': 'the name you go by, used only when a form asks for it',
};

const ProfileSection: React.FC = () => {
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [seeding, setSeeding] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = async () => setProfile(await window.electronAPI.profile.get());
  useEffect(() => { load(); }, []);
  const setField = (k: string, v: string) => setProfile((p) => ({ ...p, [k]: v }));
  const save = async () => { await window.electronAPI.profile.set(profile); setSaved(true); window.setTimeout(() => setSaved(false), 1400); };
  // Persist whatever's typed FIRST so the seed merge (which keeps your values)
  // never overrides an edit you hadn't clicked away from yet.
  const seed = async () => {
    setSeeding(true);
    await window.electronAPI.profile.set(profile);
    const merged = await window.electronAPI.profile.seed();
    setProfile(merged); setSeeding(false);
  };
  const keys = Array.from(new Set([...PROFILE_FIELDS, ...Object.keys(profile)]));
  return (
    <section style={card}>
      <SectionHead icon={<Brain size={16} />} title="Profile" count={Object.values(profile).filter(Boolean).length}
        action={<button style={btn} onClick={seed} disabled={seeding}><Wand2 size={14} /> {seeding ? 'Reading resume…' : 'Seed from resume'}</button>} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Autosaves as you type, and the extension fills these into Easy Apply forms. <b>Seed from resume</b> only fills blank fields. It never overrides what you have entered.
        {saved && <span style={{ color: '#1f9d55', fontWeight: 700 }}> · Saved</span>}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        {keys.map((k) => (
          <label key={k} style={{ fontSize: 11, opacity: 0.85, gridColumn: FIELD_HINT[k] ? '1 / -1' : undefined }}>
            <div style={{ marginBottom: 3, fontWeight: 600 }}>{k}</div>
            <input style={input} value={profile[k] || ''} onChange={(e) => setField(k, e.target.value)} onBlur={save} />
            {FIELD_HINT[k] && <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>{FIELD_HINT[k]}</div>}
          </label>
        ))}
      </div>
    </section>
  );
};

// ── Portfolio links ──────────────────────────────────────────────────────────
const PortfolioSection: React.FC<{ links: PortfolioLink[]; reload: () => void }> = ({ links, reload }) => {
  const [label, setLabel] = useState('');
  const [urlVal, setUrlVal] = useState('');

  const save = async () => {
    let u = urlVal.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    await api().addPortfolioLink(label.trim() || 'Portfolio', u);
    setLabel(''); setUrlVal(''); reload();
  };

  return (
    <section style={card}>
      <SectionHead icon={<Link2 size={16} />} title="Portfolio links" count={links.length} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        Your portfolio is a live site, so add it as a link. Claude visits it when writing cover letters and answers,
        pulling in real work so each one is grounded in what you've actually built.
      </p>

      <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, border: '1px dashed var(--ink, rgba(0,0,0,.2))', borderRadius: 10 }}>
        <input style={input} placeholder='Label (e.g. "Portfolio site", "GitHub")' value={label} onChange={(e) => setLabel(e.target.value)} />
        <input style={input} placeholder='https://your-portfolio.com' value={urlVal} onChange={(e) => setUrlVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
        <div><button style={{ ...btn, fontWeight: 700 }} onClick={save} disabled={!urlVal.trim()}>Add link</button></div>
      </div>

      {links.length === 0 && <Empty>No links yet. Add your portfolio website so Claude can reference it.</Empty>}
      {links.map((l) => (
        <Row key={l.id} onDelete={async () => { await api().deletePortfolioLink(l.id); reload(); }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{l.label}</div>
          <a href={l.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--accent, #2563eb)', textDecoration: 'none', wordBreak: 'break-all' }}>{l.url}</a>
        </Row>
      ))}
    </section>
  );
};

// ── Cover-letter vault + studio ──────────────────────────────────────────────
const CoverLetterSection: React.FC<{ letters: CoverLetter[]; reload: () => void }> = ({ letters, reload }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CoverLetter | null>(null);

  return (
    <section style={card}>
      <SectionHead icon={<PenLine size={16} />} title="Cover-letter vault" count={letters.length}
        action={<button style={btn} onClick={() => { setEditing(null); setOpen((v) => !v); }}><Plus size={14} /> New</button>} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        When a role wants a cover letter, draft it here with Claude (tailored to the role, grounded in your resume +
        portfolio), refine it together with feedback, then save the perfected version to the vault. Already have your
        own for a role? Paste it straight in. Your feedback teaches your <b>Voice</b> for next time.
      </p>

      {(open || editing) && (
        <CoverLetterStudio
          existing={editing}
          onClose={() => { setOpen(false); setEditing(null); }}
          onSaved={() => { setOpen(false); setEditing(null); reload(); }}
        />
      )}

      {letters.length === 0 && !open && <Empty>No saved cover letters yet. Hit “New” to draft one with Claude.</Empty>}
      {letters.map((l) => (
        <Row key={l.id} onDelete={async () => { await api().deleteCoverLetter(l.id); reload(); }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{l.role} <span style={{ opacity: 0.5 }}>· {l.company}</span></span>
            {l.isFinal && <span style={{ ...tagChip, opacity: 1, borderColor: 'var(--accent, currentColor)', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lock size={9} /> final</span>}
          </div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{l.body}</div>
          <button style={{ ...btn, marginTop: 6, padding: '4px 10px', fontSize: 12 }} onClick={() => { setOpen(false); setEditing(l); }}>Open</button>
        </Row>
      ))}
    </section>
  );
};

const CoverLetterStudio: React.FC<{ existing: CoverLetter | null; onClose: () => void; onSaved: () => void }> = ({ existing, onClose, onSaved }) => {
  const [company, setCompany] = useState(existing?.company || '');
  const [role, setRole] = useState(existing?.role || '');
  const [jobText, setJobText] = useState('');
  const [body, setBody] = useState(existing?.body || '');
  const [feedback, setFeedback] = useState('');
  const [remember, setRemember] = useState(true);
  const [isFinal, setIsFinal] = useState(existing?.isFinal || false);
  const [busy, setBusy] = useState<'' | 'gen' | 'refine'>('');

  const generate = async () => {
    if (!company.trim() || !role.trim()) return;
    setBusy('gen');
    try { const { body: b } = await api().generateCoverLetter({ company: company.trim(), role: role.trim(), jobText: jobText.trim() || undefined }); setBody(b); }
    finally { setBusy(''); }
  };
  const refine = async () => {
    if (!body.trim() || !feedback.trim()) return;
    setBusy('refine');
    try {
      const { body: b } = await api().refineCoverLetter({ company: company.trim(), role: role.trim(), body, feedback: feedback.trim(), remember });
      setBody(b); setFeedback('');
    } finally { setBusy(''); }
  };
  const save = async () => {
    if (!company.trim() || !role.trim() || !body.trim()) return;
    await api().saveCoverLetter({ id: existing?.id, company: company.trim(), role: role.trim(), body, isFinal, jobUrl: existing?.jobUrl ?? null });
    onSaved();
  };

  return (
    <div style={{ display: 'grid', gap: 10, margin: '10px 0', padding: 14, border: '1px dashed var(--ink, rgba(0,0,0,.25))', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={input} placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
        <input style={input} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
      </div>
      <textarea style={{ ...input, minHeight: 56, resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Paste the job description (optional, makes tailoring sharper)" value={jobText} onChange={(e) => setJobText(e.target.value)} />
      <div>
        <button style={{ ...btn, fontWeight: 700 }} onClick={generate} disabled={busy !== '' || !company.trim() || !role.trim()}>
          <Wand2 size={14} /> {busy === 'gen' ? 'Writing…' : body ? 'Regenerate' : 'Draft with Claude'}
        </button>
        <span style={{ fontSize: 11, opacity: 0.5, marginLeft: 10 }}>or paste your own below</span>
      </div>

      <textarea style={{ ...input, minHeight: 200, resize: 'vertical', lineHeight: 1.55, fontFamily: 'inherit' }}
        placeholder="Your cover letter will appear here. You can edit it directly too." value={body} onChange={(e) => setBody(e.target.value)} />

      <div style={{ display: 'grid', gap: 6, padding: 10, border: '1px solid var(--ink, rgba(0,0,0,.12))', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Refine with feedback</div>
        <textarea style={{ ...input, minHeight: 48, resize: 'vertical', fontFamily: 'inherit' }}
          placeholder='e.g. "Less formal, cut the third paragraph, mention my volleyball app"' value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button style={btn} onClick={refine} disabled={busy !== '' || !body.trim() || !feedback.trim()}>{busy === 'refine' ? 'Refining…' : 'Refine'}</button>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember this feedback for future letters
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={{ ...btn, fontWeight: 700 }} onClick={save} disabled={!body.trim() || !company.trim() || !role.trim()}>Save to vault</button>
        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
          <input type="checkbox" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} /> Mark as final
        </label>
        <button style={{ ...btn, border: 'none', opacity: 0.6 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

// ── Answer bank ──────────────────────────────────────────────────────────────
// Compact, searchable answer bank: one-line rows, click a row to expand + edit.
const AnswerBankSection: React.FC<{ answers: AnswerBankEntry[]; reload: () => void }> = ({ answers, reload }) => {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [context, setContext] = useState('');

  const save = async () => {
    if (!label.trim() || !value.trim()) return;
    await api().upsertAnswer({ label: label.trim(), value: value.trim(), context: context.trim() || null, patterns: [] });
    setLabel(''); setValue(''); setContext(''); setAdding(false); reload();
  };

  const s = q.trim().toLowerCase();
  const filtered = !s ? answers : answers.filter((a) =>
    a.label.toLowerCase().includes(s) || (a.value || '').toLowerCase().includes(s) || (a.context || '').toLowerCase().includes(s));

  return (
    <section style={card}>
      <SectionHead icon={<Brain size={16} />} title="Answer bank" count={answers.length}
        action={<button style={btn} onClick={() => setAdding((v) => !v)}><Plus size={14} /> Add</button>} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid var(--ink, rgba(0,0,0,.18))', borderRadius: 8, padding: '6px 9px', margin: '8px 0' }}>
        <Search size={13} style={{ opacity: 0.5, flex: 'none' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search answers…"
          style={{ border: 'none', outline: 'none', background: 'none', color: 'var(--ink, inherit)', fontSize: 12, width: '100%' }} />
        {q && <span onClick={() => setQ('')} style={{ cursor: 'pointer', opacity: 0.5, fontSize: 12 }}>✕</span>}
      </div>

      {adding && (
        <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, border: '1px dashed var(--ink, rgba(0,0,0,.2))', borderRadius: 10 }}>
          <input style={input} placeholder='Label (e.g. "Legal name")' value={label} onChange={(e) => setLabel(e.target.value)} />
          <input style={input} placeholder='Value (e.g. your full legal name)' value={value} onChange={(e) => setValue(e.target.value)} />
          <input style={input} placeholder='When to use it (optional)' value={context} onChange={(e) => setContext(e.target.value)} />
          <div><button style={{ ...btn, fontWeight: 700 }} onClick={save}>Save</button></div>
        </div>
      )}

      {answers.length === 0 && <Empty>No saved answers yet. Add the questions you get asked a lot, and the extension reuses them.</Empty>}
      {answers.length > 0 && filtered.length === 0 && <div style={{ fontSize: 12, opacity: 0.5, padding: '8px 2px' }}>No matches for “{q}”.</div>}
      <div>{filtered.map((a) => <CompactAnswerRow key={a.id} a={a} reload={reload} />)}</div>
    </section>
  );
};

const CompactAnswerRow: React.FC<{ a: AnswerBankEntry; reload: () => void }> = ({ a, reload }) => {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const [label, setLabel] = useState(a.label);
  const [value, setValue] = useState(a.value);
  const [context, setContext] = useState(a.context || '');
  const saveEdit = async () => {
    if (!label.trim() || !value.trim()) return;
    await api().upsertAnswer({ id: a.id, label: label.trim(), value: value.trim(), context: context.trim() || null, patterns: a.patterns || [] });
    setOpen(false); reload();
  };
  const del = async (e: React.MouseEvent) => { e.stopPropagation(); await api().deleteAnswer(a.id); reload(); };
  return (
    <div style={{ borderTop: '1px solid var(--ink, rgba(0,0,0,.08))' }}>
      <div onClick={() => setOpen((v) => !v)} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', cursor: 'pointer', fontSize: 12 }}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.label}</span>
        {!open && <span style={{ color: 'var(--muted, #888)', maxWidth: 92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.value}</span>}
        <span onClick={del} title="Delete" style={{ opacity: hover ? 0.6 : 0, transition: 'opacity .12s', display: 'flex' }}><Trash2 size={13} /></span>
      </div>
      {open && (
        <div style={{ display: 'grid', gap: 6, padding: '2px 2px 10px' }}>
          <input style={input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
          <input style={input} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" />
          <input style={input} value={context} onChange={(e) => setContext(e.target.value)} placeholder="When to use it (optional)" />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btn, fontWeight: 700 }} onClick={saveEdit}><Check size={13} /> Save</button>
            <button style={{ ...btn, color: 'var(--muted,#888)' }} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Document locker ──────────────────────────────────────────────────────────
const DOC_TYPES: { tag: string; label: string; hint: string; single?: boolean }[] = [
  { tag: 'resume', label: 'Resume', hint: 'Your main CV. Claude grounds letters and answers in this, and the extension attaches it to resume uploads.', single: true },
  { tag: 'cover-letter', label: 'Cover-letter files', hint: 'Pre-written letters you already have. (The vault below drafts new ones with Claude.)' },
  { tag: 'transcript', label: 'Transcript', hint: 'Academic records, attached only when a form asks for one.', single: true },
  { tag: 'portfolio', label: 'Portfolio file', hint: 'A PDF portfolio. If yours is a live website, add it under Portfolio links instead.' },
  { tag: 'other', label: 'Other', hint: 'Anything else (references, certifications…).' },
];

const DocumentLockerSection: React.FC<{ docs: LockerDocument[]; reload: () => void }> = ({ docs, reload }) => {
  const [active, setActive] = useState(DOC_TYPES[0].tag);
  const activeType = DOC_TYPES.find((t) => t.tag === active) || DOC_TYPES[0];
  const activeDocs = docs.filter((d) => d.tags.includes(active));

  return (
    <section style={card}>
      <SectionHead icon={<FileText size={16} />} title="Document locker" count={docs.length} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0, marginBottom: 12 }}>
        Pick a topic, attach its files. A tick means that topic has something on file. The extension attaches the
        right one to each upload; everything persists between sessions.
      </p>

      {/* horizontal topic tabs - compact, with a tick when the topic has files */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {DOC_TYPES.map((t) => {
          const has = docs.some((d) => d.tags.includes(t.tag));
          const on = t.tag === active;
          return (
            <button key={t.tag} onClick={() => setActive(t.tag)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${on ? 'var(--accent, currentColor)' : 'var(--ink, rgba(0,0,0,.2))'}`,
                background: on ? 'var(--accent, rgba(0,0,0,.06))' : 'transparent',
                color: on ? 'var(--accent-ink, var(--ink, inherit))' : 'var(--ink, inherit)',
                opacity: on ? 1 : 0.7,
              }}>
              {t.label}
              {has && <Check size={13} style={{ color: 'var(--accent, #067647)' }} />}
            </button>
          );
        })}
      </div>

      <DocTypePanel type={activeType} docs={activeDocs} reload={reload} />
    </section>
  );
};

const DocTypePanel: React.FC<{ type: { tag: string; label: string; hint: string; single?: boolean }; docs: LockerDocument[]; reload: () => void }> = ({ type, docs, reload }) => {
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // clear any transient status when the active topic changes
  useEffect(() => { setStatus(null); }, [type.tag]);

  const attach = async () => {
    setStatus(null);
    const p = await api().pickDocument();
    if (!p) return; // cancelled
    setBusy(true);
    try {
      // single-file types (resume, transcript) replace the old file rather than stack.
      if (type.single) { for (const d of docs) await api().deleteDocument(d.id); }
      const name = p.split('/').pop() || type.label;
      await api().addDocument(name, p, [type.tag], true);
      setStatus({ kind: 'ok', msg: `${type.single && docs.length ? 'Replaced with' : 'Added'} ${name}` });
      reload();
    } catch (e: any) {
      setStatus({ kind: 'err', msg: 'Could not save: ' + (e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--ink, rgba(0,0,0,.12))', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{type.label}</span>
        {docs.length > 0
          ? <span style={{ ...tagChip, opacity: 1, borderColor: 'var(--accent, currentColor)' }}>{docs.length} on file</span>
          : <span style={{ fontSize: 11, opacity: 0.45 }}>empty</span>}
        <div style={{ flex: 1 }} />
        <button style={{ ...btn, padding: '5px 11px', fontSize: 12 }} onClick={attach} disabled={busy}>
          <Plus size={13} /> {busy ? 'Adding…' : docs.length ? (type.single ? 'Replace' : 'Add another') : 'Attach file'}
        </button>
      </div>

      <div style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>{type.hint}</div>

      {docs.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid var(--ink, rgba(0,0,0,.08))', marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>
          {d.isDefault && <span style={{ ...tagChip, opacity: 1, borderColor: 'var(--accent, currentColor)' }}>default</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, opacity: 0.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{d.filePath}</span>
          <button onClick={async () => { await api().deleteDocument(d.id); reload(); }} title="Remove"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.45, padding: 2 }}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      {status && (
        <div style={{ fontSize: 11, marginTop: 8, color: status.kind === 'ok' ? 'var(--accent, #067647)' : '#b42318' }}>
          {status.kind === 'ok' ? '✓ ' : '⚠ '}{status.msg}
        </div>
      )}
    </div>
  );
};

// ── Voice profile ────────────────────────────────────────────────────────────
const VoiceSection: React.FC<{ notes: VoiceNote[]; reload: () => void }> = ({ notes, reload }) => {
  const [kind, setKind] = useState<VoiceNoteKind>('style');
  const [note, setNote] = useState('');
  const KINDS: VoiceNoteKind[] = ['style', 'like', 'dislike'];
  const KindIcon: React.FC<{ k: VoiceNoteKind; size?: number }> = ({ k, size = 13 }) =>
    k === 'like' ? <ThumbsUp size={size} /> : k === 'dislike' ? <ThumbsDown size={size} /> : <PenLine size={size} />;

  const save = async () => {
    if (!note.trim()) return;
    await api().addVoiceNote(kind, note.trim()); setNote(''); reload();
  };

  return (
    <section style={card}>
      <SectionHead icon={<MessageSquareHeart size={16} />} title="Voice profile" count={notes.length} />
      <p style={{ fontSize: 12, opacity: 0.6, marginTop: 0 }}>
        How you want tailored answers + cover letters to sound. Grows from your feedback (like, dislike, or a style note).
      </p>

      <div style={{ display: 'grid', gap: 8, margin: '10px 0', padding: 12, border: '1px dashed var(--ink, rgba(0,0,0,.2))', borderRadius: 10 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {KINDS.map((k) => (
            <button key={k} onClick={() => setKind(k)}
              style={{ ...tagChip, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, opacity: kind === k ? 1 : 0.5 }}>
              <KindIcon k={k} size={12} /> {k}
            </button>
          ))}
        </div>
        <input style={input} placeholder='e.g. "Avoid corporate buzzwords; lead with concrete results"' value={note} onChange={(e) => setNote(e.target.value)} />
        <div><button style={{ ...btn, fontWeight: 700 }} onClick={save}>Add</button></div>
      </div>

      {notes.length === 0 && <Empty>No preferences yet. Add one, or like/dislike a generated answer later.</Empty>}
      {notes.map((n) => (
        <Row key={n.id} onDelete={async () => { await api().deleteVoiceNote(n.id); reload(); }}>
          <div style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ opacity: 0.6, flexShrink: 0 }}><KindIcon k={n.kind} /></span>{n.note}
          </div>
        </Row>
      ))}
    </section>
  );
};

// ── small shared bits ────────────────────────────────────────────────────────
const SectionHead: React.FC<{ icon: React.ReactNode; title: string; count: number; action?: React.ReactNode }> =
  ({ icon, title, count, action }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      {icon}
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
      <span style={{ fontSize: 12, opacity: 0.5 }}>({count})</span>
      <div style={{ flex: 1 }} />
      {action}
    </div>
  );

const Row: React.FC<{ children: React.ReactNode; onDelete: () => void }> = ({ children, onDelete }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderTop: '1px solid var(--ink, rgba(0,0,0,.08))' }}>
    <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    <button onClick={onDelete} title="Delete"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.45, padding: 2 }}>
      <Trash2 size={15} />
    </button>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, opacity: 0.5, padding: '10px 0' }}>{children}</div>
);
